import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCaseMediaDto } from './dto/create-case-media.dto';
import { UpdateCaseMediaDto } from './dto/update-case-media.dto';

@Injectable()
export class CaseMediaService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCaseMediaDto) {
    const media = await this.prisma.caseMedia.create({
      data: dto,
    });

    return {
      success: true,
      message: 'Case media uploaded successfully',
      data: media,
    };
  }

  async findAll() {
    const media = await this.prisma.caseMedia.findMany({
      include: {
        case: true,
        uploadedBy: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      success: true,
      message: 'Case media fetched successfully',
      data: media,
    };
  }

  async findOne(id: number) {
    const media = await this.prisma.caseMedia.findUnique({
      where: { id },
      include: {
        case: true,
        uploadedBy: true,
      },
    });

    if (!media) {
      throw new NotFoundException('Case media not found');
    }

    return {
      success: true,
      message: 'Case media fetched successfully',
      data: media,
    };
  }

  async findByCase(caseId: number) {
    const media = await this.prisma.caseMedia.findMany({
      where: { caseId },
      include: {
        uploadedBy: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      success: true,
      message: 'Case media for case fetched successfully',
      data: media,
    };
  }

  async update(id: number, dto: UpdateCaseMediaDto) {
    await this.findOne(id);

    const media = await this.prisma.caseMedia.update({
      where: { id },
      data: dto,
    });

    return {
      success: true,
      message: 'Case media updated successfully',
      data: media,
    };
  }

  async remove(id: number) {
    await this.findOne(id);

    await this.prisma.caseMedia.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Case media deleted successfully',
    };
  }
}