import { Module } from '@nestjs/common';
import { EditorTrackingService } from './editor-tracking.service';
import { EditorTrackingController } from './editor-tracking.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [EditorTrackingController],
  providers: [EditorTrackingService,PrismaService],
})
export class EditorTrackingModule {}
