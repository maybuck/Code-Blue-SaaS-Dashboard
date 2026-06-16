import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

export interface CaseDriveFolders {
  folderId: string;
  folderUrl: string;
  reportsFolderId: string;
  reportsUrl: string;
  completedFolderId: string;
  completedUrl: string;
}

/**
 * Google Drive integration using a SERVICE ACCOUNT against a SHARED DRIVE.
 *
 * IMPORTANT: a service account has no storage quota of its own, so it can only
 * store files in a **Shared Drive** (a Google Workspace feature). The Shared
 * Drive owns the files; the service account just needs to be a member.
 *
 *   - GOOGLE_DRIVE_ROOT_FOLDER_ID must be a Shared Drive (or a folder inside one).
 *   - The service account email must be a member (Content manager) of it.
 *   - Every call passes supportsAllDrives / includeItemsFromAllDrives.
 *
 * This will NOT work against a personal "My Drive" folder.
 *
 * `userId` params are kept for caller compatibility / media attribution; they
 * are not used for Drive authentication.
 */
@Injectable()
export class DriveService {
  private driveClient(): drive_v3.Drive {
    const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!keyFile) {
      throw new InternalServerErrorException(
        'GOOGLE_SERVICE_ACCOUNT_KEY is not set.',
      );
    }
    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    return google.drive({ version: 'v3', auth });
  }

  private rootFolderId(): string {
    const id = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    if (!id) {
      throw new InternalServerErrorException(
        'GOOGLE_DRIVE_ROOT_FOLDER_ID is not set (must be a Shared Drive or a folder in one).',
      );
    }
    return id;
  }

  isConnected(_userId?: number): { connected: boolean } {
    return {
      connected:
        !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY &&
        !!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
    };
  }

  /** Find or create a folder by name under a parent (Shared Drive aware). */
  private async findOrCreateFolder(
    drive: drive_v3.Drive,
    name: string,
    parentId: string,
  ): Promise<{ id: string; url: string }> {
    const safeName = name.replace(/['\\\n\r]/g, ' ').trim() || 'Untitled';

    const existing = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and '${parentId}' in parents and trashed=false`,
      fields: 'files(id,webViewLink)',
      spaces: 'drive',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    if (existing.data.files?.length) {
      const f = existing.data.files[0];
      return { id: f.id!, url: f.webViewLink ?? '' };
    }

    const created = await drive.files.create({
      requestBody: {
        name: safeName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id,webViewLink',
      supportsAllDrives: true,
    });

    if (!created.data.id) {
      throw new InternalServerErrorException('Failed to create Drive folder.');
    }
    return { id: created.data.id, url: created.data.webViewLink ?? '' };
  }

  /**
   * Ensure a case's folder tree exists under the Shared Drive root and return
   * links: <root>/<label>/Reports and /CompletedRequests
   */
  async getOrCreateCaseFolders(
    _userId: number,
    label: string,
  ): Promise<CaseDriveFolders> {
    const drive = this.driveClient();
    const rootId = this.rootFolderId();

    const caseFolder = await this.findOrCreateFolder(drive, label, rootId);
    const reports = await this.findOrCreateFolder(
      drive,
      'Reports',
      caseFolder.id,
    );
    const completed = await this.findOrCreateFolder(
      drive,
      'CompletedRequests',
      caseFolder.id,
    );

    return {
      folderId: caseFolder.id,
      folderUrl: caseFolder.url,
      reportsFolderId: reports.id,
      reportsUrl: reports.url,
      completedFolderId: completed.id,
      completedUrl: completed.url,
    };
  }

  /**
   * Upload a file into the Shared Drive. If `folderId` is given the file lands
   * there (e.g. a case's Reports folder); otherwise it goes to the root.
   */
  async uploadFile(
    _userId: number,
    file: Express.Multer.File,
    folderId?: string,
  ): Promise<drive_v3.Schema$File> {
    if (!file) {
      throw new BadRequestException(
        'No file provided. Use multipart/form-data with field "file".',
      );
    }

    const drive = this.driveClient();
    const parent = folderId ?? this.rootFolderId();

    const body = Readable.from(file.buffer);
    body.on('error', () => {
      /* swallowed; the files.create promise below rejects with the real error */
    });

    try {
      const res = await drive.files.create({
        requestBody: {
          name: file.originalname,
          parents: [parent],
        },
        media: {
          mimeType: file.mimetype,
          body,
        },
        fields: 'id, name, mimeType, size, webViewLink, webContentLink',
        supportsAllDrives: true,
      });
      return res.data;
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Google Drive upload failed: ${err?.message ?? 'unknown error'}`,
      );
    }
  }

  /** Delete a file from the Shared Drive. */
  async deleteFile(
    _userId: number,
    fileId: string,
  ): Promise<{ deleted: boolean; fileId: string }> {
    const drive = this.driveClient();
    await drive.files.delete({ fileId, supportsAllDrives: true });
    return { deleted: true, fileId };
  }
}
