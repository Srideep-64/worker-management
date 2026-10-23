import { prisma } from "../lib/prisma.js";

export async function getUsers(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    res.json({ users });
  } catch (error) {
    next(error);
  }
}