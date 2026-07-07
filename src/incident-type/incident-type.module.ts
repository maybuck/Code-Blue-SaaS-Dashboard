import { Module } from '@nestjs/common';
import { IncidentTypeService } from './incident-type.service';
import { IncidentTypeController } from './incident-type.controller';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [IncidentTypeController],
  providers: [IncidentTypeService,PrismaService],
})
export class IncidentTypeModule {}
