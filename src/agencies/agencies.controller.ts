import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';

import { AgenciesService } from './agencies.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Permissions } from 'src/common/decorators/permissions.decorator';

@Controller('agencies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgenciesController {
  constructor(private agencies: AgenciesService) {}

  // Any authenticated user can read the agency list.
  @Get()
  @Permissions('agency.read')
  findAll(@Query() query: any) {
    return this.agencies.findAll(query);
  }

  @Get(':id')
  @Permissions('agency.read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.agencies.findOne(id);
  }

  // Managers/admins manage the list.
  @Post()
  @Permissions('agency.create')
  create(@Body() body: any) {
    return this.agencies.create(body);
  }

  @Patch(':id')
  @Permissions('agency.update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.agencies.update(id, body);
  }

  @Delete(':id')
  @Permissions('agency.delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.agencies.delete(id);
  }
}
