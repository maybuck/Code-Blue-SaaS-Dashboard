import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AgenciesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: any = {}) {
    const where: any = {};

    if (query.allowed === 'true') where.allowed = true;
    if (query.allowed === 'false') where.allowed = false;

    if (query.q && String(query.q).trim()) {
      const q = String(query.q).trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const agencies = await this.prisma.agency.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return {
      success: true,
      message: 'Agencies fetched successfully',
      data: agencies,
    };
  }

  async findOne(id: number) {
    const agency = await this.prisma.agency.findUnique({ where: { id } });
    if (!agency) throw new NotFoundException('Agency not found');
    return { success: true, data: agency };
  }

  async create(data: any) {
    if (!data.name || !String(data.name).trim()) {
      throw new BadRequestException('Agency name is required');
    }
    try {
      const agency = await this.prisma.agency.create({
        data: {
          name: String(data.name).trim(),
          description: data.description ?? null,
          allowed: data.allowed === undefined ? true : !!data.allowed,
        },
      });
      return { success: true, message: 'Agency created successfully', data: agency };
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException('An agency with this name already exists');
      }
      throw e;
    }
  }

  async update(id: number, data: any) {
    try {
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = String(data.name).trim();
      if (data.description !== undefined) updateData.description = data.description;
      if (data.allowed !== undefined) updateData.allowed = !!data.allowed;

      const agency = await this.prisma.agency.update({
        where: { id },
        data: updateData,
      });
      return { success: true, message: 'Agency updated successfully', data: agency };
    } catch (e: any) {
      if (e.code === 'P2025') throw new NotFoundException('Agency not found');
      if (e.code === 'P2002') {
        throw new ConflictException('An agency with this name already exists');
      }
      throw e;
    }
  }

  async delete(id: number) {
    try {
      await this.prisma.agency.delete({ where: { id } });
      return { success: true, message: 'Agency deleted successfully' };
    } catch (e: any) {
      if (e.code === 'P2025') throw new NotFoundException('Agency not found');
      throw e;
    }
  }
}
