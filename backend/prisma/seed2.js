import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Configuration
const TARGET_WORKERS = 200;
const COMPANY_COUNT = 5;
const TEST_WORKER_PREFIX = "ZZLOADTEST-";
const MONTHS_OF_HISTORY = 24;
const INSERT_BATCH_SIZE = 5000;

// Optional: put your exact four company codes here, for example:
// const COMPANY_CODES = ["ABC", "DEF", "GHI", "JKL"];
// Leave empty to use the first four companies sorted by code.
const COMPANY_CODES = [];

function getUaeDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => ["year", "month", "day"].includes(part.type))
      .map(({ type, value }) => [type, Number(value)]),
  );
}

function getMonthStart(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex, 1));
}

function getMonthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getDateKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function seededScore(workerNumber, dayNumber) {
  // Stable pseudo-random value in [0, 1), so reruns generate similar patterns.
  const value = (workerNumber * 9301 + dayNumber * 49297 + 233280) % 233280;
  return value / 233280;
}

function randomBetween(min, max, score) {
  return Math.round((min + score * (max - min)) * 100) / 100;
}

async function selectCompanies() {
  const allCompanies = await prisma.company.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });

  if (COMPANY_CODES.length > 0) {
    const wanted = new Set(COMPANY_CODES);
    const selected = allCompanies.filter((company) => wanted.has(company.code));

    if (selected.length !== COMPANY_COUNT) {
      throw new Error(
        `COMPANY_CODES must match exactly ${COMPANY_COUNT} existing company codes. Found ${selected.length}.`,
      );
    }

    return selected;
  }

  if (allCompanies.length < COMPANY_COUNT) {
    throw new Error(
      `Expected at least ${COMPANY_COUNT} existing companies, but found ${allCompanies.length}. Create the companies first or update COMPANY_CODES.`,
    );
  }

  return allCompanies.slice(0, COMPANY_COUNT);
}

async function insertInBatches(model, rows, batchSize = INSERT_BATCH_SIZE) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await model.createMany({ data: batch });
    console.log(`Inserted ${Math.min(i + batch.length, rows.length)} / ${rows.length}`);
  }
}

async function main() {
  console.log("Preparing synthetic load-test data...");

  // Remove only workers created by this script, making reruns safe.
  // Their related work records, payroll rates, and advances are removed by
  // the database's required worker relations/cascades.
  const previousTestWorkers = await prisma.worker.deleteMany({
    where: { workerCode: { startsWith: TEST_WORKER_PREFIX } },
  });
  console.log(`Removed ${previousTestWorkers.count} previous test workers.`);

  const companies = await selectCompanies();
  const companyIds = companies.map((company) => company.id);

  const workersOutsideSelectedCompanies = await prisma.worker.count({
    where: { companyId: { notIn: companyIds } },
  });

  if (workersOutsideSelectedCompanies > 0) {
    throw new Error(
      `${workersOutsideSelectedCompanies} existing workers belong to companies outside the selected four. Set COMPANY_CODES at the top of seed.js to the exact four company codes that should contain the test data.`,
    );
  }

  const existingWorkerCount = await prisma.worker.count();

  if (existingWorkerCount >= TARGET_WORKERS) {
    throw new Error(
      `There are already ${existingWorkerCount} non-test workers. This script adds test workers to reach ${TARGET_WORKERS}; it will not delete or modify your real workers.`,
    );
  }

  const roles = await prisma.role.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });

  if (roles.length === 0) {
    throw new Error("No roles exist. Create at least one role before running this seed.");
  }

  const uaeToday = getUaeDateParts();
  const currentMonthStart = getMonthStart(uaeToday.year, uaeToday.month - 1);
  const firstMonth = getMonthStart(
    uaeToday.year,
    uaeToday.month - 1 - (MONTHS_OF_HISTORY - 1),
  );
  const todayUtc = new Date(
    Date.UTC(uaeToday.year, uaeToday.month - 1, uaeToday.day),
  );

  const months = [];
  for (let i = 0; i < MONTHS_OF_HISTORY; i += 1) {
    months.push(
      getMonthStart(
        firstMonth.getUTCFullYear(),
        firstMonth.getUTCMonth() + i,
      ),
    );
  }

  // Balance the final worker count across the four selected companies while
  // retaining all existing workers.
  const existingCounts = await prisma.worker.groupBy({
    by: ["companyId"],
    where: { companyId: { in: companyIds } },
    _count: { _all: true },
  });
  const companyCounts = new Map(
    companies.map((company) => [company.id, 0]),
  );

  for (const item of existingCounts) {
    companyCounts.set(item.companyId, item._count._all);
  }

  const workersToCreate = TARGET_WORKERS - existingWorkerCount;
  const newWorkers = [];
  const workerRoleByCode = new Map();

  for (let i = 1; i <= workersToCreate; i += 1) {
    const company = [...companies].sort(
      (a, b) => companyCounts.get(a.id) - companyCounts.get(b.id) ||
        a.code.localeCompare(b.code),
    )[0];

    companyCounts.set(company.id, companyCounts.get(company.id) + 1);

    const workerCode = `${TEST_WORKER_PREFIX}${String(i).padStart(4, "0")}`;
    const role = roles[(i - 1) % roles.length];

    newWorkers.push({
      workerCode,
      companyId: company.id,
      name: `Load Test Worker ${String(i).padStart(3, "0")}`,
      joiningDate: firstMonth,
      jobTitle: role.name,
    });

    workerRoleByCode.set(workerCode, role.id);
  }

  if (newWorkers.length > 0) {
    await prisma.worker.createMany({ data: newWorkers });
  }

  const testWorkers = await prisma.worker.findMany({
    where: { workerCode: { startsWith: TEST_WORKER_PREFIX } },
    orderBy: { workerCode: "asc" },
    select: {
      id: true,
      workerCode: true,
      companyId: true,
      joiningDate: true,
    },
  });

  console.log(
    `Worker total: ${existingWorkerCount} existing + ${testWorkers.length} test = ${existingWorkerCount + testWorkers.length}.`,
  );
  console.log("Selected companies:");
  for (const company of companies) {
    console.log(`  ${company.code} — ${company.name}: ${companyCounts.get(company.id)} workers`);
  }

  // Monthly hourly-rate snapshots for all generated workers.
  const payrollRows = [];
  for (let workerIndex = 0; workerIndex < testWorkers.length; workerIndex += 1) {
    const worker = testWorkers[workerIndex];
    const baseRate = 8 + (workerIndex % 9) * 1.5;

    for (let monthIndex = 0; monthIndex < months.length; monthIndex += 1) {
      const variation = ((workerIndex + monthIndex * 3) % 5) * 0.25;
      payrollRows.push({
        workerId: worker.id,
        payrollMonth: months[monthIndex],
        hourlyRate: Math.round((baseRate + monthIndex * 0.1 + variation) * 100) / 100,
      });
    }
  }

  await insertInBatches(prisma.workerPayroll, payrollRows);
  console.log(`Created ${payrollRows.length} monthly payroll-rate snapshots.`);

  // One work record per generated worker per date, from the first of the
  // 24-month window through the current UAE date. Records use TIMESHEET source
  // (the schema default) and intentionally have no fake upload/source file.
  const workRows = [];
  let dayNumber = 0;

  for (
    let date = new Date(firstMonth);
    date <= todayUtc;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const dateCopy = new Date(date);
    const dayOfWeek = dateCopy.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    for (let workerIndex = 0; workerIndex < testWorkers.length; workerIndex += 1) {
      const worker = testWorkers[workerIndex];
      const score = seededScore(workerIndex + 1, dayNumber + 1);
      let status;
      let hours = null;

      if (isWeekend) {
        status = "WEEKLY_OFF";
      } else if (score < 0.935) {
        status = "WORKED";
        hours = score > 0.75 ? 9 : 8;
      } else if (score < 0.985) {
        status = "ABSENT";
      } else {
        status = "HOLIDAY";
      }

      workRows.push({
        workerId: worker.id,
        roleId: workerRoleByCode.get(worker.workerCode),
        workDate: dateCopy,
        hours,
        status,
        // source defaults to TIMESHEET; uploadId stays null because this
        // script does not create fake Excel files or upload records.
      });

      if (workRows.length >= INSERT_BATCH_SIZE) {
        await prisma.workRecord.createMany({ data: workRows });
        console.log(`Inserted work records through ${getDateKey(dateCopy)}...`);
        workRows.length = 0;
      }
    }

    dayNumber += 1;
  }

  if (workRows.length > 0) {
    await prisma.workRecord.createMany({ data: workRows });
  }

  // Seed a few advances per worker so payroll screens have non-zero deductions.
  const advanceRows = [];
  for (let workerIndex = 0; workerIndex < testWorkers.length; workerIndex += 1) {
    const worker = testWorkers[workerIndex];

    for (let monthIndex = 2; monthIndex < months.length; monthIndex += 4) {
      const monthStart = months[monthIndex];
      const nextMonth = getMonthStart(
        monthStart.getUTCFullYear(),
        monthStart.getUTCMonth() + 1,
      );
      const daysInMonth = Math.round(
        (nextMonth.getTime() - monthStart.getTime()) / 86400000,
      );
      const paidDay = Math.min(15 + (workerIndex % 10), daysInMonth);
      const paidAt = new Date(
        Date.UTC(
          monthStart.getUTCFullYear(),
          monthStart.getUTCMonth(),
          paidDay,
          9,
        ),
      );

      if (paidAt > new Date()) continue;

      advanceRows.push({
        workerId: worker.id,
        payrollMonth: monthStart,
        amount: randomBetween(250, 1200, seededScore(workerIndex + 1, monthIndex + 17)),
        paidAt,
        note: "Synthetic load-test advance",
      });
    }
  }

  if (advanceRows.length > 0) {
    await insertInBatches(prisma.advancePayment, advanceRows);
  }

  const finalWorkerCount = await prisma.worker.count();
  const testWorkRecordCount = await prisma.workRecord.count({
    where: { workerId: { in: testWorkers.map((worker) => worker.id) } },
  });
  const testPayrollCount = await prisma.workerPayroll.count({
    where: { workerId: { in: testWorkers.map((worker) => worker.id) } },
  });
  const testAdvanceCount = await prisma.advancePayment.count({
    where: { workerId: { in: testWorkers.map((worker) => worker.id) } },
  });

  console.log("\nSeed complete.");
  console.log(`Workers in database: ${finalWorkerCount}`);
  console.log(`Test work records: ${testWorkRecordCount}`);
  console.log(`Test monthly payroll rates: ${testPayrollCount}`);
  console.log(`Test advance payments: ${testAdvanceCount}`);
  console.log(`Payroll/work history starts: ${getMonthKey(firstMonth)}`);
  console.log(`Current UAE date: ${getDateKey(todayUtc)}`);
  console.log(
    "\nNote: test work records use the TIMESHEET source but have no linked TimesheetUpload because this script does not generate actual Excel files.",
  );
}

main()
  .catch((error) => {
    console.error("\nSeed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
