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

import { EditorTrackingService } from './editor-tracking.service';
import { CreateEditorTrackingDto } from './dto/create-editor-tracking.dto';
import { UpdateEditorTrackingDto } from './dto/update-editor-tracking.dto';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Permissions } from 'src/common/decorators/permissions.decorator';

@Controller('editor-tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EditorTrackingController {
  constructor(
    private readonly editorTrackingService: EditorTrackingService,
  ) {}

  @Post()
  @Permissions('editor_tracking.create')
  create(@Body() dto: CreateEditorTrackingDto) {
    return this.editorTrackingService.create(dto);
  }

  @Get()
  @Permissions('editor_tracking.read')
  findAll() {
    return this.editorTrackingService.findAll();
  }

  @Get(':id')
  @Permissions('editor_tracking.read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.editorTrackingService.findOne(id);
  }

  @Patch(':id')
  @Permissions('editor_tracking.update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEditorTrackingDto,
  ) {
    return this.editorTrackingService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('editor_tracking.delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.editorTrackingService.remove(id);
  }
}