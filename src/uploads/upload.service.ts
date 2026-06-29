import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class UploadService {
  private s3: S3Client;
  private bucketName: string;

  constructor() {
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const bucketName = process.env.AWS_S3_BUCKET;

    if (!region || !accessKeyId || !secretAccessKey || !bucketName) {
      throw new Error('AWS credentials or bucket/region not set in environment variables');
    }

    this.bucketName = bucketName;

    this.s3 = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  // async uploadFileToS3(file: Express.Multer.File): Promise<string> {
  //   if (!file) throw new BadRequestException('No file provided');

  //   const mimetype = file.mimetype;
  //   let folder: string;
  //   let forceDownload = false;

  //   if (mimetype.startsWith('image/')) {
  //     folder = 'images';
  //   } else if (mimetype.startsWith('video/')) {
  //     folder = 'videos';
  //   } else if (mimetype === 'text/csv' || mimetype === 'application/vnd.ms-excel') {
  //     folder = 'csv';
  //     forceDownload = true;
  //   } else if (mimetype === 'application/pdf') {
  //     folder = 'documents';
  //   } else if (
  //     mimetype === 'application/msword' ||
  //     mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  //   ) {
  //     folder = 'documents';
  //     forceDownload = true;
  //   } else {
  //     throw new BadRequestException('Unsupported file type');
  //   }

  //   const fileKey = `${folder}/${Date.now()}-${randomUUID()}-${file.originalname}`;

  //   try {
  //     await this.s3.send(
  //       new PutObjectCommand({
  //         Bucket: this.bucketName,
  //         Key: fileKey,
  //         Body: file.buffer,
  //         ContentType: mimetype,
  //         ContentDisposition: forceDownload ? 'attachment' : 'inline',
  //       }),
  //     );

  //     // Public URL for images
  //     if (mimetype.startsWith('image/')) {
  //       return `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
  //     }

  //     // Return fileKey for other file types (use signed URL for access)
  //     return fileKey;
  //   } catch (error: any) {
  //     throw new InternalServerErrorException('Upload failed: ' + error.message);
  //   }
  // }

  async uploadFileToS3(file: Express.Multer.File): Promise<string> {
  if (!file) throw new BadRequestException('No file provided');

  const mimetype = file.mimetype;
  let folder: string;
  let forceDownload = false;

  if (mimetype.startsWith('image/')) {
    folder = 'images';
  } else if (mimetype.startsWith('video/')) {
    folder = 'videos';
  } else if (
    mimetype === 'text/csv' ||
    mimetype === 'application/vnd.ms-excel'
  ) {
    folder = 'csv';
    forceDownload = true;
  } else if (mimetype === 'application/pdf') {
    folder = 'documents';
  } else if (
    mimetype === 'application/msword' ||
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    folder = 'documents';
    forceDownload = true;
  } else if (
    mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // <-- XLSX
  ) {
    folder = 'excel';
    forceDownload = true;
  } else {
    throw new BadRequestException('Unsupported file type');
  }

  const fileKey = `${folder}/${Date.now()}-${randomUUID()}-${file.originalname}`;

  try {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        Body: file.buffer,
        ContentType: mimetype,
        ContentDisposition: forceDownload ? 'attachment' : 'inline',
      }),
    );

    if (mimetype.startsWith('image/')) {
      return `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
    }

    return fileKey;
  } catch (error: any) {
    throw new InternalServerErrorException('Upload failed: ' + error.message);
  }
}


//  async getSignedUrl(fileKey: string, expiresIn = 300): Promise<string> {
//   if (!fileKey) {
//     throw new BadRequestException('Invalid file key');
//   }

//   const originalFileName = fileKey.split('-').slice(6).join('-');

//   const command = new GetObjectCommand({
//     Bucket: this.bucketName,
//     Key: fileKey,
//     ResponseContentDisposition: `attachment; filename="${originalFileName}"`,
//   });

//   const url = await awsGetSignedUrl(this.s3, command, {
//     expiresIn,
//   });

//   return url;
// }

async getSignedUrl(
  fileKey: string,
  download = false,
  expiresIn = 300,
): Promise<string> {
  if (!fileKey) {
    throw new BadRequestException('Invalid file key');
  }

  const fileName = fileKey.split('/').pop() ?? 'file';

  const command = new GetObjectCommand({
    Bucket: this.bucketName,
    Key: fileKey,
    ResponseContentDisposition: download
      ? `attachment; filename="${fileName}"`
      : `inline; filename="${fileName}"`,
  });

  return await awsGetSignedUrl(this.s3, command, {
    expiresIn,
  });
}

}

