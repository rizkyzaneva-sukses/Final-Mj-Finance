import { PrismaClient } from "@prisma/client";
import { seedDefaultMaster } from "../lib/default-master";

const prisma = new PrismaClient();

async function main() {
  await seedDefaultMaster(prisma);
}

main()
  .then(() => console.log("Master data MUDA JUARA berhasil disiapkan."))
  .finally(() => prisma.$disconnect());
