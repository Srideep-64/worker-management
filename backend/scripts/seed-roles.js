import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const roleDefs = [
  { code: "ET", name: "Electrician" },
  { code: "PT", name: "Painter" },
  { code: "SF", name: "Steel Fixer" },
  { code: "MS", name: "Mason" },
  { code: "HP", name: "Helper" },
  { code: "WD", name: "Welder" },
  { code: "DM", name: "Ductman" },
  { code: "CP", name: "Carpenter" },
  { code: "PB", name: "Plumber" },
  { code: "OR", name: "Other role" },
];

async function main() {
  console.log("Seeding roles...");

  for (const role of roleDefs) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
      },
      create: role,
    });
  }

  console.log("Roles seeded successfully.");
}

main()
  .catch((error) => {
    console.error("Failed to seed roles:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });