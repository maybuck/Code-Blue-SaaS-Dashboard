import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

import { PrismaService } from 'src/prisma/prisma.service';
import { DriveService } from 'src/drive/drive.service';

// Allowed status transitions. Keep in sync with the frontend (lib/workflow.js).
// VOIDED is reachable from any open status; COMPLETED and VOIDED are terminal.
const STATUS_TRANSITIONS: Record<string, string[]> = {
  REPORT_REQUESTED: ['REPORT_RECEIVED', 'VOIDED'],
  REPORT_RECEIVED: ['AWAITING_REVIEW', 'VOIDED'],
  AWAITING_REVIEW: ['APPROVED', 'VOIDED'],
  APPROVED: ['MEDIA_REQUESTED', 'VOIDED'],
  MEDIA_REQUESTED: ['COMPLETED', 'VOIDED'],
  COMPLETED: [],
  // A mistakenly voided case can be restored to Approved by a manager.
  VOIDED: ['APPROVED'],
};

@Injectable()
export class CasesService {
  constructor(
    private prisma: PrismaService,
    private drive: DriveService,
  ) {}

  // =========================
  // EDIT PERMISSION
  // Managers/admins (case.update.all) may edit any case. Researchers
  // (case.update.own) may edit cases they created OR are assigned to.
  // Pass a caseItem that includes `assignees: { select: { id: true } }`.
  // =========================
  private canEditCase(caseItem: any, user: any): boolean {
    if (user.permissions?.includes('case.update.all')) return true;
    if (!user.permissions?.includes('case.update.own')) return false;
    if (caseItem.createdById === user.sub) return true;
    const assignees = caseItem.assignees || [];
    return assignees.some((a: any) => a.id === user.sub);
  }

  // Resolve an array of assignee ids to a prisma connect list (validates each).
  private async resolveAssignees(ids: any): Promise<{ id: number }[] | null> {
    if (ids === undefined) return null; // not provided -> leave unchanged
    if (!Array.isArray(ids)) return [];
    const unique = [...new Set(ids.map((i) => Number(i)).filter((i) => !Number.isNaN(i)))];
    if (unique.length === 0) return [];
    const found = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    return found.map((u) => ({ id: u.id }));
  }

  // =========================
  // AGENCY LINK RESOLUTIONcreat
  // Keeps the case's police-agency name consistent with the Agency directory.
  // - If agencyId is provided, the canonical Agency.name wins.
  // - Else if a policeAgency name is provided, find it (case-insensitive) or
  //   create it, then link. Both tables end up with the same agency name.
  // =========================
  private async resolveAgency(
    data: any,
  ): Promise<{ agencyId?: number | null; policeAgency?: string }> {
    if (
      data.agencyId !== undefined &&
      data.agencyId !== null &&
      data.agencyId !== ''
    ) {
      const agency = await this.prisma.agency.findUnique({
        where: { id: Number(data.agencyId) },
      });
      if (!agency) {
        throw new NotFoundException(`Agency ${data.agencyId} not found`);
      }
      return { agencyId: agency.id, policeAgency: agency.name };
    }

    const name = (data.policeAgency ?? '').trim();
    if (name) {
      let agency = await this.prisma.agency.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (!agency) {
        agency = await this.prisma.agency.create({ data: { name } });
      }
      return { agencyId: agency.id, policeAgency: agency.name };
    }

    return {};
  }

  // =========================
  // DRIVE FOLDER HELPERS
  // =========================

  /** Active folder link for the Case Detail Drive panel, based on status. */
  private activeDriveUrl(c: {
    status: string;
    driveReportsUrl: string | null;
    driveCompletedUrl: string | null;
  }): string | null {
    return c.status === 'COMPLETED'
      ? c.driveCompletedUrl
      : c.driveReportsUrl;
  }

  /**
   * Provision (find-or-create) the case's Google Drive folder tree and persist
   * the ids + links on the case. Returns the links for the Drive panel.
   *
   * Structure: <appRoot>/<Suspect> - <caseNumber>/Reports + /CompletedRequests
   */
  async linkDriveFolders(id: number, user: any) {
    const caseItem = await this.prisma.case.findUnique({
      where: { id },
      include: { assignees: { select: { id: true } } },
    });
    if (!caseItem) {
      throw new NotFoundException('Case not found');
    }

    if (!this.canEditCase(caseItem, user)) {
      throw new ForbiddenException('You cannot link Drive folders for this case');
    }

    const suspect = caseItem.suspectName?.trim() || 'Unknown';
    const label = `${suspect} - ${caseItem.caseNumber}`;

    const folders = await this.drive.getOrCreateCaseFolders(user.sub, label);

    const updated = await this.prisma.case.update({
      where: { id },
      data: {
        driveFolderId: folders.folderId,
        driveReportsFolderId: folders.reportsFolderId,
        driveCompletedFolderId: folders.completedFolderId,
        driveReportsUrl: folders.reportsUrl,
        driveCompletedUrl: folders.completedUrl,
      },
    });

    return {
      success: true,
      message: 'Google Drive folders linked',
      data: {
        folderUrl: folders.folderUrl,
        reportsUrl: updated.driveReportsUrl,
        completedUrl: updated.driveCompletedUrl,
        // activeUrl: this.activeDriveUrl(updated),
      },
    };
  }

  /**
   * Upload a file into the case's correct Drive folder and record it.
   * Routes to CompletedRequests when the case is COMPLETED, else Reports.
   * Provisions the folders first if they don't exist yet.
   */
  // async uploadCaseMedia(id: number, user: any, file: Express.Multer.File) {
  //   const caseItem = await this.prisma.case.findUnique({
  //     where: { id },
  //     include: { assignees: { select: { id: true } } },
  //   });
  //   if (!caseItem) {
  //     throw new NotFoundException('Case not found');
  //   }

  //   if (!this.canEditCase(caseItem, user)) {
  //     throw new ForbiddenException('You cannot upload media for this case');
  //   }

  //   // Ensure the case's Drive folders exist (provision + persist on first use).
  //   let reportsId = caseItem.driveReportsFolderId;
  //   let completedId = caseItem.driveCompletedFolderId;
  //   if (!reportsId || !completedId) {
  //     const suspect = caseItem.suspectName?.trim() || 'Unknown';
  //     const label = `${suspect} - ${caseItem.caseNumber}`;
  //     const folders = await this.drive.getOrCreateCaseFolders(user.sub, label);

  //     await this.prisma.case.update({
  //       where: { id },
  //       data: {
  //         driveFolderId: folders.folderId,
  //         driveReportsFolderId: folders.reportsFolderId,
  //         driveCompletedFolderId: folders.completedFolderId,
  //         driveReportsUrl: folders.reportsUrl,
  //         driveCompletedUrl: folders.completedUrl,
  //       },
  //     });

  //     reportsId = folders.reportsFolderId;
  //     completedId = folders.completedFolderId;
  //   }

  //   const isCompleted = caseItem.status === 'COMPLETED';
  //   const targetFolderId = isCompleted ? completedId : reportsId;

  //   const uploaded = await this.drive.uploadFile(
  //     user.sub,
  //     file,
  //     targetFolderId!,
  //   );

  //   // Record the media on the case timeline.
  //   const media = await this.prisma.caseActivity.create({
  //     data: {
  //       caseId: id,
  //       userId: user.sub,
  //       type: 'MEDIA',
  //       message: uploaded.webViewLink ?? '',
  //     },
  //   });

  //   return {
  //     success: true,
  //     message: 'File uploaded to case Drive folder',
  //     data: {
  //       folder: isCompleted ? 'CompletedRequests' : 'Reports',
  //       file: uploaded,
  //       media,
  //     },
  //   };
  // }

  // =========================
  // CREATE CASE
  // =========================

async create(data: any, user: any) {
  if (!user.permissions?.includes('case.create')) {
    throw new ForbiddenException('You cannot create cases');
  }

  const dbUser = await this.prisma.user.findUnique({
    where: { id: user.sub },
    select: {
      firstName: true,
      lastName: true,
    },
  });

  const fullName = dbUser
    ? `${dbUser.firstName} ${dbUser.lastName}`
    : 'Unknown User';

  // =========================
  // GET DEFAULT STATUS (REPORT_REQUESTED)
  // =========================
  const defaultStatus = await this.prisma.status.findFirst({
    where: { key: 'REPORT_REQUESTED' },
  });

  if (!defaultStatus) {
    throw new BadRequestException('Default status not found');
  }

  // =========================
  // CHECK FOR DUPLICATE SUSPECT
  // =========================
  let isDuplicate = false;
  let duplicateOfId: number | null = null;

  if (data.suspectName) {
    const existingCase = await this.prisma.case.findFirst({
      where: {
        suspectName: {
          equals: data.suspectName.trim(),
          mode: 'insensitive',
        },
        isDuplicate: false,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (existingCase) {
      return {
        success: true,
        message: 'Case already exists for this suspect',
        data: existingCase,
      };
    }
  }

  // =========================
  // VALIDATE ASSIGNEE
  // =========================
  let assignedToId: number | null = null;

  if (
    data.assignedToId !== undefined &&
    data.assignedToId !== null &&
    data.assignedToId !== ''
  ) {
    const assignee = await this.prisma.user.findUnique({
      where: { id: Number(data.assignedToId) },
      select: { id: true },
    });

    if (!assignee) {
      throw new NotFoundException(
        `Assigned user ${data.assignedToId} not found`,
      );
    }

    assignedToId = assignee.id;
  }

  // =========================
  // RESOLVE AGENCY
  // =========================
  const agencyLink = await this.resolveAgency(data);

  // =========================
  // RESOLVE ASSIGNEES (many-to-many)
  // =========================
  const resolvedAssignees = await this.resolveAssignees(data.assigneeIds);

  const assigneeConnect =
    resolvedAssignees && resolvedAssignees.length
      ? { assignees: { connect: resolvedAssignees } }
      : {};

  // =========================
  // CREATE CASE
  // =========================
  const caseItem = await this.prisma.case.create({
    data: {
      ...assigneeConnect,

      caseNumber: data.caseNumber ?? null,
      submittedVia: data.submittedVia,

      dateSubmitted: data.dateSubmitted
        ? new Date(data.dateSubmitted)
        : new Date(),

      policeAgency: agencyLink.policeAgency ?? data.policeAgency,
      agencyId: agencyLink.agencyId ?? null,
      enteredBy: data.enteredBy,

      incidentDate: data.incidentDate
        ? new Date(data.incidentDate)
        : null,

      location: data.location,
      suspectName: data.suspectName,
      age: data.age,

      title: data.title,
      description: data.description,
      incidentSummary: data.incidentSummary,

      // ✅ FIXED: statusId instead of enum/string
      statusId: defaultStatus.id,

      mediaType: data.mediaType,

      dateCompleted: data.dateCompleted
        ? new Date(data.dateCompleted)
        : null,

      notes: data.notes,
      potential: data.potential,

      isDuplicate,
      duplicateOfId,

      createdById: user.sub,
      assignedToId,
    },
  });

  // =========================
  // ACTIVITY LOG
  // =========================
  await this.prisma.caseActivity.create({
    data: {
      caseId: caseItem.id,
      userId: user.sub,
      type: 'CASE_CREATED',
      message: isDuplicate
        ? `Duplicate case created by ${fullName}. Linked to Case #${duplicateOfId}`
        : `Case created by ${fullName}`,
    },
  });

  return {
    success: true,
    message: 'Case created successfully',
    data: caseItem,
  };
}



async findAll(user: any, query: any = {}) {
  const where: any = {};
  const and: any[] = [];

  // =========================
  // MINE FILTER
  // =========================
  if (query.mine === 'true' || query.mine === true) {
    and.push({
      OR: [
        { createdById: user.sub },
        { assignees: { some: { id: user.sub } } },
      ],
    });
  }

  // =========================
  // STATUS FILTER (FIXED)
  // =========================
  if (query.status) {
    const status = await this.prisma.status.findFirst({
      where: {
        key: query.status,
      },
    });

    if (status) {
      where.statusId = status.id;
    }
  }

  // =========================
  // DUPLICATE FILTER
  // =========================
  if (
    query.duplicatesOnly === 'true' ||
    query.duplicatesOnly === true
  ) {
    where.isDuplicate = true;
  }

  // =========================
  // SEARCH FILTER
  // =========================
  if (query.q && String(query.q).trim()) {
    const q = String(query.q).trim();

    and.push({
      OR: [
        { caseNumber: { contains: q, mode: 'insensitive' } },
        { suspectName: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { policeAgency: { contains: q, mode: 'insensitive' } },
        { location: { contains: q, mode: 'insensitive' } },
      ],
    });
  }

  if (and.length) {
    where.AND = and;
  }

  const cases = await this.prisma.case.findMany({
    where,

    include: {
      createdBy: true,
      assignedTo: true,

      // Uploaded documents (so the review queue knows media is ready).
      activities: {
        where: { type: 'MEDIA' },
        select: { id: true },
      },

      assignees: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },

      agency: {
        select: {
          id: true,
          name: true,
          allowed: true,
        },
      },

      // Duplicate relations
      duplicateOf: {
        select: {
          id: true,
          caseNumber: true,
          suspectName: true,
        },
      },

      duplicates: {
        select: {
          id: true,
          caseNumber: true,
          suspectName: true,
          createdAt: true,
        },
      },

      // ✅ IMPORTANT: include status relation
      status: true,
    },

    orderBy: {
      createdAt: 'desc',
    },
  });

  return {
    success: true,
    message: 'Cases fetched successfully',
    data: cases,
  };
}

  // =========================
  // GET ONE CASE (WITH TIMELINE)
  // =========================
async findOne(id: number, user: any) {
  const caseItem = await this.prisma.case.findUnique({
    where: { id },

    include: {
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },

      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },

      assignees: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },

      agency: {
        select: {
          id: true,
          name: true,
          allowed: true,
        },
      },

      // =========================
      // STATUS (IMPORTANT FIX)
      // =========================
      status: true,

      // =========================
      // DUPLICATE RELATION
      // =========================
      duplicateOf: {
        select: {
          id: true,
          caseNumber: true,
          suspectName: true,

          // FIX: include status relation instead of old field
          status: true,

          createdAt: true,
        },
      },

      duplicates: {
        select: {
          id: true,
          caseNumber: true,
          suspectName: true,

          // FIX: include status relation
          status: true,

          createdAt: true,

          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      },

      _count: {
        select: {
          duplicates: true,
        },
      },

      activities: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  });

  if (!caseItem) {
    throw new NotFoundException('Case not found');
  }

  return {
    success: true,
    message: 'Case fetched successfully',
    data: {
      ...caseItem,


      // activeDriveUrl: this.activeDriveUrl(caseItem),
    },
  };
}

  // =========================
  // UPDATE CASE (WITH FULL ACTIVITY LOGGING)
  // =========================
async update(id: number, data: any, user: any) {
  const caseItem = await this.prisma.case.findUnique({
    where: { id },
    include: {
      assignees: { select: { id: true } },
      status: true,
    },
  });

  if (!caseItem) {
    throw new NotFoundException('Case not found');
  }

  if (!this.canEditCase(caseItem, user)) {
    throw new ForbiddenException('You cannot update this case');
  }

  const dbUser = await this.prisma.user.findUnique({
    where: { id: user.sub },
    select: { firstName: true, lastName: true },
  });

  const fullName = dbUser
    ? `${dbUser.firstName} ${dbUser.lastName}`
    : 'Unknown User';

  const oldStatusKey = caseItem.status?.key ?? null;
  const oldAssignedTo = caseItem.assignedToId;
  const oldSuspectName = caseItem.suspectName;

  // =========================
  // STATUS UPDATE (statusId)
  // =========================
  let statusData: any = {};

  if (data.statusId && data.statusId !== caseItem.statusId) {
    const newStatus = await this.prisma.status.findUnique({
      where: { id: Number(data.statusId) },
    });

    if (!newStatus) {
      throw new NotFoundException('Invalid statusId');
    }

    const allowedKeys = STATUS_TRANSITIONS[oldStatusKey] ?? [];

    if (oldStatusKey && !allowedKeys.includes(newStatus.key)) {
      throw new BadRequestException(
        `Invalid status transition: ${oldStatusKey} → ${newStatus.key}`,
      );
    }

    statusData.statusId = newStatus.id;
  }

  const { note: incomingNote, assigneeIds, ...caseData } = data;

  // =========================
  // ASSIGNEES
  // =========================
  let assigneeData: any = {};
  const resolvedAssignees = await this.resolveAssignees(assigneeIds);

  if (resolvedAssignees !== null) {
    assigneeData = { assignees: { set: resolvedAssignees } };
  }

  // =========================
  // AGENCY
  // =========================
  let agencyData: any = {};
  if (data.policeAgency !== undefined || data.agencyId !== undefined) {
    agencyData = await this.resolveAgency(data);
  }

  // =========================
  // DUPLICATE CHECK
  // =========================
  let duplicateData: any = {};

  if (
    data.suspectName &&
    data.suspectName.trim() !== oldSuspectName
  ) {
    const existingCase = await this.prisma.case.findFirst({
      where: {
        suspectName: {
          equals: data.suspectName.trim(),
          mode: 'insensitive',
        },
        id: { not: id },
        isDuplicate: false,
      },
    });

    duplicateData = existingCase
      ? { isDuplicate: true, duplicateOfId: existingCase.id }
      : { isDuplicate: false, duplicateOfId: null };
  }

  // =========================
  // UPDATE CASE (IMPORTANT FIX: assignedToId added)
  // =========================
  const updated = await this.prisma.case.update({
    where: { id },
    data: {
      ...caseData,
      ...statusData,
      ...duplicateData,
      ...agencyData,
      ...assigneeData,

      // 🔥 FIX: make sure DB updates assignment too
      ...(data.assignedToId !== undefined && {
        assignedToId: data.assignedToId
          ? Number(data.assignedToId)
          : null,
      }),
    },
    include: {
      status: true,
    },
  });

  // =========================
  // STATUS LOG
  // =========================
  if (statusData.statusId) {
    const newStatusKey = updated.status?.key ?? null;

    await this.prisma.caseActivity.create({
      data: {
        caseId: id,
        userId: user.sub,
        type: 'STATUS_CHANGED',
        message: `Status changed from ${oldStatusKey} to ${newStatusKey} by ${fullName}`,
      },
    });
  }

  // =========================
  // ASSIGNMENT LOG
  // =========================
  if (
    data.assignedToId &&
    data.assignedToId !== oldAssignedTo
  ) {
    await this.prisma.caseActivity.create({
      data: {
        caseId: id,
        userId: user.sub,
        type: 'CASE_ASSIGNED',
        message: `Case assigned to user ID ${data.assignedToId} by ${fullName}`,
      },
    });
  }

  // =========================
  // NOTE LOG
  // =========================
  if (incomingNote?.trim()) {
    await this.prisma.caseActivity.create({
      data: {
        caseId: id,
        userId: user.sub,
        type: 'NOTE_ADDED',
        message: incomingNote,
      },
    });
  }

  // =========================
  // SUSPECT LOG
  // =========================
  if (
    data.suspectName &&
    data.suspectName.trim() !== oldSuspectName
  ) {
    await this.prisma.caseActivity.create({
      data: {
        caseId: id,
        userId: user.sub,
        type: 'CASE_UPDATED',
        message: `Suspect changed from "${oldSuspectName}" to "${data.suspectName}" by ${fullName}`,
      },
    });
  }

  return {
    success: true,
    message: 'Case updated successfully',
    data: updated,
  };
}

  // =========================
  // DELETE CASE
  // =========================
  async delete(id: number, user: any) {
    if (!user.permissions?.includes('case.delete')) {
      throw new ForbiddenException('You cannot delete cases');
    }

    const caseItem = await this.prisma.case.findUnique({
      where: { id },
    });

    if (!caseItem) {
      throw new NotFoundException('Case not found');
    }

    await this.prisma.case.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Case deleted successfully',
    };
  }


  async addNote(caseId: number, note: string, user: any) {
  const caseItem = await this.prisma.case.findUnique({
    where: { id: caseId },
  });

  if (!caseItem) {
    throw new NotFoundException('Case not found');
  }

  // Get user name
  const dbUser = await this.prisma.user.findUnique({
    where: { id: user.sub },
    select: {
      firstName: true,
      lastName: true,
    },
  });

  const fullName = dbUser
    ? `${dbUser.firstName} ${dbUser.lastName}`
    : 'Unknown User';

  // Create activity log
  const activity = await this.prisma.caseActivity.create({
    data: {
      caseId,
      userId: user.sub,
      type: 'NOTE_ADDED',
      message: `${fullName}: ${note}`,
    },
  });

  return {
    success: true,
    message: 'Note added successfully',
    data: activity,
  };
}

  // =========================
  // ADD COMMENT (discussion thread, separate from research notes)
  // =========================
  async addComment(caseId: number, comment: string, user: any) {
    if (!comment || !comment.trim()) {
      throw new BadRequestException('Comment cannot be empty');
    }

    const caseItem = await this.prisma.case.findUnique({
      where: { id: caseId },
    });
    if (!caseItem) {
      throw new NotFoundException('Case not found');
    }

    // Any authenticated user who can view cases may comment (researchers can
    // discuss colleagues' cases).

    const activity = await this.prisma.caseActivity.create({
      data: {
        caseId,
        userId: user.sub,
        type: 'COMMENT',
        message: comment.trim(),
      },
    });

    return {
      success: true,
      message: 'Comment added successfully',
      data: activity,
    };
  }
async getDashboardAnalytics() {
  // =========================
  // LOAD STATUS IDS
  // =========================
  const statuses = await this.prisma.status.findMany({
    select: {
      id: true,
      key: true,
    },
  });

  const STATUS = Object.fromEntries(
    statuses.map((s) => [s.key, s.id]),
  ) as Record<string, number>;

  // =========================
  // LOAD CASES
  // =========================
  const cases = await this.prisma.case.findMany({
    include: {
      createdBy: true,
       status: true,
    },
  });

  // =========================
  // SUMMARY
  // =========================
  const totalCases = cases.length;

  const reportRequested = cases.filter(
    (c) => c.statusId === STATUS.REPORT_REQUESTED,
  ).length;

  const reportReceived = cases.filter(
    (c) => c.statusId === STATUS.REPORT_RECEIVED,
  ).length;

  const awaitingReview = cases.filter(
    (c) => c.statusId === STATUS.AWAITING_REVIEW,
  ).length;

  const approved = cases.filter(
    (c) => c.statusId === STATUS.APPROVED,
  ).length;

  const mediaRequested = cases.filter(
    (c) => c.statusId === STATUS.MEDIA_REQUESTED,
  ).length;

  const completed = cases.filter(
    (c) => c.statusId === STATUS.COMPLETED,
  ).length;

  const voided = cases.filter(
    (c) => c.statusId === STATUS.VOIDED,
  ).length;

  const voidRate = totalCases
    ? Math.round((voided / totalCases) * 100)
    : 0;

  // =========================
  // AVG CYCLE TIME
  // =========================
  const completedCases = cases.filter(
    (c) => c.statusId === STATUS.COMPLETED,
  );

  const avgCycleDays = completedCases.length
    ? Math.round(
        completedCases.reduce((sum, c) => {
          const created = new Date(c.createdAt).getTime();
          const updated = new Date(c.updatedAt).getTime();

          return (
            sum +
            Math.ceil(
              (updated - created) /
                (1000 * 60 * 60 * 24),
            )
          );
        }, 0) / completedCases.length,
      )
    : 0;

  // =========================
  // RESEARCHERS
  // =========================
  const researchers = await this.prisma.user.findMany({
    where: {
      role: {
        name: 'RESEARCHER',
      },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  });

  // =========================
  // REQUESTS SUBMITTED BY RESEARCHER
  // =========================
  const requestsSubmittedByResearcher = researchers
    .map((researcher) => {
      const submittedCases = cases.filter(
        (c) => c.createdById === researcher.id,
      );

      return {
        researcherId: researcher.id,
        researcherName: `${researcher.firstName} ${researcher.lastName}`,
        requestsSubmitted: submittedCases.length,
      };
    })
    .sort(
      (a, b) =>
        b.requestsSubmitted - a.requestsSubmitted,
    );

  // =========================
  // RESEARCHER STATS
  // =========================
  const researcherStats = researchers.map((researcher) => {
    const userCases = cases.filter(
      (c) => c.createdById === researcher.id,
    );

    return {
      id: researcher.id,
      name: `${researcher.firstName} ${researcher.lastName}`,

      submitted: userCases.length,

      completed: userCases.filter(
        (c) => c.statusId === STATUS.COMPLETED,
      ).length,

      voided: userCases.filter(
        (c) => c.statusId === STATUS.VOIDED,
      ).length,

      approved: userCases.filter(
        (c) => c.statusId === STATUS.APPROVED,
      ).length,

      created: userCases.filter(
        (c) => c.statusId === STATUS.REPORT_REQUESTED,
      ).length,

      mediaRequested: userCases.filter(
        (c) => c.statusId === STATUS.MEDIA_REQUESTED,
      ).length,
    };
  });

  // =========================
  // OLDEST OPEN REQUESTS
  // (REPORT_REQUESTED ONLY)
  // =========================
const oldestOpenRequests = cases
  .filter(
    (c) => c.statusId === STATUS.REPORT_REQUESTED,
  )
  .sort(
    (a, b) =>
      a.createdAt.getTime() -
      b.createdAt.getTime(),
  )
  .slice(0, 6)
  .map((c) => ({
    id: c.id,
    caseNumber: c.caseNumber,
    suspectName: c.suspectName,

    statusId: c.statusId,
    status: {
      id: c.status.id,
      key: c.status.key,
      label: c.status.label,
      color: c.status.color,
      stage: c.status.stage,
    },

    daysOpen: Math.floor(
      (Date.now() - c.createdAt.getTime()) /
        (1000 * 60 * 60 * 24),
    ),
  }));
  return {
    success: true,

    summary: {
      totalCases,
      reportRequested,
      reportReceived,
      awaitingReview,
      approved,
      mediaRequested,
      completed,
      voided,
      voidRate,
      avgCycleDays,
    },

    requestsSubmittedByResearcher,

    researcherStats,

    oldestOpenRequests,
  };
}



  // =========================
  // UPLOAD A DOCUMENT
  // Records the upload on the timeline as a MEDIA activity. Completion is NOT
  // automatic — a manager finalizes the case from the review queue once a
  // document has been uploaded.
  // =========================
  async markMediaUploaded(id: number, user: any, file: any) {
    const caseItem = await this.prisma.case.findUnique({
      where: { id },
      include: { assignees: { select: { id: true } }, status: true },
    });
    if (!caseItem) {
      throw new NotFoundException('Case not found');
    }
    if (!this.canEditCase(caseItem, user)) {
      throw new ForbiddenException('You cannot upload documents for this case');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { firstName: true, lastName: true },
    });
    const fullName = dbUser ? `${dbUser.firstName} ${dbUser.lastName}` : 'Unknown User';
    const fileName = (file && file.originalname) || 'document';

    const activity = await this.prisma.caseActivity.create({
      data: {
        caseId: id,
        userId: user.sub,
        type: 'MEDIA',
        message: `${fullName} uploaded a document: ${fileName}`,
      },
    });

    return {
      success: true,
      message: 'Document uploaded',
      data: { fileName, activity },
    };
  }
}
