import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

// Default status definitions — keys must match the Prisma CaseStatus enum.
const DEFAULT_STATUSES = [
  { key: 'REPORT_REQUESTED', label: 'Report Requested', color: 'blue', stage: 'Intake', order: 1 },
  { key: 'REPORT_RECEIVED', label: 'Report Received', color: 'orange', stage: 'Intake', order: 2 },
  { key: 'AWAITING_REVIEW', label: 'Awaiting Review', color: 'amber', stage: 'Review', order: 3 },
  { key: 'APPROVED', label: 'Approved', color: 'green', stage: 'Review', order: 4 },
  { key: 'MEDIA_REQUESTED', label: 'Media Requested', color: 'purple', stage: 'Production', order: 5 },
  { key: 'MEDIA_APPROVED', label: 'Media Approved', color: 'indigo', stage: 'Production', order: 6 },
  { key: 'COMPLETED', label: 'Completed', color: 'emerald', stage: 'Production', order: 7 },
  { key: 'VOIDED', label: 'Voided', color: 'red', stage: 'Closed', order: 8 },
];

@Injectable()
export class StatusesService {
  constructor(private prisma: PrismaService) {}

  private async ensureSeed() {
    // Self-healing: create any default status that's missing (matched by key),
    // without overwriting labels/colors/order the user has customized. This lets
    // newly introduced statuses (e.g. MEDIA_APPROVED) appear on existing DBs
    // without a manual migration.
    for (const s of DEFAULT_STATUSES) {
      const existing = await this.prisma.status.findUnique({
        where: { key: s.key },
      });
      if (!existing) {
        await this.prisma.status.create({ data: s });
        // Keep COMPLETED/VOIDED after a freshly inserted MEDIA_APPROVED.
        if (s.key === 'MEDIA_APPROVED') {
          await this.prisma.status.updateMany({
            where: { key: 'COMPLETED' },
            data: { order: 7 },
          });
          await this.prisma.status.updateMany({
            where: { key: 'VOIDED' },
            data: { order: 8 },
          });
        }
      }
    }
  }

  async findAll() {
    await this.ensureSeed();
    const statuses = await this.prisma.status.findMany({
      orderBy: { order: 'asc' },
    });
    return {
      success: true,
      message: 'Statuses fetched successfully',
      data: statuses,
    };
  }

  async findOne(id: number) {
    const status = await this.prisma.status.findUnique({ where: { id } });
    if (!status) throw new NotFoundException('Status not found');
    return { success: true, data: status };
  }

  async create(data: any) {
    if (!data.key || !String(data.key).trim()) {
      throw new BadRequestException('Status key is required');
    }
    if (!data.label || !String(data.label).trim()) {
      throw new BadRequestException('Status label is required');
    }
    const key = String(data.key).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');

    try {
      let order = Number(data.order);
      if (!order || Number.isNaN(order)) {
        const last = await this.prisma.status.findFirst({ orderBy: { order: 'desc' } });
        order = (last?.order ?? 0) + 1;
      }

      const status = await this.prisma.status.create({
        data: {
          key,
          label: String(data.label).trim(),
          color: data.color ? String(data.color).trim() : 'gray',
          stage: data.stage ?? null,
          order,
        },
      });
      return { success: true, message: 'Status created successfully', data: status };
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException('A status with this key already exists');
      }
      throw e;
    }
  }

  async update(id: number, data: any) {
    try {
      const updateData: any = {};
      if (data.label !== undefined) updateData.label = String(data.label).trim();
      if (data.color !== undefined) updateData.color = String(data.color).trim();
      if (data.stage !== undefined) updateData.stage = data.stage;
      if (data.order !== undefined) updateData.order = Number(data.order);

      const status = await this.prisma.status.update({
        where: { id },
        data: updateData,
      });
      return { success: true, message: 'Status updated successfully', data: status };
    } catch (e: any) {
      if (e.code === 'P2025') throw new NotFoundException('Status not found');
      throw e;
    }
  }

  // Persist a new ordering. `ids` is the full list of status ids in the desired
  // order; each row's `order` is rewritten to its index (1-based) in one tx.
  async reorder(ids: any[]) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('An array of status ids is required');
    }
    const numericIds = ids.map((id) => Number(id));
    if (numericIds.some((id) => Number.isNaN(id))) {
      throw new BadRequestException('All ids must be numbers');
    }

    await this.prisma.$transaction(
      numericIds.map((id, index) =>
        this.prisma.status.update({
          where: { id },
          data: { order: index + 1 },
        }),
      ),
    );

    const data = await this.prisma.status.findMany({ orderBy: { order: 'asc' } });
    return { success: true, message: 'Status order updated', data };
  }

  async delete(id: number) {
    try {
      await this.prisma.status.delete({ where: { id } });
      return { success: true, message: 'Status deleted successfully' };
    } catch (e: any) {
      if (e.code === 'P2025') throw new NotFoundException('Status not found');
      throw e;
    }
  }
}
