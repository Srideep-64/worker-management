import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

// Seed passwords are deliberately simple — this is local/dev data only.
// Change every user's password immediately in any shared/staging environment.
const SEED_PASSWORD = "ChangeMe123!";

async function main() {
  console.log("Seeding users...");

  const passwordHash = await argon2.hash(SEED_PASSWORD, {
    type: argon2.argon2id,
  });

  const users = await Promise.all(
    [
      { name: "Father (Admin)", email: "admin@yts.local" },
      { name: "Assistant One", email: "assistant1@yts.local" },
      { name: "Assistant Two", email: "assistant2@yts.local" },
      { name: "Assistant Three", email: "assistant3@yts.local" },
    ].map((u) =>
      prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: { ...u, passwordHash },
      })
    )
  );

  const uploader = users[0];

  // ------------------------------------------------------------
  // Companies
  // ------------------------------------------------------------

  console.log("Seeding companies...");

  const [companyA, companyB, companyC] = await Promise.all(
    [
      { code: "A", name: "Al Noor Manpower Supply LLC" },
      { code: "B", name: "Gulf Skilled Labour Services LLC" },
      { code: "C", name: "Emirates Workforce Solutions LLC" },
    ].map((c) =>
      prisma.company.upsert({
        where: { code: c.code },
        update: {},
        create: c,
      })
    )
  );

  // ------------------------------------------------------------
  // Roles
  // ------------------------------------------------------------

  console.log("Seeding roles...");

  const roleDefs = [
    { code: "ET", name: "Electrician" },
    { code: "PT", name: "Painter" },
    { code: "SF", name: "Steel Fixer" },
    { code: "MS", name: "Mason" },
    { code: "HP", name: "Helper" },
  ];

  const roles = await Promise.all(
    roleDefs.map((r) =>
      prisma.role.upsert({
        where: { code: r.code },
        update: {},
        create: r,
      })
    )
  );

  // ------------------------------------------------------------
  // Clients
  // ------------------------------------------------------------

  console.log("Seeding clients...");

  const clientDefs = [
    {
      code: "CL-001",
      name: "Meraas Construction",
      phone: "+971-4-555-0101",
      active: true,
    },
    {
      code: "CL-002",
      name: "Arabtec Site 12",
      phone: "+971-4-555-0202",
      active: true,
    },
    {
      code: "CL-003",
      name: "Al Futtaim Facilities",
      phone: "+971-4-555-0303",
      active: true,
    },
    {
      code: "CL-004",
      name: "Damac Towers Maintenance",
      phone: "+971-4-555-0404",
      active: false,
    },
  ];

  const clients = await Promise.all(
    clientDefs.map((c) =>
      prisma.client.upsert({
        where: { code: c.code },
        update: {},
        create: c,
      })
    )
  );

  // ------------------------------------------------------------
  // Workers
  // ------------------------------------------------------------

  console.log("Seeding workers...");

  const nationalities = [
    "India",
    "Pakistan",
    "Bangladesh",
    "Nepal",
    "Philippines",
  ];

  const jobTitles = [
    "Electrician",
    "Painter",
    "Steel Fixer",
    "Mason",
    "Helper",
  ];

  const workerDefs = [];

  const perCompany = 5;

  // Worker-code format:
  //
  // Company A -> OS42200 ... OS42204
  // Company B -> OS52200 ... OS52204
  // Company C -> OS62200 ... OS62204
  //
  // All codes satisfy /^OS\d{5}$/.

  for (const [company, prefix] of [
    [companyA, "OS42"],
    [companyB, "OS52"],
    [companyC, "OS62"],
  ]) {
    for (let i = 0; i < perCompany; i++) {
      const num = String(200 + i).padStart(3, "0");

      const workerCode = `${prefix}${num}`;

      workerDefs.push({
        workerCode,
        companyId: company.id,
        name: `Worker ${workerCode}`,
        nationality: nationalities[i % nationalities.length],
        dateOfBirth: new Date(
          1985 + i,
          i % 12,
          (i % 27) + 1
        ),
        phone: `+971-50-${100000 + i}`,
        jobTitle: jobTitles[i % jobTitles.length],
        joiningDate: new Date(
          2023,
          i % 12,
          (i % 27) + 1
        ),
        passportNumber: `P${prefix}${1000000 + i}`,
        passportExpiry: new Date(2027, i % 12, 15),
        visaNumber: `V${prefix}${2000000 + i}`,
        visaExpiry: new Date(
          2026,
          (i + 1) % 12,
          10
        ), // some intentionally soon for the "expiring documents" widget
        emiratesIdNumber: `784-19${80 + i}-${1000000 + i}-1`,
        emiratesIdExpiry: new Date(
          2026,
          (i + 2) % 12,
          20
        ),
        labourCardNumber: `LC-${prefix}-${i + 1}`,
      });
    }
  }

  const workers = [];

  for (const w of workerDefs) {
    const worker = await prisma.worker.upsert({
      where: { workerCode: w.workerCode },
      update: {},
      create: w,
    });

    workers.push(worker);
  }

  // ------------------------------------------------------------
  // Worker Assignments
  // ------------------------------------------------------------

  console.log("Seeding worker assignments...");

  for (let i = 0; i < workers.length; i++) {
    const worker = workers[i];

    // Skip the inactive client (CL-004) for current assignments.
    const client = clients[i % (clients.length - 1)];

    // Assignments have no natural unique key, so re-running the seed
    // checks for an existing row first rather than relying on upsert.
    const alreadySeeded = await prisma.workerAssignment.findFirst({
      where: { workerId: worker.id },
    });

    if (alreadySeeded) continue;

    const hasHistory = i % 3 === 0;

    if (hasHistory) {
      const previousClient = clients[(i + 1) % clients.length];

      await prisma.workerAssignment.create({
        data: {
          workerId: worker.id,
          clientId: previousClient.id,
          startDate: new Date(2026, 0, 1),
          endDate: new Date(2026, 5, 30),
        },
      });

      await prisma.workerAssignment.create({
        data: {
          workerId: worker.id,
          clientId: client.id,
          startDate: new Date(2026, 6, 1),
          endDate: null,
        },
      });
    } else {
      await prisma.workerAssignment.create({
        data: {
          workerId: worker.id,
          clientId: client.id,
          startDate: new Date(2026, 6, 1),
          endDate: null,
        },
      });
    }
  }

  // ------------------------------------------------------------
  // Sample ACTIVE Timesheet + Work Records
  // Company A, September 2026
  // ------------------------------------------------------------

  console.log(
    "Seeding a sample ACTIVE timesheet upload + work records for company A..."
  );

  const periodMonth = new Date(2026, 8, 1);

  const existingUpload = await prisma.timesheetUpload.findFirst({
    where: {
      companyId: companyA.id,
      periodMonth,
      status: "ACTIVE",
    },
  });

  if (!existingUpload) {
    const upload = await prisma.timesheetUpload.create({
      data: {
        companyId: companyA.id,
        periodMonth,
        originalFilename: "company-A-sept-2026.xlsx",
        storageKey: "seed/company-A-sept-2026.xlsx",
        uploadedById: uploader.id,
        status: "ACTIVE",
        rowCount: perCompany * 5,
        errorCount: 0,
      },
    });

    // Company A workers now use OS42xxx worker codes.
    const companyAWorkers = workers.filter((w) =>
      w.workerCode.startsWith("OS42")
    );

    const roleByIndex = roles;
    const clientForRecords = clients[0];

    const records = [];

    for (const worker of companyAWorkers) {
      for (let day = 1; day <= 5; day++) {
        records.push({
          workerId: worker.id,
          clientId: clientForRecords.id,
          roleId: roleByIndex[day % roleByIndex.length].id,
          workDate: new Date(2026, 8, day),
          hours: day === 5 ? null : 8,
          status: day === 5 ? "WEEKLY_OFF" : "WORKED",
          uploadId: upload.id,
        });
      }
    }

    await prisma.workRecord.createMany({
      data: records,
      skipDuplicates: true,
    });
  }

  // ------------------------------------------------------------
  // Complete
  // ------------------------------------------------------------

  console.log("\nSeed complete.");

  console.log(
    `Log in with any seeded user, e.g. admin@yts.local / ${SEED_PASSWORD}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });