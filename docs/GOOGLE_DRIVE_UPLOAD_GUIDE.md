# Google Drive Upload — Feature Guide

A complete, step-by-step reference for the Google Drive file-upload feature added to the SaaS backend. Covers what was built, how to configure Google Cloud, how the OAuth flow works, how to test every endpoint in Postman, and how to fix the errors commonly hit along the way.

---

## 1. What this feature does

The feature lets an authenticated API user upload files into **their own Google Drive** from this backend, in the same reusable "storage service" style an S3 integration would use. Each user connects their Drive once (Google OAuth2 consent), after which the backend can upload, list a connection status, and delete files on their behalf.

Key design choices:

- **OAuth2 (user's own Drive)** — files land in the end user's Drive, not a shared service account.
- **Generic upload endpoint** — no database schema changes; the upload endpoint returns the Drive file ID and link.
- **Least-privilege scope** — uses `drive.file`, so the app can only see/manage files it created, never the user's other Drive files.
- **Per-user token storage** — refresh tokens are persisted in a JSON file (`.drive-tokens.json`), swappable for a database store later.

---

## 2. Architecture

All new code lives under `src/drive/`.

| File | Responsibility |
|------|----------------|
| `drive.module.ts` | NestJS module wiring controller + providers. Registered in `app.module.ts`. |
| `drive.controller.ts` | HTTP endpoints: connect, status, callback, upload, delete. |
| `drive.service.ts` | Google OAuth2 client + Drive API calls (auth URL, token exchange, upload, delete). |
| `drive-token.store.ts` | Persists per-user OAuth tokens to `.drive-tokens.json`. |

### Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/drive/connect` | JWT | Returns the Google consent URL to start the OAuth flow. |
| GET | `/drive/callback` | Public | Google redirects here; exchanges the code and stores the user's refresh token. |
| GET | `/drive/status` | JWT | Returns `{ connected: true/false }` for the current user. |
| POST | `/drive/upload` | JWT | Uploads a `multipart/form-data` file (field `file`) to the user's Drive. Optional `?folderId=`. |
| DELETE | `/drive/:fileId` | JWT | Deletes a file (by Drive file ID) from the user's Drive. |

The callback is intentionally **public** (no JWT) because Google's browser redirect cannot send a bearer token. The user is identified via the `state` parameter, which carries the user ID.

---

## 3. Prerequisites

These packages are already installed in the project — no action needed:

- `googleapis` — official Google API client.
- `multer` + `@nestjs/platform-express` — multipart file handling.

You only need a Google account with access to the [Google Cloud Console](https://console.cloud.google.com/).

---

## 4. Google Cloud setup (one-time)

This is where most setup errors come from, so follow each step exactly.

### 4.1 Create / select a project

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. In the top project picker, create a new project (e.g. "CaseOps") or select an existing one.

### 4.2 Enable the Google Drive API

1. Go to **APIs & Services → Library**.
2. Search for **Google Drive API**.
3. Open it and click **Enable**.

### 4.3 Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** user type (unless you have a Google Workspace org and want Internal).
3. Fill in the app name (e.g. "CaseOps"), a support email, and a developer contact email.
4. On the **Scopes** step you can leave defaults; the app requests `drive.file` at runtime.
5. **Add test users** — under **Test users**, click **Add users** and add the exact Google account you will sign in with (e.g. `dev.user01234@gmail.com`). **This is required while the app is in Testing mode**, otherwise Google blocks sign-in with `access_denied`.
6. Save. You do **not** need to submit the app for verification for development — Testing mode supports up to 100 test users.

### 4.4 Create the OAuth client credentials

1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Under **Authorized redirect URIs**, add exactly:

   ```
   http://localhost:4000/drive/callback
   ```

   It must match the backend's `GOOGLE_REDIRECT_URI` byte-for-byte — same scheme (`http`), host, port (`4000`), and path, with **no trailing slash**.
5. Click **Create**, then copy the **Client ID** and **Client secret**.

---

## 5. Environment configuration

Add the real values from step 4.4 to your `.env` file (the keys were added during setup with placeholder values — replace them):

```
GOOGLE_CLIENT_ID=<your-real-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-real-secret>
GOOGLE_REDIRECT_URI=http://localhost:4000/drive/callback
```

> **Important:** environment variables are only read at startup. After editing `.env`, **restart the server**. If `/drive/connect` returns a URL whose `client_id` is still `your-client-id.apps.googleusercontent.com`, your `.env` still has the placeholder.

`.drive-tokens.json` (created automatically at runtime to store refresh tokens) is already gitignored — do not commit it.

---

## 6. Run the server

```
npm run start:dev
```

The server listens on `http://localhost:4000` (configurable via `PORT` in `.env`).

---

## 7. The end-to-end flow

1. **Connect** — the front-end (or you, during testing) calls `GET /drive/connect` with the user's JWT. The backend returns a Google consent URL containing the user ID in `state`.
2. **Consent** — the user opens that URL in a browser, selects their Google account, and approves the `drive.file` permission.
3. **Callback** — Google redirects to `GET /drive/callback?code=...&state=<userId>`. The backend exchanges the code for tokens and stores the refresh token against that user ID.
4. **Status** — `GET /drive/status` now returns `{ connected: true }` for that user.
5. **Upload** — `POST /drive/upload` with a file streams it to the user's Drive and returns the file's `id` and `webViewLink`.
6. **Delete** (optional) — `DELETE /drive/:fileId` removes a file.

The consent step (step 2) is inherently a browser action and cannot be performed inside Postman.

---

## 8. Testing in Postman

### 8.1 Log in to get a JWT

```
POST http://localhost:4000/auth/login
Body → raw → JSON:
{ "email": "you@example.com", "password": "yourpassword" }
```

Copy the token from the response. (Use `POST /auth/signup` first if you have no user.)

### 8.2 Set the token

For every `/drive/*` request except the callback: open the **Authorization** tab → Type **Bearer Token** → paste the token.

### 8.3 Get the consent URL

```
GET http://localhost:4000/drive/connect
Authorization: Bearer <token>
```

Response:

```json
{ "success": true, "url": "https://accounts.google.com/o/oauth2/v2/auth?..." }
```

Confirm the `url` contains your **real** client ID, not the placeholder.

### 8.4 Authorize (browser)

Copy the entire `url` value (no quotes, not truncated) and paste it into a browser. Approve access. You should land on "Google Drive connected successfully." This is one-time per user.

### 8.5 Confirm connection

```
GET http://localhost:4000/drive/status
Authorization: Bearer <token>
→ { "connected": true }
```

### 8.6 Upload a file (main test)

```
POST http://localhost:4000/drive/upload
Authorization: Bearer <token>
Body → form-data:
   Key: file   |   Type: File (dropdown on the right of the key field)   |   Value: choose a file
```

- Do **not** manually add a `Content-Type` header — let Postman set the multipart boundary.
- Optional: append `?folderId=<driveFolderId>` to drop the file into a specific Drive folder.

Response includes the Drive `id` and `webViewLink`; open the link to see the file in Drive.

### 8.7 Delete a file (optional)

```
DELETE http://localhost:4000/drive/<fileId>
Authorization: Bearer <token>
```

---

## 9. Troubleshooting

| Symptom (what you see) | Cause | Fix |
|------------------------|-------|-----|
| `Error 401: invalid_client` / "The OAuth client was not found" | `.env` still has the placeholder client ID/secret, or the server wasn't restarted after editing `.env`. | Put the real Client ID/Secret in `.env` and restart. Verify `/drive/connect` returns your real `client_id`. |
| `Error 403: access_denied` / "App has not completed the Google verification process" | App is in Testing mode and the signing-in account is not an approved test user. | Add that exact Google account under **OAuth consent screen → Test users**, then retry with a fresh consent URL. |
| Generic Google `400. That's an error. The request is malformed` (on accounts.google.com, before the consent screen) | The authorization URL was truncated, had quotes/extra characters, was hand-edited, or `redirect_uri` is empty/mismatched. | Re-call `/drive/connect` and paste the **entire** `url` fresh. Ensure `GOOGLE_REDIRECT_URI` exactly matches a registered redirect URI. |
| `redirect_uri_mismatch` | `GOOGLE_REDIRECT_URI` differs from the URI registered in the OAuth client (trailing slash, http vs https, wrong port). | Make both exactly `http://localhost:4000/drive/callback`. |
| `Multipart: Unexpected end of form` (400 on upload) | Postman body is malformed: a manual `Content-Type` header was added, the `file` key type is "Text" not "File", or no file attached. | In Body → form-data, set the `file` key type to **File** and attach a real file. Remove any manual `Content-Type` header. |
| `Google Drive is not connected for this user` (401 on upload) | No refresh token stored for this user ID (consent not completed). | Complete steps 8.3–8.4 for the same logged-in user. Tokens are stored per user ID. |
| `No refresh token returned by Google` | Google only returns a refresh token on first consent; a re-consent without forcing it returns none. | The app already forces `prompt=consent`. If it still happens, remove the app from your Google Account permissions (myaccount.google.com → Security → Third-party access) and connect again. |

---

## 10. Security & production notes

- **`state` hardening** — the OAuth `state` currently carries the raw user ID. In production, sign or encrypt it (e.g. a short-lived JWT) so a forged callback cannot bind tokens to another user.
- **Token storage** — `.drive-tokens.json` is fine for development. For production, move tokens into the database (the `DriveTokenStore` interface is intentionally narrow so it can be swapped without touching `DriveService`).
- **Redirect URI per environment** — register a separate redirect URI for each environment (local, staging, production) and set `GOOGLE_REDIRECT_URI` accordingly.
- **Publishing** — once ready for real users beyond test accounts, submit the app on the OAuth consent screen for Google verification (the `drive.file` scope is non-sensitive and usually straightforward).
- **File size limit** — the upload endpoint caps files at 25 MB; adjust the `limits.fileSize` value in the `FileInterceptor` config if needed.
