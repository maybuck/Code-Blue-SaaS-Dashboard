import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';

import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Permissions } from 'src/common/decorators/permissions.decorator';

@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PermissionsController {
  constructor(private permissions: PermissionsService) {}

  // =========================
  // CREATE PERMISSION
  // =========================
  @Post()
  @Permissions('permission.create')
  create(@Body() body: any) {
    return this.permissions.create(body);
  }

  // =========================
  // GET ALL PERMISSIONS
  // =========================
  @Get()
  @Permissions('permission.read')
  findAll() {
    return this.permissions.findAll();
  }

  // =========================
  // GET ONE PERMISSION
  // =========================
  @Get(':id')
  @Permissions('permission.read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.permissions.findOne(id);
  }

  // =========================
  // BULK UPDATE ROLE ASSIGNMENTS (must be before ':id')
  // body: { items: [{ permissionId, roleIds: number[] }] }
  // =========================
  @Patch('assignments')
  @Permissions('permission.update')
  updateAssignments(@Body('items') items: any) {
    return this.permissions.updateAssignments(items);
  }

  // =========================
  // UPDATE PERMISSION
  // =========================
  @Patch(':id')
  @Permissions('permission.update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    return this.permissions.update(id, body);
  }

  // =========================
  // DELETE PERMISSION
  // =========================
  @Delete(':id')
  @Permissions('permission.delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.permissions.delete(id);
  }
}