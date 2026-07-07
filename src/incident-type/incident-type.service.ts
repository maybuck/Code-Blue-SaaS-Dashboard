import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIncidentTypeDto } from './dto/create-incident-type.dto';
import { UpdateIncidentTypeDto } from './dto/update-incident-type.dto';

@Injectable()
export class IncidentTypeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateIncidentTypeDto) {
    const existing = await this.prisma.incidentType.findFirst({
      where: {
        title: dto.title,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'An incident type with this title already exists.',
      );
    }

    const incidentType = await this.prisma.incidentType.create({
      data: dto,
    });

    return {
      message: 'Incident type created successfully.',
      data: incidentType,
    };
  }

  async findAll() {
    const incidentTypes = await this.prisma.incidentType.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Incident types retrieved successfully.',
      data: incidentTypes,
    };
  }

  async findOne(id: number) {
    const incidentType = await this.prisma.incidentType.findUnique({
      where: { id },
    });

    if (!incidentType) {
      throw new NotFoundException('Incident type not found.');
    }

    return {
      message: 'Incident type retrieved successfully.',
      data: incidentType,
    };
  }

  async update(id: number, dto: UpdateIncidentTypeDto) {
    await this.findOne(id);

    if (dto.title) {
      const existing = await this.prisma.incidentType.findFirst({
        where: {
          title: dto.title,
          NOT: {
            id,
          },
        },
      });

      if (existing) {
        throw new BadRequestException(
          'An incident type with this title already exists.',
        );
      }
    }

    const incidentType = await this.prisma.incidentType.update({
      where: { id },
      data: dto,
    });

    return {
      message: 'Incident type updated successfully.',
      data: incidentType,
    };
  }

  async remove(id: number) {
    await this.findOne(id);

    await this.prisma.incidentType.delete({
      where: { id },
    });

    return {
      message: 'Incident type deleted successfully.',
    };
  }
}