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
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CasesService } from './cases.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Permissions } from 'src/common/decorators/permissions.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('cases')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CasesController {
  constructor(private cases: CasesService) {}

  // =========================
  // CREATE CASE
  // =========================
  @Post()
  @Permissions('case.create')
  create(@Body() body: any, @Request() req: any) {
    return this.cases.create(body, req.user);
  }

  // =========================
  // GET ALL CASES
  // =========================
  @Get("analytics")
  @Roles('MANAGER', 'OWNER')
  getAnalytics(@Query('from') from?: string, @Query('to') to?: string) {
    return this.cases.getDashboardAnalytics(from, to);
  }
  // @Get("analytics")
  //   @Roles('MANAGER','OWNER')
  // getAnalytics() {
  //   return this.cases.getDashboardAnalytics();
  // }

  @Get()
  @Permissions('case.read.own', 'case.read.all')
  findAll(@Request() req: any, @Query() query: any) {
    return this.cases.findAll(req.user, query);
  }

  
   // Recent activity feed for the signed-in user (notifications).
  @Get('activities/feed')
  @Permissions('case.read.own', 'case.read.all')
  activityFeed(@Request() req: any) {
    return this.cases.getActivityFeed(req.user);
  }

   @Patch('bulk-assign')
    @Roles('MANAGER', 'OWNER')
  async bulkAssign(
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.cases.bulkAssign(
      body,
      req.user,
    );
  }

  // Clear the assigned researcher on several cases at once. Body: { caseIds }.
  @Patch('bulk-unassign')
  @Roles('MANAGER', 'OWNER')
  async bulkUnassign(
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.cases.bulkUnassign(body?.caseIds, req.user);
  }

   @Patch(':id/claim')
  async claimCase(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.cases.claimCase(
      id,
      req.user,
    );
  }


  // =========================
  // GET SINGLE CASE
  // =========================
  @Get(':id')
  @Permissions('case.read.own', 'case.read.all')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.cases.findOne(id, req.user);
  }

  // =========================
  // UPDATE CASE
  // =========================
  @Patch(':id')
  @Permissions('case.update.own', 'case.update.all')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.cases.update(id, body, req.user);
  }

  // =========================
  // DELETE CASE
  // =========================
  // Bulk delete. Declared BEFORE ':id' so "bulk-delete" isn't parsed as an id.
  // Uses POST because a request body on DELETE isn't universally supported by
  // proxies/clients. Body: { caseIds: number[] }.
  @Post('bulk-delete')
  @Permissions('case.delete')
  bulkDelete(
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.cases.bulkDelete(body?.caseIds, req.user);
  }

  // Owners (researchers) may delete their own cases; managers/admins any case.
  // The service enforces the owner-or-manager rule.
  @Delete(':id')
  @Permissions('case.update.own', 'case.update.all', 'case.delete')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.cases.delete(id, req.user);
  }

    @Post(':id/note')
  async addNote(
    @Param('id') id: string,
    @Body('note') note: string,
    @Request() req: any,
  ) {
    return this.cases.addNote(Number(id), note, req.user);
  }

  // =========================
  // ADD COMMENT (discussion thread)
  // =========================
  @Post(':id/comment')
  async addComment(
    @Param('id') id: string,
    @Body('comment') comment: string,
    @Request() req: any,
  ) {
    return this.cases.addComment(Number(id), comment, req.user);
  }

  // =========================
  // UPLOAD A DOCUMENT (records the upload; auto-completes a MEDIA_REQUESTED case)
  // multipart/form-data, field name "file".
  // =========================
  @Post(':id/media')
  @Permissions('case.update.own', 'case.update.all')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
    }),
  )
  uploadMedia(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    return this.cases.markMediaUploaded(id, req.user, file);
  }
}