import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_STATUSES = [
  { key: 'REPORT_REQUESTED', label: 'Report Requested', color: 'blue', stage: 'Intake', order: 1 },
  { key: 'REPORT_RECEIVED', label: 'Report Received', color: 'orange', stage: 'Intake', order: 2 },
  { key: 'AWAITING_REVIEW', label: 'Awaiting Review', color: 'amber', stage: 'Review', order: 3 },
  { key: 'APPROVED', label: 'Approved', color: 'green', stage: 'Review', order: 4 },
  { key: 'MEDIA_REQUESTED', label: 'Media Requested', color: 'purple', stage: 'Production', order: 5 },
  { key: 'COMPLETED', label: 'Completed', color: 'emerald', stage: 'Production', order: 6 },
  { key: 'VOIDED', label: 'Voided', color: 'red', stage: 'Closed', order: 7 },
];

async function main() {
  console.log('Seeding statuses...');

  for (const status of DEFAULT_STATUSES) {
    await prisma.status.upsert({
      where: { key: status.key },
      update: {
        label: status.label,
        color: status.color,
        stage: status.stage,
        order: status.order,
      },
      create: {
        key: status.key,
        label: status.label,
        color: status.color,
        stage: status.stage,
        order: status.order,
      },
    });
  }

  console.log('Statuses seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });