import { BadRequestException, Controller, Get, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

@Controller()
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('upload/file')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    const mediaUrl = await this.uploadService.uploadFileToS3(file);
    return { mediaUrl };
  }


  // @Get('file/read')
  // async getSignedUrl(@Query('fileKey') fileKey: string) {
  //   if (!fileKey) throw new BadRequestException('fileKey query param is required');

  //   const downloadUrl = await this.uploadService.getSignedUrl(fileKey, 300);
  //   return { success: true, downloadUrl };
  // }


  @Get('file/read')
async getFile(
  @Query('fileKey') fileKey: string,
  @Query('download') download?: string,
) {
  const url = await this.uploadService.getSignedUrl(
    fileKey,
    download === 'true',
  );

  return {
    success: true,
    url,
  };
}

}
