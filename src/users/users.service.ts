import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // CREATE USER
  async create(data: any) {
    try {
      const hash = await bcrypt.hash(data.password, 10);

      const role = await this.prisma.role.findUnique({
        where: {
          id: data.roleId,
        },
      });

      if (!role) {
        throw new BadRequestException('Invalid role');
      }

      const user = await this.prisma.user.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          passwordHash: hash,
          roleId: data.roleId,
        },
        include: {
          role: true,
        },
      });

      return {
        success: true,
        message: 'User created successfully',
        data: this.formatUser(user),
      };
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Email already exists');
      }

      throw error;
    }
  }

  // GET ALL USERS
async findAll() {
  const users = await this.prisma.user.findMany({
    where: {
      roleId: {
        not: 1,
      },
    },
    include: {
      role: true,
    },
    orderBy: {
      id: 'asc',
    },
  });

  return {
    success: true,
    message: 'Users fetched successfully',
    data: users.map((user) => this.formatUser(user)),
  };
}

  // GET RESEARCHERS (for assigning case collaborators)
  async findAssignable() {
    const users = await this.prisma.user.findMany({
      where: { roleId: 3 }, // RESEARCHER
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { firstName: 'asc' },
    });
    return {
      success: true,
      message: 'Assignable users fetched successfully',
      data: users,
    };
  }

  // GET ONE USER
  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      message: 'User fetched successfully',
      data: this.formatUser(user),
    };
  }

  // UPDATE USER
  async update(id: number, data: any) {
    try {
      if (data.roleId) {
        const role = await this.prisma.role.findUnique({
          where: {
            id: data.roleId,
          },
        });

        if (!role) {
          throw new BadRequestException('Invalid role');
        }
      }

      const updateData: any = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        roleId: data.roleId,
      };

      if (data.password) {
        updateData.passwordHash = await bcrypt.hash(
          data.password,
          10,
        );
      }

      const user = await this.prisma.user.update({
        where: { id },
        data: updateData,
        include: {
          role: true,
        },
      });

      return {
        success: true,
        message: 'User updated successfully',
        data: this.formatUser(user),
      };
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException('User not found');
      }

      if (error.code === 'P2002') {
        throw new ConflictException('Email already exists');
      }

      throw error;
    }
  }

  // DELETE USER
  async delete(id: number) {
    try {
      await this.prisma.user.delete({
        where: { id },
      });

      return {
        success: true,
        message: 'User deleted successfully',
      };
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException('User not found');
      }

      throw error;
    }
  }

  private formatUser(user: any) {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      isActive: user.isActive,
      roleId: user.roleId,
      role: user.role?.name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}