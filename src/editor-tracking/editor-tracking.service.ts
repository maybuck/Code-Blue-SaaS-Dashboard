import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEditorTrackingDto } from './dto/create-editor-tracking.dto';
import { UpdateEditorTrackingDto } from './dto/update-editor-tracking.dto';

@Injectable()
export class EditorTrackingService {
  constructor(private prisma: PrismaService) {}

  // Reusable include
  private include = {
    case: {
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    },
    writer: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    },
    editor: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    },
    editorStatus: true,
  };

  // CREATE
  async create(dto: CreateEditorTrackingDto) {
    // 1. Prevent duplicate tracking per case
    const existing = await this.prisma.editorTracking.findUnique({
      where: { caseId: dto.caseId },
    });

    if (existing) {
      throw new BadRequestException('Tracking already exists for this case.');
    }

    // 2. Validate writer (roleId = 5)
    if (dto.writerId) {
      const writer = await this.prisma.user.findFirst({
        where: {
          id: dto.writerId,
          roleId: 5,
        },
      });

      if (!writer) {
        throw new BadRequestException('Selected user is not a valid Writer.');
      }
    }

    // 3. Validate editor (roleId = 6)
    if (dto.editorId) {
      const editor = await this.prisma.user.findFirst({
        where: {
          id: dto.editorId,
          roleId: 6,
        },
      });

      if (!editor) {
        throw new BadRequestException('Selected user is not a valid Editor.');
      }
    }

    return this.prisma.editorTracking.create({
      data: dto,
      include: this.include,
    });
  }

  // FIND ALL
  findAll() {
    return this.prisma.editorTracking.findMany({
      include: this.include,
    });
  }

  // FIND ONE
  async findOne(id: number) {
    const tracking = await this.prisma.editorTracking.findUnique({
      where: { id },
      include: this.include,
    });

    if (!tracking) {
      throw new NotFoundException('Tracking not found');
    }

    return tracking;
  }

  // UPDATE
  async update(id: number, dto: UpdateEditorTrackingDto) {
    await this.findOne(id);

    if (dto.writerId) {
      const writer = await this.prisma.user.findFirst({
        where: {
          id: dto.writerId,
          roleId: 5,
        },
      });

      if (!writer) {
        throw new BadRequestException('Selected user is not a valid Writer.');
      }
    }

    if (dto.editorId) {
      const editor = await this.prisma.user.findFirst({
        where: {
          id: dto.editorId,
          roleId: 6,
        },
      });

      if (!editor) {
        throw new BadRequestException('Selected user is not a valid Editor.');
      }
    }

    return this.prisma.editorTracking.update({
      where: { id },
      data: dto,
      include: this.include,
    });
  }

  // DELETE
  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.editorTracking.delete({
      where: { id },
    });
  }
}