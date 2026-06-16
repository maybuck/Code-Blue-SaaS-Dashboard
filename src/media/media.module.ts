import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { DriveModule } from 'src/drive/drive.module';

@Module({
  imports: [DriveModule],
  controllers: [MediaController],
  providers: [MediaService, PrismaService],
})
export class MediaModule {}
