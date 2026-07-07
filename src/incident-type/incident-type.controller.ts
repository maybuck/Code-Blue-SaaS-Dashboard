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
import { IncidentTypeService } from './incident-type.service';
import { CreateIncidentTypeDto } from './dto/create-incident-type.dto';
import { UpdateIncidentTypeDto } from './dto/update-incident-type.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Permissions } from 'src/common/decorators/permissions.decorator';


@Controller('incident-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IncidentTypeController {
  constructor(private readonly incidentTypeService: IncidentTypeService) {}

  @Post()
  @Permissions('incident-type.create')
  create(@Body() dto: CreateIncidentTypeDto) {
    return this.incidentTypeService.create(dto);
  }

  @Get()
  @Permissions('incident-type.read')
  findAll() {
    return this.incidentTypeService.findAll();
  }

  @Get(':id')
  @Permissions('incident-type.read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.incidentTypeService.findOne(id);
  }

  @Patch(':id')
  @Permissions('incident-type.update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIncidentTypeDto,
  ) {
    return this.incidentTypeService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('incident-type.delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.incidentTypeService.remove(id);
  }
}