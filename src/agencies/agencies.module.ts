import { Module } from '@nestjs/common';
import { AgenciesService } from './agencies.service';
import { AgenciesController } from './agencies.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [AgenciesController],
  providers: [AgenciesService, PrismaService],
})
export class AgenciesModule {}
