import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  // =========================
  // CREATE PERMISSION
  // =========================
  async create(data: any) {
    try {
      const permission = await this.prisma.permission.create({
        data: {
          name: data.name,
          description: data.description,
        },
      });

      return {
        success: true,
        message: 'Permission created successfully',
        data: permission,
      };
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Permission already exists');
      }
      throw error;
    }
  }

  // =========================
  // GET ALL PERMISSIONS (WITH ROLES)
  // =========================
  async findAll() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: { id: 'desc' },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    return {
      success: true,
      data: permissions.map((perm) => ({
        id: perm.id,
        name: perm.name,
        description: perm.description,

        // 🔥 roles that have this permission
        roles: perm.roles.map((r) => ({
          id: r.role.id,
          name: r.role.name,
        })),
      })),
    };
  }

  // =========================
  // GET ONE PERMISSION (WITH ROLES)
  // =========================
  async findOne(id: number) {
    const permission = await this.prisma.permission.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return {
      success: true,
      data: {
        id: permission.id,
        name: permission.name,
        description: permission.description,

        roles: permission.roles.map((r) => ({
          id: r.role.id,
          name: r.role.name,
        })),
      },
    };
  }

  // =========================
  // UPDATE PERMISSION
  // =========================
  async update(id: number, data: any) {
    try {
      const permission = await this.prisma.permission.update({
        where: { id },
        data,
      });

      return {
        success: true,
        message: 'Permission updated successfully',
        data: permission,
      };
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException('Permission not found');
      }
      throw error;
    }
  }

  // =========================
  // DELETE PERMISSION
  // =========================
  async delete(id: number) {
    try {
      await this.prisma.permission.delete({
        where: { id },
      });

      return {
        success: true,
        message: 'Permission deleted successfully',
      };
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException('Permission not found');
      }
      throw error;
    }
  }
}