import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding RBAC system...');

  // =========================
  // 0. CLEAN RESET (IMPORTANT)
  // =========================
  await prisma.rolePermission.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();

  // reset sequences (FORCE ID ORDER 1,2,3)
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE roles_id_seq RESTART WITH 1`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE permissions_id_seq RESTART WITH 1`);

  // =========================
  // 1. ROLES (FORCE ORDER)
  // =========================
  const adminRole = await prisma.role.create({
    data: {
      name: 'ADMIN',
      description: 'System Administrator',
    },
  });

  const managerRole = await prisma.role.create({
    data: {
      name: 'MANAGER',
      description: 'Case Manager',
    },
  });

  const researcherRole = await prisma.role.create({
    data: {
      name: 'RESEARCHER',
      description: 'Research Staff',
    },
  });

  // =========================
  // 2. PERMISSIONS
  // =========================
  const permissionNames = [
    'case.create',
    'case.read.own',
    'case.read.all',
    'case.update.own',
    'case.update.all',
    'case.delete',
    'case.assign',
    'case.change_status',

    'user.create',
    'user.read',
    'user.update',
    'user.delete',
    'user.manage_roles',

    'dashboard.view',
    'dashboard.view_all',

    'role.create',
    'role.read',
    'role.update',
    'role.delete',

    'permission.create',
    'permission.read',
    'permission.update',
    'permission.delete',
  ];

  const permissions = await Promise.all(
    permissionNames.map((name) =>
      prisma.permission.create({
        data: {
          name,
          description: name,
        },
      }),
    ),
  );

  const permissionMap = Object.fromEntries(
    permissions.map((p) => [p.name, p.id]),
  );

  // =========================
  // 3. ROLE → PERMISSIONS
  // =========================

  // ADMIN = ALL
  await prisma.rolePermission.createMany({
    data: permissions.map((p) => ({
      roleId: adminRole.id,
      permissionId: p.id,
    })),
  });

  // MANAGER — reviews work, sees team-wide analytics, configures agencies.
  const managerPermissions = [
    'case.read.all',
    'case.update.all',
    'case.assign',
    'case.change_status',
    'dashboard.view',
    'dashboard.view_all',
  ];

  await prisma.rolePermission.createMany({
    data: managerPermissions.map((name) => ({
      roleId: managerRole.id,
      permissionId: permissionMap[name],
    })),
  });

  // RESEARCHER — reads all cases (sees others' work) but only edits their own
  // or assigned cases; can create and assign collaborators.
  const researcherPermissions = [
    'case.create',
    'case.read.all',
    'case.read.own',
    'case.update.own',
    'case.change_status',
    'case.assign',
    'dashboard.view',
  ];

  await prisma.rolePermission.createMany({
    data: researcherPermissions.map((name) => ({
      roleId: researcherRole.id,
      permissionId: permissionMap[name],
    })),
  });

  console.log('✅ RBAC Seed completed successfully');
  console.log('ADMIN ID:', adminRole.id);
  console.log('MANAGER ID:', managerRole.id);
  console.log('RESEARCHER ID:', researcherRole.id);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });