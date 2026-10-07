import { PrismaClient } from "@prisma/client";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashPassword, normalizeEmail } from "../src/utils/password.js";

const prisma = new PrismaClient();
const rl = createInterface({ input: stdin, output: stdout });

try {
  const name = (await rl.question("Name: ")).trim();
  const email = normalizeEmail(await rl.question("Email: "));
  const password = await rl.question("Password: ");

  if (!name || !email || password.length < 8) {
    throw new Error("Name and email are required; use a password of at least 8 characters.");
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: { name, email, passwordHash },
    select: { id: true, name: true, email: true },
  });

  console.log("User created:", user);
} catch (error) {
  console.error("Could not create user:", error.message);
} finally {
  rl.close();
  await prisma.$disconnect();
}