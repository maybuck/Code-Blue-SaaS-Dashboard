import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  ParseIntPipe,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';

import { MediaService } from './media.service';
import { CreateMediaDto } from './dto/create-media.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard';

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Persist a media link against a case. */
  @Post()
  create(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateMediaDto,
    @Req() req: any,
  ) {
    return this.media.create(req.user.sub, dto);
  }

  /** List media records for a case. */
  @Get('case/:caseId')
  findByCase(@Param('caseId', ParseIntPipe) caseId: number) {
    return this.media.findByCase(caseId);
  }

  /** Fetch a single media record. */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.media.findOne(id);
  }

  /** Delete a media record (and its Drive file when possible). */
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.media.remove(req.user.sub, id);
  }
}
