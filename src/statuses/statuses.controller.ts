import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';

import { StatusesService } from './statuses.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('statuses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StatusesController {
  constructor(private statuses: StatusesService) {}

  @Get()
  findAll() {
    return this.statuses.findAll();
  }

  // NOTE: must be declared before ':id' routes so "reorder" isn't parsed as an id.
  @Patch('reorder')
  @Roles('ADMIN')
  reorder(@Body() body: any) {
    return this.statuses.reorder(body?.ids);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.statuses.findOne(id);
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() body: any) {
    return this.statuses.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.statuses.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.statuses.delete(id);
  }
}
