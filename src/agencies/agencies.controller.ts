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

@Controller('agencies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgenciesController {
  constructor(private agencies: AgenciesService) {}

  // Any authenticated user can read the agency list.
  @Get()
  findAll(@Query() query: any) {
    return this.agencies.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.agencies.findOne(id);
  }

  // Managers/admins manage the list.
  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@Body() body: any) {
    return this.agencies.create(body);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.agencies.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.agencies.delete(id);
  }
}
