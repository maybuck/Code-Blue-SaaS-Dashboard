import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DriveService } from 'src/drive/drive.service';
import { CreateMediaDto } from './dto/create-media.dto';

/**
 * Owns media records in the database. Media is stored in `case_activities`
 * (message = the file link), decoupled from the Drive upload.
 *
 * Media rows are identified by a link-style message (starts with "http"), which
 * keeps listing independent of the free-form `type` value (MEDIA, PNG, ...).
 */
@Injectable()
export class MediaService {
  private readonly defaultType = 'MEDIA';

  constructor(
    private readonly prisma: PrismaService,
    private readonly drive: DriveService,
  ) {}

  /** Persist a media link against a case. */
  async create(userId: number, dto: CreateMediaDto) {
    await this.assertCaseExists(dto.caseId);

    return this.prisma.caseActivity.create({
      data: {
        caseId: dto.caseId,
        userId, // from JWT, not the request body
        type: dto.type?.trim() || this.defaultType,
        message: dto.message,
      },
    });
  }

  /** List media records (link-bearing rows) for a case, oldest-first. */
  async findByCase(caseId: number) {
    await this.assertCaseExists(caseId);

    return this.prisma.caseActivity.findMany({
      where: { caseId, message: { startsWith: 'http' } },
      orderBy: { id: 'asc' },
    });
  }

  /** Fetch a single media record. */
  async findOne(id: number) {
    const media = await this.prisma.caseActivity.findUnique({
      where: { id },
    });
    if (!media) {
      throw new NotFoundException(`Media ${id} not found.`);
    }
    return media;
  }

  /**
   * Delete a media record. Best-effort: also removes the underlying Drive file
   * if a fileId can be parsed from the stored link.
   */
  async remove(userId: number, id: number) {
    const media = await this.findOne(id);

    let driveDeleted = false;
    const fileId = this.extractDriveFileId(media.message);
    if (fileId) {
      try {
        await this.drive.deleteFile(userId, fileId);
        driveDeleted = true;
      } catch {
        // The Drive file may already be gone or owned by another user;
        // we still remove the DB record below.
        driveDeleted = false;
      }
    }

    await this.prisma.caseActivity.delete({ where: { id } });
    return { deleted: true, id, driveDeleted };
  }

  private async assertCaseExists(caseId: number): Promise<void> {
    const found = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException(`Case ${caseId} not found.`);
    }
  }

  /** Extract a Drive fileId from a stored Drive link, if present. */
  private extractDriveFileId(link: string): string | null {
    if (!link) return null;
    const byPath = link.match(/\/d\/([-\w]+)/);
    if (byPath?.[1]) return byPath[1];
    const byQuery = link.match(/[?&]id=([-\w]+)/);
    if (byQuery?.[1]) return byQuery[1];
    return null;
  }
}
