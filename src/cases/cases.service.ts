import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

import { PrismaService } from 'src/prisma/prisma.service';

// Allowed status transitions. Keep in sync with the frontend (lib/workflow.js).
// VOIDED is reachable from any open status; COMPLETED and VOIDED are terminal.
// const STATUS_TRANSITIONS: Record<string, string[]> = {
//   REPORT_REQUESTED: ['REPORT_RECEIVED', 'VOIDED'],
//   REPORT_RECEIVED:  ['AWAITING_REVIEW', 'VOIDED'],
//   AWAITING_REVIEW:  ['APPROVED', 'VOIDED'],
//   APPROVED:         ['MEDIA_REQUESTED', 'VOIDED'],
//   MEDIA_REQUESTED:  ['MEDIA_APPROVED', 'VOIDED'],   // go through approval, not straight to COMPLETED
//   MEDIA_APPROVED:   ['COMPLETED', 'VOIDED'],        // ← add this line (was missing)
//   COMPLETED:        ['IN_PROGRESS'],
//   IN_PROGRESS:      ['PUBLISHED'],
//   PUBLISHED:        [],
//   // A mistakenly voided case can be restored to Approved by a manager.
//   VOIDED:           ['APPROVED'],
// };

const STATUS_TRANSITIONS: Record<string, string[]> = {
  // A draft is private to its creator until submitted.
  DRAFT: ['REPORT_REQUESTED', 'VOIDED'],

  // A requested report can be received, put on hold (Open), or voided.
  REPORT_REQUESTED: ['REPORT_RECEIVED', 'OPEN', 'VOIDED'],

  // Open = on hold (agency won't release yet). Resume forward, or send back.
  OPEN: ['REPORT_RECEIVED', 'REPORT_REQUESTED', 'VOIDED'],

  // Received report → send to review, or step back to Requested.
  REPORT_RECEIVED: ['AWAITING_REVIEW', 'REPORT_REQUESTED', 'VOIDED'],

  AWAITING_REVIEW: ['APPROVED', 'VOIDED'],
  APPROVED: ['MEDIA_REQUESTED', 'VOIDED'],

  // Media Approved is retired: once media is requested and uploaded the
  // researcher marks the case Completed directly. Can also step back to Approved.
  MEDIA_REQUESTED: ['COMPLETED', 'APPROVED', 'VOIDED'],

  // Kept so any legacy cases sitting at Media Approved can still complete.
  MEDIA_APPROVED: ['COMPLETED', 'VOIDED'],

  // Completed cases move into the editorial pipeline (owner/manager). The
  // editorial stage can move both ways so the board stays in sync with the
  // editor status.
  COMPLETED: ['IN_PROGRESS'],
  IN_PROGRESS: ['PUBLISHED', 'VOIDED'],
  PUBLISHED: ['IN_PROGRESS'],

  // A mistakenly voided case can be restored to Approved by a manager.
  VOIDED: ['APPROVED'],
};

@Injectable()
export class CasesService {
  constructor(
    private prisma: PrismaService
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



// async create(data: any, user: any) {
//   if (!user.permissions?.includes('case.create')) {
//     throw new ForbiddenException('You cannot create cases');
//   }

//   const dbUser = await this.prisma.user.findUnique({
//     where: { id: user.sub },
//     select: {
//       firstName: true,
//       lastName: true,
//     },
//   });

//   const fullName = dbUser
//     ? `${dbUser.firstName} ${dbUser.lastName}`
//     : 'Unknown User';

//   // =========================
//   // GET DEFAULT STATUS
//   // =========================
//   const defaultStatus = await this.prisma.status.findFirst({
//     where: { key: 'REPORT_REQUESTED' },
//   });

//   if (!defaultStatus) {
//     throw new BadRequestException('Default status not found');
//   }

//   // =========================
//   // DUPLICATE CHECK
//   // =========================
//   let isDuplicate = false;
//   let duplicateOfId: number | null = null;

//   if (data.suspectName) {
//     const existingCase = await this.prisma.case.findFirst({
//       where: {
//         suspectName: {
//           equals: data.suspectName.trim(),
//           mode: 'insensitive',
//         },
//         isDuplicate: false,
//       },
//       orderBy: {
//         createdAt: 'asc',
//       },
//     });

//     if (existingCase) {
//       isDuplicate = true;
//       duplicateOfId = existingCase.id;
//     }
//   }

//   // =========================
//   // VALIDATE ASSIGNEE
//   // =========================
//   let assignedToId: number | null = null;

//   if (data.assignedToId) {
//     const assignee = await this.prisma.user.findUnique({
//       where: { id: Number(data.assignedToId) },
//       select: { id: true },
//     });

//     if (!assignee) {
//       throw new NotFoundException(
//         `Assigned user ${data.assignedToId} not found`,
//       );
//     }

//     assignedToId = assignee.id;
//   }

//   // =========================
//   // RESOLVE AGENCY
//   // =========================
//   const agencyLink = await this.resolveAgency(data);

//   // =========================
//   // RESOLVE ASSIGNEES
//   // =========================
//   const resolvedAssignees = await this.resolveAssignees(data.assigneeIds);

//   const assigneeConnect =
//     resolvedAssignees?.length
//       ? { assignees: { connect: resolvedAssignees } }
//       : {};

//   // =========================
//   // CREATE CASE + ACTIVITIES (TRANSACTION)
//   // =========================
//   const result = await this.prisma.$transaction(async (tx) => {
//     // CREATE CASE
//     const caseItem = await tx.case.create({
//       data: {
//         ...assigneeConnect,

//         caseNumber: data.caseNumber ?? null,
//         submittedVia: data.submittedVia,

//         dateSubmitted: data.dateSubmitted
//           ? new Date(data.dateSubmitted)
//           : new Date(),

//         policeAgency: agencyLink.policeAgency ?? data.policeAgency,
//         agencyId: agencyLink.agencyId ?? null,
//         enteredBy: data.enteredBy,

//         incidentDate: data.incidentDate
//           ? new Date(data.incidentDate)
//           : null,

//         location: data.location,
//         suspectName: data.suspectName,
//         age: data.age,

//         title: data.title,
//         description: data.description,
//         incidentSummary: data.incidentSummary,

//         statusId: defaultStatus.id,

//         mediaType: data.mediaType,

//         dateCompleted: data.dateCompleted
//           ? new Date(data.dateCompleted)
//           : null,


//         potential: data.potential,

//         isDuplicate,
//         duplicateOfId,

//         createdById: user.sub,
//         assignedToId,
//       },
//     });

//     // =========================
//     // CASE CREATED ACTIVITY
//     // =========================
//     await tx.caseActivity.create({
//       data: {
//         caseId: caseItem.id,
//         userId: user.sub,
//         type: 'CASE_CREATED',
//         message: isDuplicate
//           ? `Duplicate case created by ${fullName}. Linked to Case #${duplicateOfId}`
//           : `Case created by ${fullName}`,
//       },
//     });

//     // =========================
//     // NOTE ACTIVITY (ONLY IF EXISTS)
//     // =========================
//     if (data.notes?.trim()) {
//       await tx.caseActivity.create({
//         data: {
//           caseId: caseItem.id,
//           userId: user.sub,
//           type: 'NOTE_ADDED',
//           message: data.notes.trim(),
//         },
//       });
//     }

//     return caseItem;
//   });

//   return {
//     success: true,
//     message: isDuplicate
//       ? `Case created — possible duplicate of Case #${duplicateOfId}`
//       : 'Case created successfully',
//     data: result,
//   };
// }

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
  // DEFAULT STATUS
  // =========================
 let defaultStatus: any = null;

  if (data.statusId) {
    defaultStatus = await this.prisma.status.findUnique({
      where: { id: Number(data.statusId) },
    });
  }

  if (!defaultStatus) {
    defaultStatus = await this.prisma.status.findFirst({
      where: { key: 'REPORT_REQUESTED' },
    });
  }

  if (!defaultStatus) {
    throw new BadRequestException('Default status not found');
  }

  // =========================
  // DUPLICATE CHECK
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
      orderBy: { createdAt: 'asc' },
    });

    if (existingCase) {
      isDuplicate = true;
      duplicateOfId = existingCase.id;
    }
  }

  // =========================
  // ASSIGNEE VALIDATION
  // =========================
  let assignedToId: number | null = null;

  if (data.assignedToId) {
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
  // AGENCY
  // =========================
  const agencyLink = await this.resolveAgency(data);

  // =========================
  // ASSIGNEES
  // =========================
  const resolvedAssignees = await this.resolveAssignees(data.assigneeIds);

  const assigneeConnect =
    resolvedAssignees?.length
      ? { assignees: { connect: resolvedAssignees } }
      : {};

  // =========================
  // TRANSACTION
  // =========================
  const result = await this.prisma.$transaction(async (tx) => {
    // CREATE CASE
    const caseItem = await tx.case.create({
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
        caseReference :data.caseReference,

        incidentDate: data.incidentDate
          ? new Date(data.incidentDate)
          : null,

        location: data.location,
        suspectName: data.suspectName,
        age: data.age,


         reminderNote:data.reminderNote,
        reminderDate: data.reminderDate
  ? new Date(data.reminderDate)
  : null,

        title: data.title,
        description: data.description,
        incidentSummary: data.incidentSummary,

        statusId: defaultStatus.id,

        mediaType: data.mediaType,

        dateCompleted: data.dateCompleted
          ? new Date(data.dateCompleted)
          : null,

        potential: data.potential,

        isDuplicate,
        duplicateOfId,

        createdById: user.sub,
        assignedToId,
      },
    });

    // =========================
    // CASE CREATED ACTIVITY
    // =========================
// Skip activity creation for Draft cases
if (defaultStatus.key !== 'DRAFT') {
  await tx.caseActivity.create({
    data: {
      caseId: caseItem.id,
      userId: user.sub,
      type: 'CASE_CREATED',
      message: isDuplicate
        ? `Duplicate case created by ${fullName}. Linked to Case #${duplicateOfId}`
        : `Case created by ${fullName}`,
    },
  });

  await tx.caseActivity.create({
    data: {
      caseId: caseItem.id,
      userId: user.sub,
      type: 'STATUS_CHANGED',
      message: `Status set to ${defaultStatus.key} by ${fullName}`,
    },
  });

  if (resolvedAssignees?.length) {
    const collaborators = await tx.user.findMany({
      where: {
        id: {
          in: resolvedAssignees.map((a) => a.id),
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    await tx.caseActivity.createMany({
      data: collaborators.map((collaborator) => ({
        caseId: caseItem.id,
        userId: user.sub,
        type: 'COLLABORATOR_ADDED',
        message: `Collaborator ${collaborator.firstName} ${collaborator.lastName} added by ${fullName}`,
      })),
    });
  }

   if (data.notes?.trim()) {
      await tx.caseActivity.create({
        data: {
          caseId: caseItem.id,
          userId: user.sub,
          type: 'NOTE_ADDED',
          message: data.notes.trim(),
        },
      });
    }
}
    // =========================
    // NOTE ACTIVITY
    // =========================
   

    // =========================
    // 📎 CASE MEDIA (PDF UPLOAD)
    // =========================
    if (data.pdfUrl) {
      await tx.caseMedia.create({
        data: {
          caseId: caseItem.id,
          uploadedById: user.sub,
          fileName: data.pdfName ?? 'document.pdf',
          fileUrl: data.pdfUrl,
          mediaType: 'pdf',
           isReport: data.isReport ?? false
        },
      });
    }

    if (data.caseFolderUrl) {
  await tx.caseMedia.create({
    data: {
      caseId: caseItem.id,
      uploadedById: user.sub,
      fileName: data.caseFolderName ?? 'Case Folder',
      fileUrl: data.caseFolderUrl,
      mediaType: 'link',
      isReport: false,
    },
  });
}
    return caseItem;
  });

  return {
    success: true,
    message: isDuplicate
      ? `Case created — possible duplicate of Case #${duplicateOfId}`
      : 'Case created successfully',
    data: result,
  };
}

// =========================
// ACTIVITY FEED (notifications) — directional
// - Managers are notified of RESEARCHER actions (e.g. case created, media
//   requested) across all cases.
// - Researchers are notified of MANAGER actions (e.g. media approved, approved,
//   voided) on cases they created or are assigned to.
// - Nobody is notified of their own actions. Admins get nothing.
// Newest first.
// =========================
async getActivityFeed(user: any, limit = 30) {
  let where: any;

  if (user.role === 'MANAGER' || user.role === 'Owner' || user.role === 'OWNER') {
    where = {
      userId: { not: user.sub },
      user: { role: { name: 'RESEARCHER' } },
    };
  } else if (user.role === 'RESEARCHER') {
    where = {
      userId: { not: user.sub },
      user: {
        role: {
          name: {
            in: ['MANAGER', 'OWNER', 'Owner'],
          },
        },},
      case: {
        OR: [
          { createdById: user.sub },
          { assignees: { some: { id: user.sub } } },
        ],
      },
    };
  } else {
    // Admins don't work cases — no case notifications.
    return { success: true, data: [] };
  }

  const activities = await this.prisma.caseActivity.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: { select: { firstName: true, lastName: true } },
      case: { select: { id: true, caseNumber: true, suspectName: true } },
    },
  });

  return {
    success: true,
    data: activities.map((a) => ({
      id: a.id,
      type: a.type,
      message: a.message,
      createdAt: a.createdAt,
      author: a.user ? `${a.user.firstName} ${a.user.lastName}`.trim() : 'System',
      caseId: a.caseId,
      caseNumber: a.case?.caseNumber,
      suspectName: a.case?.suspectName,
    })),
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
  // STATUS FILTER
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
        {
          caseNumber: {
            contains: q,
            mode: 'insensitive',
          },
        },
        {
          suspectName: {
            contains: q,
            mode: 'insensitive',
          },
        },
        {
          title: {
            contains: q,
            mode: 'insensitive',
          },
        },
        {
          policeAgency: {
            contains: q,
            mode: 'insensitive',
          },
        },
        {
          location: {
            contains: q,
            mode: 'insensitive',
          },
        },
      ],
    });
  }

  if (and.length) {
    where.AND = and;
  }

  const cases = await this.prisma.case.findMany({
    where,

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

      writer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },

      editor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },

      editorStatus: true,

      // Uploaded media
      activities: {
        where: {
          type: 'MEDIA',
        },
        select: {
          id: true,
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

      status: true,

      media: true,
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

      writer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },

      editor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },

      editorStatus: true,

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
      // STATUS
      // =========================
      status: true,

      // =========================
      // MEDIA
      // =========================
      media: true,

      // =========================
      // DUPLICATE RELATION
      // =========================
      duplicateOf: {
        select: {
          id: true,
          caseNumber: true,
          suspectName: true,
          status: true,
          createdAt: true,
        },
      },

      duplicates: {
        select: {
          id: true,
          caseNumber: true,
          suspectName: true,
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

    },
  };
}

  // =========================
  // UPDATE CASE (WITH FULL ACTIVITY LOGGING)
  // =========================

  async update(id: number, dto: any, user: any) {
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

  // =========================
  // WRITER VALIDATION (roleId = 5)
  // =========================
  if (dto.writerId) {
    const writer = await this.prisma.user.findFirst({
      where: {
        id: Number(dto.writerId),
        roleId: 5,
      },
    });

    if (!writer) {
      throw new BadRequestException(
        'Selected user is not a valid Writer.'
      );
    }
  }

  // =========================
  // EDITOR VALIDATION (roleId = 6)
  // =========================
  if (dto.editorId) {
    const editor = await this.prisma.user.findFirst({
      where: {
        id: Number(dto.editorId),
        roleId: 6,
      },
    });

    if (!editor) {
      throw new BadRequestException(
        'Selected user is not a valid Editor.'
      );
    }
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

  const oldStatusKey = caseItem.status?.key ?? null;
  const oldAssignedTo = caseItem.assignedToId;
  const oldSuspectName = caseItem.suspectName;

  // =========================
  // STATUS UPDATE
  // =========================
  let statusData: any = {};

  if (dto.statusId && dto.statusId !== caseItem.statusId) {
    const newStatus = await this.prisma.status.findUnique({
      where: { id: Number(dto.statusId) },
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

    if (newStatus.key === 'COMPLETED') {
      statusData.dateCompleted = new Date();
    } else if (oldStatusKey === 'COMPLETED') {
      statusData.dateCompleted = null;
    }
  }

  const { note: incomingNote, assigneeIds, ...caseData } = dto;

  // =========================
  // ASSIGNEES
  // =========================
  let assigneeData: any = {};
  const resolvedAssignees = await this.resolveAssignees(assigneeIds);

  // =========================
const oldAssigneeIds = caseItem.assignees.map((a) => a.id);

const newAssigneeIds =
  resolvedAssignees !== null
    ? resolvedAssignees.map((a) => a.id)
    : oldAssigneeIds;

const addedAssigneeIds = newAssigneeIds.filter(
  (id) => !oldAssigneeIds.includes(id),
);

const removedAssigneeIds = oldAssigneeIds.filter(
  (id) => !newAssigneeIds.includes(id),
);

  if (resolvedAssignees !== null) {
    assigneeData = {
      assignees: {
        set: resolvedAssignees,
      },
    };
  }

  // =========================
  // AGENCY
  // =========================
  let agencyData: any = {};

  if (dto.policeAgency !== undefined || dto.agencyId !== undefined) {
    agencyData = await this.resolveAgency(dto);
  }

  // =========================
  // DUPLICATE CHECK
  // =========================
  let duplicateData: any = {};

  if (
    dto.suspectName &&
    dto.suspectName.trim() !== oldSuspectName
  ) {
    const existingCase = await this.prisma.case.findFirst({
      where: {
        suspectName: {
          equals: dto.suspectName.trim(),
          mode: 'insensitive',
        },
        id: { not: id },
        isDuplicate: false,
      },
    });

    duplicateData = existingCase
      ? {
          isDuplicate: true,
          duplicateOfId: existingCase.id,
        }
      : {
          isDuplicate: false,
          duplicateOfId: null,
        };
  }

   if (caseData.reminderDate) {
  caseData.reminderDate = new Date(
    `${caseData.reminderDate}T00:00:00.000Z`,
  );
}

  // =========================
  // UPDATE CASE
  // =========================
  const updated = await this.prisma.case.update({
    where: { id },

    data: {
      ...caseData,
      ...statusData,
      ...duplicateData,
      ...agencyData,
      ...assigneeData,

      ...(dto.assignedToId !== undefined && {
        assignedToId: dto.assignedToId
          ? Number(dto.assignedToId)
          : null,
      }),

      ...(dto.writerId !== undefined && {
        writerId: dto.writerId
          ? Number(dto.writerId)
          : null,
      }),

      ...(dto.editorId !== undefined && {
        editorId: dto.editorId
          ? Number(dto.editorId)
          : null,
      }),

      ...(dto.editorStatusId !== undefined && {
        editorStatusId: dto.editorStatusId
          ? Number(dto.editorStatusId)
          : null,
      }),

        ...(dto.scriptStatusId !== undefined && {
        scriptStatusId: dto.scriptStatusId
          ? Number(dto.scriptStatusId)
          : null,
      }),
    },

    include: {
      status: true,
      writer: { select: { id: true, firstName: true, lastName: true } },
      editor: { select: { id: true, firstName: true, lastName: true } },
      editorStatus: true,
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      assignees: { select: { id: true, firstName: true, lastName: true } },
      agency: true,
      media: true,
    },
  });

  // =========================
  // LOGS
  // =========================
 if (statusData.statusId) {
  const newStatusKey = updated.status?.key ?? null;

  // If this is the first time the draft is being submitted,
  // create the CASE_CREATED activity.
  if (oldStatusKey === 'DRAFT' && newStatusKey !== 'DRAFT') {
    await this.prisma.caseActivity.create({
      data: {
        caseId: id,
        userId: user.sub,
        type: 'CASE_CREATED',
        message: caseItem.isDuplicate
          ? `Duplicate case created by ${fullName}. Linked to Case #${caseItem.duplicateOfId}`
          : `Case created by ${fullName}`,
      },
    });
  }

 const statusMessage =
  oldStatusKey === 'DRAFT'
    ? `Status changed to ${newStatusKey} by ${fullName}`
    : `Status changed from ${oldStatusKey} to ${newStatusKey} by ${fullName}`;

await this.prisma.caseActivity.create({
  data: {
    caseId: id,
    userId: user.sub,
    type: 'STATUS_CHANGED',
    message: statusMessage,
  },
});
}

  if (dto.assignedToId && dto.assignedToId !== oldAssignedTo) {
    await this.prisma.caseActivity.create({
      data: {
        caseId: id,
        userId: user.sub,
        type: 'CASE_ASSIGNED',
        message: `Case assigned to user ID ${dto.assignedToId} by ${fullName}`,
      },
    });
  }

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

  if (
    dto.suspectName &&
    dto.suspectName.trim() !== oldSuspectName
  ) {
    await this.prisma.caseActivity.create({
      data: {
        caseId: id,
        userId: user.sub,
        type: 'CASE_UPDATED',
        message: `Suspect changed from "${oldSuspectName}" to "${dto.suspectName}" by ${fullName}`,

      },
    });
  }

  if (addedAssigneeIds.length) {
  const addedUsers = await this.prisma.user.findMany({
    where: {
      id: {
        in: addedAssigneeIds,
      },
    },
    select: {
      firstName: true,
      lastName: true,
    },
  });

  await this.prisma.caseActivity.createMany({
    data: addedUsers.map((u) => ({
      caseId: id,
      userId: user.sub,
      type: 'COLLABORATOR_ADDED',
      message: `Collaborator ${u.firstName} ${u.lastName} added by ${fullName}`,
    })),
  });
}

if (removedAssigneeIds.length) {
  const removedUsers = await this.prisma.user.findMany({
    where: {
      id: {
        in: removedAssigneeIds,
      },
    },
    select: {
      firstName: true,
      lastName: true,
    },
  });

  await this.prisma.caseActivity.createMany({
    data: removedUsers.map((u) => ({
      caseId: id,
      userId: user.sub,
      type: 'COLLABORATOR_REMOVED',
      message: `Collaborator ${u.firstName} ${u.lastName} removed by ${fullName}`,
    })),
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
async getDashboardAnalytics(from?: string, to?: string) {
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
  const createdAt: any = {};
  if (from) createdAt.gte = new Date(`${from}T00:00:00.000`);
  if (to)   createdAt.lte = new Date(`${to}T23:59:59.999`);
  const dateWhere =
    from || to ? { createdAt } : {};

  const cases = await this.prisma.case.findMany({
    where: dateWhere,               // <-- apply the range
    include: {
      createdBy: true,
      status: true,
    },
  });
  // const cases = await this.prisma.case.findMany({
  //   include: {
  //     createdBy: true,
  //      status: true,
  //   },
  // });

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
