# Google Drive Upload Integration — Technical Proposal

**Project:** SaaS Management API (NestJS backend)
**Feature:** Per-user Google Drive file upload, with media records linked to cases
**Date:** June 2026
**Status:** Implemented (research preview), pending production hardening

---

## 1. Executive summary

This proposal describes how the application integrates Google Drive as the file-storage backend for case media. Files are uploaded into **each end user's own Google Drive** using OAuth2, and a database record of each file (its link) is stored against a case. The design deliberately separates three concerns:

1. **Authorization** — connecting a user's Google account (OAuth2 consent).
2. **Storage** — uploading/deleting the actual bytes in Drive (the Drive module).
3. **Persistence** — recording the file's link against a case in the database (the Media module).

This separation keeps the upload mechanism independent of business data, makes each piece independently testable, and lets us swap the storage provider later without touching case logic.

The OAuth2 model was chosen over a service account because the application targets **personal Gmail accounts**. A Google service account has no Drive storage quota of its own and cannot store uploaded files without a Google Workspace Shared Drive or domain-wide delegation — neither of which is available on personal Gmail. With OAuth2, the file is owned by the user, who has storage quota.

---

## 2. Goals and non-goals

**Goals**

- Allow an authenticated app user to connect their Google Drive once and upload files to it.
- Store a durable reference (link) to each uploaded file against a specific case.
- Provide a clean, separate API to list, fetch, and delete those media records.
- Never crash the server on a failed upload; always return a structured error.
- Use least-privilege Google permissions.

**Non-goals (this phase)**

- Hosting files on the app's own infrastructure (S3/GCS).
- Public/anonymous file sharing by default.
- Google Workspace Shared Drive support (can be added if the org moves to Workspace).
- Virus scanning / content moderation of uploads.

---

## 3. Architecture overview

The feature is composed of two NestJS modules plus a token store, all behind the app's existing JWT auth.

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `DriveModule` | `src/drive/` | OAuth2 connect flow + Drive file operations (upload/delete). Storage-only, no DB. |
| `DriveService` | `src/drive/drive.service.ts` | Builds the consent URL, exchanges the code, and calls the Drive API as the user. |
| `DriveTokenStore` | `src/drive/drive-token.store.ts` | Persists per-user OAuth refresh tokens (JSON file today, DB later). |
| `DriveController` | `src/drive/drive.controller.ts` | HTTP endpoints: connect, status, callback, upload, delete. |
| `MediaModule` | `src/media/` | Owns media records in the database (decoupled from upload). |
| `MediaService` | `src/media/media.service.ts` | Create/list/get/delete media rows in `case_activities`. |
| `MediaController` | `src/media/media.controller.ts` | HTTP endpoints under `/media`. |

**Responsibility boundary:** `DriveService` knows nothing about the database; `MediaService` knows nothing about Google's API internals (it only asks `DriveService` to delete a file when needed). This is the key to "integrating it perfectly" — each layer can change independently.

---

## 4. Google Cloud setup and permissions

This is a one-time configuration in the [Google Cloud Console](https://console.cloud.google.com/), and the most common source of integration errors.

### 4.1 Project and API

1. Create or select a Google Cloud **project**.
2. **APIs & Services → Library →** enable the **Google Drive API**.

### 4.2 OAuth consent screen

1. **APIs & Services → OAuth consent screen.**
2. User type **External** (or Internal for a Workspace org).
3. Set app name, support email, developer contact.
4. **Test users:** while the app is unverified it runs in **Testing** mode and only approved accounts can sign in. Add every Google account that will connect (development testers). Up to 100 test users are allowed without verification.

### 4.3 OAuth scope and permission model

The app requests a single scope:

```
https://www.googleapis.com/auth/drive.file
```

`drive.file` is **least privilege**: the app can only see and manage files **it created**. It cannot read or touch the user's other Drive files. This is the safest scope for an upload feature and the easiest to get verified by Google later. The consequence is intentional: listing via the Drive API only ever returns app-created files, which is exactly what we want.

### 4.4 OAuth client credentials

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID.**
2. Application type **Web application**.
3. **Authorized redirect URIs** — add the backend callback **exactly**:

   ```
   http://localhost:4000/drive/callback        (development)
   https://api.yourdomain.com/drive/callback    (production)
   ```

   It must match the backend's `GOOGLE_REDIRECT_URI` byte-for-byte (scheme, host, port, path, no trailing slash). Register one redirect URI per environment.
4. Copy the **Client ID** and **Client secret**.

### 4.5 Why not a service account

A service account is attractive because it needs no user consent, but it has **no Drive storage quota**. Uploading file bytes makes the service account the file owner, which fails with `403 Service Accounts do not have storage quota`. The only supported workarounds — a Workspace **Shared Drive** (`supportsAllDrives`) or **domain-wide delegation** (`subject` impersonation) — both require Google Workspace. For personal Gmail, OAuth2 is the correct and only viable model.

---

## 5. Configuration (environment variables)

| Variable | Example | Notes |
|----------|---------|-------|
| `GOOGLE_CLIENT_ID` | `7341...apps.googleusercontent.com` | From the OAuth client. |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | Keep secret; rotate if leaked. |
| `GOOGLE_REDIRECT_URI` | `http://localhost:4000/drive/callback` | Must match a registered redirect URI exactly. |

Notes:
- Environment variables are read **at startup** — restart the server after changing `.env`.
- `.drive-tokens.json` (the token store) is created at runtime and is gitignored. Never commit it.
- Treat the client secret like a password. If it has ever been shared, rotate it in the Console.

---

## 6. The connect / consent flow (authorization)

Connecting a user's Drive is a standard OAuth2 authorization-code flow. The user does it **once**; afterward the backend holds a refresh token and can upload on their behalf indefinitely (until they revoke access).

### 6.1 Sequence

```
Frontend            Backend (/drive)             Google
   |   GET /drive/connect  |                         |
   |---------------------->| getAuthUrl(userId)      |
   |   { url }             |                         |
   |<----------------------|                         |
   |   open url in browser ------------------------->|  consent screen
   |                       |   redirect with ?code&state                 |
   |                       |<----------------------------------- (browser)|
   |          GET /drive/callback?code=..&state=userId               |
   |                       | exchange code -> tokens |
   |                       | store refresh token     |
   |   "connected" page    |                         |
   |<----------------------|                         |
```

### 6.2 Step-by-step

1. **`GET /drive/connect`** (JWT-protected). The backend builds a Google consent URL with `access_type=offline` (to get a refresh token), `prompt=consent`, the `drive.file` scope, and `state = userId`. It returns `{ url }`.
2. The frontend redirects the user (or opens a popup) to that `url`.
3. The user picks their Google account and approves.
4. Google redirects to **`GET /drive/callback?code=...&state=<userId>`**. This endpoint is **public** — Google's browser redirect cannot carry a JWT — so the user is identified via the signed-in `state` value.
5. The backend exchanges the `code` for tokens, persists the **refresh token** keyed by `userId`, and shows a success page.
6. **`GET /drive/status`** returns `{ connected: true }` thereafter.

### 6.3 Token handling

- The **refresh token** is the durable credential and is only returned by Google on the **first** consent — hence `prompt=consent` to force it. It is stored per user.
- **Access tokens** (short-lived) are refreshed automatically by the Google client; the store is updated transparently on each refresh.
- Tokens live in `DriveTokenStore`. Today that is a JSON file; the interface (`get`/`set`/`remove`) is intentionally minimal so it can be swapped for a database table in production without changing `DriveService`.

---

## 7. API reference

All endpoints require a Bearer JWT except the OAuth callback.

### 7.1 Drive (authorization + storage)

| Method | Path | Body / Params | Description |
|--------|------|---------------|-------------|
| GET | `/drive/connect` | — | Returns `{ success, url }` — the Google consent URL. |
| GET | `/drive/status` | — | `{ connected: boolean }` for the current user. |
| GET | `/drive/callback` | `?code&state` | **Public.** OAuth redirect target; stores the refresh token. |
| POST | `/drive/upload` | `multipart/form-data`, field `file` | Uploads to the user's Drive; returns Drive metadata (id, name, mimeType, size, `webViewLink`, `webContentLink`). **No DB write.** |
| DELETE | `/drive/:fileId` | — | Deletes a file from the user's Drive by Drive file ID. |

**Upload response example:**

```json
{
  "success": true,
  "message": "File uploaded to Google Drive",
  "data": {
    "id": "1P0HpQ...",
    "name": "report.pdf",
    "mimeType": "application/pdf",
    "size": "20480",
    "webViewLink": "https://drive.google.com/file/d/1P0HpQ.../view?usp=drivesdk",
    "webContentLink": "https://drive.google.com/uc?id=1P0HpQ...&export=download"
  }
}
```

### 7.2 Media (database records)

Media records live in the existing `case_activities` table (`message` = the file link). Media rows are identified by a link-style message, so the free-form `type` value does not affect listing.

| Method | Path | Body / Params | Description |
|--------|------|---------------|-------------|
| POST | `/media` | `{ caseId, message, type? }` | Persists a file link against a case. `userId` comes from the JWT. `type` defaults to `MEDIA`. Returns the created row. |
| GET | `/media/case/:caseId` | — | Lists the case's media rows (messages starting with `http`). |
| GET | `/media/:id` | — | Single media row. |
| DELETE | `/media/:id` | — | Deletes the DB row and best-effort deletes the Drive file (parses the fileId from the stored link). Returns `{ deleted, id, driveDeleted }`. |

**Create request / response:**

```json
// POST /media
{ "caseId": 5, "message": "https://drive.google.com/file/d/1P0HpQ.../view", "type": "PNG" }

// 201
{ "id": 12, "caseId": 5, "userId": 1, "type": "PNG",
  "message": "https://drive.google.com/file/d/1P0HpQ.../view",
  "createdAt": "2026-06-10T16:00:00.000Z" }
```

---

## 8. End-to-end usage flow

1. **Connect (once):** `GET /drive/connect` → open URL → consent → `GET /drive/status` returns connected.
2. **Upload:** `POST /drive/upload` with the file → receive `webViewLink`.
3. **Persist:** `POST /media` with `{ caseId, message: webViewLink }` → the link is stored against the case.
4. **List:** `GET /media/case/:caseId` → all media for the case, in the `case_activities` row format.
5. **Delete:** `DELETE /media/:id` → removes the DB record and the Drive file.

Upload and persistence are separate calls by design, so the frontend can, for example, upload several files and then persist them in one batch, or attach metadata before saving.

---

## 9. Frontend integration guidance

- **Connect UX:** show a "Connect Google Drive" button that calls `GET /drive/connect`, then redirects to `url` (full-page redirect or a popup window). After the callback success page, poll or call `GET /drive/status` to update the UI.
- **One-time per user:** check `GET /drive/status` on the relevant screen; only show the connect button when `connected` is false.
- **Upload:** send `multipart/form-data` with the field named exactly `file`; do not set `Content-Type` manually (let the browser set the multipart boundary).
- **Two-step save:** after a successful upload, immediately call `POST /media` with the returned `webViewLink` and the `caseId`.
- **Link behavior:** `webViewLink` opens in Drive and is private to the owner by default. If links must open for other users, add a "make public" step (see §12).

---

## 10. Data model

No schema migration was required. Media is stored in the existing `CaseActivity` model:

```prisma
model CaseActivity {
  id        Int      @id @default(autoincrement())
  caseId    Int
  case      Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
  userId    Int?
  user      User?    @relation(fields: [userId], references: [id])
  type      String
  message   String   @db.Text
  createdAt DateTime @default(now())
  @@map("case_activities")
}
```

A media record is an activity row with `message` = the Drive link. If richer metadata (file name, size, mimeType, fileId) becomes necessary, the recommended evolution is a dedicated `Media` table — see §12.

---

## 11. Security, reliability, and error handling

- **Least-privilege scope** (`drive.file`): the app can never read the user's unrelated Drive files.
- **JWT on every endpoint** except the OAuth callback, which is public by necessity and validated via `state`.
- **Crash safety:** the upload streams the file buffer to Drive. The body stream has an explicit `error` handler and the API call is wrapped in try/catch, so a failed upload returns a clean `500` instead of an unhandled stream `error` that would terminate the process.
- **Input validation:** `POST /media` uses a DTO with a whitelist validation pipe, so unknown body fields (including a spoofed `userId`) are stripped; `caseId` and `message` are validated.
- **Foreign-key safety:** creating media verifies the case exists first and returns `404` rather than letting a DB foreign-key error surface.
- **Token storage:** refresh tokens are sensitive. The JSON-file store is acceptable for development; production should encrypt-at-rest or move to a DB table (see §12).
- **Secret hygiene:** client secret and tokens must never be committed or logged. Rotate any leaked credential immediately.

**Known error conditions and responses**

| Condition | Result |
|-----------|--------|
| Drive not connected | `401` "Google Drive is not connected…" |
| Missing/empty file | `400` "No file provided…" |
| `caseId` not found | `404` "Case … not found." |
| Drive API failure (quota, network) | `500` "Google Drive upload failed: …" |
| OAuth `invalid_client` | Placeholder/incorrect client ID — fix `.env`, restart. |
| OAuth `access_denied` | Account not in Test users — add it on the consent screen. |

---

## 12. Hardening and future enhancements

Recommended before/after production launch, roughly in priority order:

1. **Database-backed token store.** Replace the JSON file with an encrypted DB table keyed by user. Swappable behind the existing `DriveTokenStore` interface.
2. **Signed OAuth `state`.** Today `state` carries the raw user ID. Use a short-lived signed token (e.g., a JWT) so a forged callback cannot bind tokens to another user.
3. **Dedicated `Media` table.** If file metadata (name, size, mimeType, fileId, public flag) is needed, move off `case_activities` to a purpose-built model — cleaner queries and a stored fileId for reliable deletion.
4. **Public-link option.** Add a `drive.permissions.create` step (`role: reader, type: anyone`) to make links openable by anyone, controlled per upload.
5. **Direct-download links.** Surface `webContentLink` for downloads alongside `webViewLink`.
6. **Per-environment redirect URIs** and OAuth verification submission once moving beyond test users.
7. **Upload constraints.** Configurable size limit (currently 25 MB), allowed MIME types, and optional virus scanning.
8. **Observability.** Structured logging and metrics around connect success rate, upload latency, and error categories.

---

## 13. Testing

- **Connect flow:** verify `GET /drive/connect` returns a URL containing the real client ID; complete consent in a browser; confirm `GET /drive/status` → connected.
- **Upload:** `POST /drive/upload` with `form-data` field `file`; confirm `webViewLink` opens the file in the owner's Drive.
- **Persist + list:** `POST /media`, then `GET /media/case/:caseId` returns the row.
- **Delete:** `DELETE /media/:id` returns `{ deleted: true }` and the file disappears from Drive.
- **Negative cases:** unconnected user (401), missing file (400), bad `caseId` (404), malformed multipart (400).
- A Postman collection covering all endpoints can be provided to accelerate QA.

---

## 14. Rollout plan

1. **Dev:** configure OAuth client with `localhost` redirect, add testers, validate the full flow.
2. **Staging:** register a staging redirect URI, point `GOOGLE_REDIRECT_URI` at it, run QA against the Postman collection.
3. **Production prep:** implement the DB token store and signed state (§12 items 1–2), submit OAuth verification if onboarding real users beyond testers.
4. **Production:** register the production redirect URI, deploy, monitor connect/upload metrics.

---

## 14a. R16 — Case folder linking (Drive panel)

Beyond per-file upload, the product requires that **each case links to a Google Drive folder**, surfaced as a one-click "Google Drive panel" on the Case Detail screen — removing manual hunting through Drive. This maps to Process ③–④ (Request media → Complete → archive).

**Folder structure** (provisioned automatically in the connected user's Drive):

```
Saas-Backend-Uploads/
  <Suspect> - <caseNumber>/
    Reports/
    CompletedRequests/
```

The case folder is named `"<suspectName> - <caseNumber>"` (falls back to `"Unknown - <caseNumber>"` when no suspect), which is human-readable and unique because `caseNumber` is unique.

**Persistence:** the folder ids and links are stored on the `Case` (`driveFolderId`, `driveReportsFolderId`, `driveCompletedFolderId`, `driveReportsUrl`, `driveCompletedUrl`), so the Case Detail panel reads them directly with no extra Drive call.

**Status → active folder (Process ③–④):** the Drive panel's primary link follows the case status — `COMPLETED` points to `CompletedRequests`, every other status points to `Reports`. The case state machine itself (`REPORT_REQUESTED → … → MEDIA_REQUESTED → COMPLETED` + `dateCompleted`) is unchanged and driven by the existing `PATCH /cases/:id`.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/cases/:id/drive/link` | Find-or-create the case's folder tree, persist the links on the case, and return `{ folderUrl, reportsUrl, completedUrl, activeUrl }`. Requires `case.update.*`. |
| GET | `/cases/:id` | Now returns the stored `drive*Url` fields plus a computed `activeDriveUrl` for the panel. |
| POST | `/drive/upload?folderId=<id>` | Optional `folderId` routes the upload straight into the case's Reports/Completed folder. |

**Frontend flow:** on Case Detail, if `driveReportsUrl` is empty, show a "Link Drive folder" action that calls `POST /cases/:id/drive/link`; thereafter the Google Drive card links to `activeDriveUrl` (and can offer both Reports and CompletedRequests). Uploads from the case can pass the matching `folderId` so files land in the right place.

**Requirement coverage after this change:**

| Requirement | Status |
|-------------|--------|
| Process ③–④ status flow (Media Requested → Completed + date) | ✅ existing case status + `dateCompleted` |
| Drive panel shows a folder link on Case Detail | ✅ `drive*Url` on case + `activeDriveUrl` |
| R16 one-click to suspect's Reports / CompletedRequests folder | ✅ `POST /cases/:id/drive/link` provisions + persists |
| Uploads land in the case's correct folder | ✅ `POST /drive/upload?folderId=` |

### Migration

Persisting folder links adds columns to the `Case` model, so run a migration on your machine:

```bash
npx prisma migrate dev --name add_case_drive_folders
npx prisma generate
```

(The schema change is already applied in `prisma/schema.prisma`. The sandbox cannot run the migration or regenerate the client offline, so the Cases code that references the new columns will type-check only after you run these two commands.)

---

## 15. Summary

The integration cleanly separates authorization, storage, and persistence; uses the correct OAuth2 model for personal Gmail accounts; requests least-privilege permissions; and is crash-safe. The connect flow is a standard one-time OAuth consent, after which uploads are transparent. The remaining work to make it production-perfect is well-scoped (token store, signed state, optional dedicated media table and public links) and does not require rearchitecting — each item slots behind an existing boundary.
