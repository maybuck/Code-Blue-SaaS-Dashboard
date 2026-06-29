import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CaseMediaService } from './case-media.service';
import { CreateCaseMediaDto } from './dto/create-case-media.dto';
import { UpdateCaseMediaDto } from './dto/update-case-media.dto';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';

@Controller('case-media')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CaseMediaController {
  constructor(
    private readonly caseMediaService: CaseMediaService,
  ) {}

  @Post()
  @Permissions('case_media.create')
  create(@Body() dto: CreateCaseMediaDto) {
    return this.caseMediaService.create(dto);
  }

  @Get()
  @Permissions('case_media.read')
  findAll() {
    return this.caseMediaService.findAll();
  }

  @Get('case/:caseId')
  @Permissions('case_media.read')
  findByCase(
    @Param('caseId', ParseIntPipe) caseId: number,
  ) {
    return this.caseMediaService.findByCase(caseId);
  }

  @Get(':id')
  @Permissions('case_media.read')
  findOne(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.caseMediaService.findOne(id);
  }

  @Patch(':id')
  @Permissions('case_media.update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCaseMediaDto,
  ) {
    return this.caseMediaService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('case_media.delete')
  remove(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.caseMediaService.remove(id);
  }
}