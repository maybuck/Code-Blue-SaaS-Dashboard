import { Module } from '@nestjs/common';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { PrismaService } from 'src/prisma/prisma.service';
// import { DriveModule } from 'src/drive/drive.module';

@Module({
  // imports: [DriveModule],
  controllers: [CasesController],
  providers: [CasesService, PrismaService],
})
export class CasesModule {}
