import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEditorTrackingDto } from './dto/create-editor-tracking.dto';
import { UpdateEditorTrackingDto } from './dto/update-editor-tracking.dto';

@Injectable()
export class EditorTrackingService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateEditorTrackingDto) {
    return this.prisma.editorTracking.create({
      data: dto,
      include: {
          case: {
          include: {
            createdBy: {
              select:{
                id:true,
            firstName:true,
            lastName:true,
          },
            },
          },
        },
        writer: {
          select:{
            firstName:true,
            lastName:true,
          },
        },
        editor: {
          select:{
            firstName:true,
            lastName:true,
          },
        },
        editorStatus: true,
      },
    });
  }

  findAll() {
    return this.prisma.editorTracking.findMany({
      include: {
         case: {
          include: {
            createdBy: {
              select:{
                id:true,
            firstName:true,
            lastName:true,
          },
            },
          },
        },
        writer: {
          select:{
            firstName:true,
            lastName:true,
          },
        },
        editor: {
          select:{
            firstName:true,
            lastName:true,
          },
        },
        editorStatus: true,
      },
    });
  }

  async findOne(id: number) {
    const tracking = await this.prisma.editorTracking.findUnique({
      where: { id },
      include: {
        case: {
          include: {
            createdBy: {
              select:{
                id:true,
            firstName:true,
            lastName:true,
          },
            },
          },
        },
        writer: {
          select:{
            firstName:true,
            lastName:true,
          },
        },
        editor: {
          select:{
            firstName:true,
            lastName:true,
          },
        },
        editorStatus: true,
      },
    });

    if (!tracking) {
      throw new NotFoundException('Tracking not found');
    }

    return tracking;
  }

  async update(id: number, dto: UpdateEditorTrackingDto) {
    await this.findOne(id);

    return this.prisma.editorTracking.update({
      where: { id },
      data: dto,
      include: {
        case: {
          include: {
            createdBy: true,
          },
        },
        writer: true,
        editor: true,
        editorStatus: true,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.editorTracking.delete({
      where: { id },
    });
  }
}