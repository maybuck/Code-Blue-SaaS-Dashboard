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
    @Roles('MANAGER','OWNER')
  getAnalytics() {
    return this.cases.getDashboardAnalytics();
  }

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

  // =========================
  // LINK GOOGLE DRIVE FOLDERS
  // Provisions <Suspect> - <caseNumber>/Reports + /CompletedRequests and
  // persists the links on the case for the Case Detail Drive panel.
  // =========================
  @Post(':id/drive/link')
  @Permissions('case.update.own', 'case.update.all')
  linkDrive(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ) {
    return this.cases.linkDriveFolders(id, req.user);
  }

  // =========================
  // UPLOAD TO THE CASE'S DRIVE FOLDER
  // Auto-routes to Reports (open) or CompletedRequests (COMPLETED),
  // provisioning folders if needed, and records the media row.
  // multipart/form-data, field name "file".
  // =========================
  // @Post(':id/drive/upload')
  // @Permissions('case.update.own', 'case.update.all')
  // @UseInterceptors(
  //   FileInterceptor('file', {
  //     storage: memoryStorage(),
  //     limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  //   }),
  // )
  // uploadDrive(
  //   @Param('id', ParseIntPipe) id: number,
  //   @UploadedFile() file: Express.Multer.File,
  //   @Request() req: any,
  // ) {
  //   return this.cases.uploadCaseMedia(id, req.user, file);
  // }



}