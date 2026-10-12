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

    const records = [];

    for (const worker of companyAWorkers) {
      for (let day = 1; day <= 5; day++) {
        records.push({
          workerId: worker.id,
          roleId: roleByIndex[day % roleByIndex.length].id,
          workDate: new Date(2026, 8, day),
          hours: day === 5 ? null : 8,
          status: day === 5 ? "WEEKLY_OFF" : "WORKED",
          uploadId: upload.id,
          source:"TIMESHEET",
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