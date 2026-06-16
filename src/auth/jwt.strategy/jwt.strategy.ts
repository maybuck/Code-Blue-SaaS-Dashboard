import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    // 1. Get user with role + permissions
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
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

    // 2. Validate user
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // 3. Extract permissions from RolePermission table
    const permissions = user.role.permissions.map(
      (rp) => rp.permission.name,
    );

    // 4. Return enriched user object inside req.user
    return {
      sub: user.id,
      email: user.email,
      role: user.role.name,
      roleId: user.roleId,
      permissions,
    };
  }
}