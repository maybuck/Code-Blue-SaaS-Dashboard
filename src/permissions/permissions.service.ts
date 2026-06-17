import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
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
    data: permissions.map((permission) => ({
      id: permission.id,
      name: permission.name,
      description: permission.description,

      assignedRoles: permission.roles.map((rp) => ({
        roleId: rp.roleId,
        roleName: rp.role.name,
        permissionId: rp.permissionId,
      })),
    })),
  };
}

  // =========================
  // BULK UPDATE ROLE ASSIGNMENTS
  // Body: { items: [{ permissionId, roleIds: number[] }] }
  // For each permission, replaces its NON-ADMIN role assignments with the given
  // roleIds. The ADMIN role is a system role and is never modified.
  // Returns the refreshed permission list (same shape as findAll).
  // =========================
  async updateAssignments(items: any) {
    if (!Array.isArray(items)) {
      throw new BadRequestException('items must be an array');
    }

    const adminRole = await this.prisma.role.findUnique({
      where: { name: 'ADMIN' },
    });
    const adminId = adminRole?.id;

    const ops: any[] = [];
    for (const it of items) {
      const permissionId = Number(it?.permissionId);
      if (Number.isNaN(permissionId)) continue;

      const roleIds: number[] = [
        ...new Set<number>((it?.roleIds || []).map((r: any) => Number(r))),
      ].filter((r) => !Number.isNaN(r) && r !== adminId); // never touch admin

      ops.push(
        this.prisma.rolePermission.deleteMany({
          where: {
            permissionId,
            ...(adminId ? { NOT: { roleId: adminId } } : {}),
          },
        }),
      );

      if (roleIds.length) {
        ops.push(
          this.prisma.rolePermission.createMany({
            data: roleIds.map((roleId) => ({ roleId, permissionId })),
            skipDuplicates: true,
          }),
        ); 
      }
    }

    await this.prisma.$transaction(ops);
    return this.findAll();
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