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

import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN','OWNER') // 🔥 only admin can access everything in this controller
export class UsersController {
  constructor(private users: UsersService) {}

  @Post()
  create(@Body() body: any) {
    return this.users.create(body);
  }

  @Get()
  findAll() {
    return this.users.findAll();
  }

  // Researchers/managers need the list of researchers to assign as collaborators.
  // Method-level @Roles overrides the class-level ADMIN-only rule.
  // NOTE: must be declared before ':id' so "assignable" isn't parsed as an id.
  @Get('assignable')
  @Roles('ADMIN', 'MANAGER', 'RESEARCHER')
  findAssignable() {
    return this.users.findAssignable();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.users.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.users.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.users.delete(id);
  }
}