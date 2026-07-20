import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  // =========================
  // SIGNUP (USING roleId)
  // =========================
  async signup(data: any) {
    try {
      const hash = await bcrypt.hash(data.password, 10);

      if (!data.roleId) {
        throw new BadRequestException('roleId is required');
      }

      const role = await this.prisma.role.findUnique({
        where: { id: data.roleId },
      });

      if (!role) {
        throw new BadRequestException('Invalid roleId');
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

      return this.sanitize(user);
    } catch (error) {
      if (
  error instanceof PrismaClientKnownRequestError &&
  error.code === 'P2002'
) {
        throw new BadRequestException('Email already exists');
      }

      throw error;
    }
  }

  // =========================
  // LOGIN
  // =========================
//   async login(email: string, password: string) {
//     const user = await this.prisma.user.findUnique({
//   where: { email },
//   include: {
//     role: {
//       include: {
//         permissions: {
//           include: {
//             permission: true,
//           },
//         },
//       },
//     },
//   },
// });

//     if (!user) {
//       throw new UnauthorizedException('Invalid credentials');
//     }

//     const isMatch = await bcrypt.compare(password, user.passwordHash);

//     if (!isMatch) {
//       throw new UnauthorizedException('Invalid credentials');
//     }

//     const payload = {
//       sub: user.id,
//       email: user.email,
//       role: user.role.name,
//       roleId: user.role.id,
//     };

//     const token = this.jwt.sign(payload);

//     return {
//       access_token: token,
//       token_type: 'Bearer',
//       user: this.sanitize(user),
//     };
//   }

async login(
  email: string,
  password: string,
  rememberMe = false,
) {
  const user = await this.prisma.user.findUnique({
    where: { email },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new UnauthorizedException('Invalid credentials');
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);

  if (!isMatch) {
    throw new UnauthorizedException('Invalid credentials');
  }
    if (!user.isActive) {
    throw new UnauthorizedException(
      'Your account has been deactivated. Please contact an administrator.',
    );
  }

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role.name,
    roleId: user.role.id,
  };

  const token = await this.jwt.signAsync(payload, {
    expiresIn: rememberMe ? '30d' : '1d', // customize as needed
  });

  return {
    access_token: token,
    token_type: 'Bearer',
    expires_in: rememberMe ? '30d' : '1d',
    user: this.sanitize(user),
  };
}

  // =========================
  // SANITIZE RESPONSE
  // =========================
 private sanitize(user: any) {
  const { passwordHash, ...rest } = user;

  return {
    ...rest,
    role: {
      id: user.role.id,
      name: user.role.name,
      permissions: user.role.permissions.map((rp: any) => ({
        id: rp.permission.id,
        name: rp.permission.name,
      })),
    },
  };
}
}