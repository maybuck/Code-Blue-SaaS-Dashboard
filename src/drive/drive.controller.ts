import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { DriveService } from './drive.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard';

@Controller('drive')
@UseGuards(JwtAuthGuard)
export class DriveController {
  constructor(private readonly drive: DriveService) {}

  /** Whether the service account + Shared Drive are configured. */
  @Get('status')
  status() {
    return this.drive.isConnected();
  }

  /**
   * Upload a file to the Shared Drive (multipart/form-data, field "file").
   * Optional ?folderId= targets a specific folder; otherwise the root.
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
    @Query('folderId') folderId?: string,
  ) {
    const data = await this.drive.uploadFile(req.user.sub, file, folderId);
    return { success: true, message: 'File uploaded to Google Drive', data };
  }

  /** Delete a file from the Shared Drive (by Drive fileId). */
  @Delete(':fileId')
  remove(@Param('fileId') fileId: string, @Req() req: any) {
    return this.drive.deleteFile(req.user.sub, fileId);
  }
}
