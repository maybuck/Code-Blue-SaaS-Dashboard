import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      'roles',
      [context.getHandler(), context.getClass()],
    );

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      'permissions',
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('No user found');
    }

    // =========================
    // ROLE CHECK (optional fallback)
    // =========================
    if (requiredRoles?.length) {
      if (!requiredRoles.includes(user.role)) {
        throw new ForbiddenException('Role access denied');
      }
    }

    // =========================
    // PERMISSION CHECK (MAIN LOGIC)
    // =========================
    if (requiredPermissions?.length) {
      const userPermissions = user.permissions || [];

      const hasPermission = requiredPermissions.some((perm) =>
        userPermissions.includes(perm),
      );

      if (!hasPermission) {
        throw new ForbiddenException('Permission denied');
      }
    }

    return true;
  }
}