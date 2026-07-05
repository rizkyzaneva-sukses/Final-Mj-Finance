import type { Prisma, PrismaClient } from "@prisma/client";

export const defaultMinistries = [
  [0, "Keuangan"],
  [1, "Kementerian SDM"],
  [3, "Kementerian Pendidikan"],
  [4, "Kementerian Sosial"],
  [5, "KemenPorPar"],
  [6, "Kementerian Luar Negeri"],
  [7, "Kominfo"],
  [8, "Kementerian Muslimah"],
  [9, "Menkumham & Nilai"],
  [98, "SDM LAMA"],
  [96, "Yayasan"],
] as const;

export const defaultEvents = [
  ["Bukber 2026", "Kementerian SDM", null],
  ["SERTIJAB 26", "Keuangan", null],
  ["UMROH MJ", "SDM LAMA", null],
  ["Baksos", "Kementerian Sosial", null],
  ["Santunan", "Kementerian Sosial", null],
  ["Ngopbis", "Kementerian Pendidikan", null],
  ["Training For Mentor", "Kementerian SDM", null],
  ["Mabit Juara", "KemenPorPar", null],
  ["CAMPING", "KemenPorPar", null],
  ["Pembuatan ID CARD", "Kementerian SDM", null],
  ["ID CARD MJ", "Kementerian SDM", null],
  ["Infaq", "Kementerian Sosial", "Rutin"],
  ["ID Card", "Kementerian SDM", null],
] as const;

export const defaultIncomeTypes = [
  { eventName: "Bukber 2026", name: "Sponsorship", uniqueCode: "121" },
  { eventName: "Bukber 2026", name: "Pendaftaran", uniqueCode: "122" },
] as const;

export const defaultIncomeMasters = [
  "Sponsorship",
  "Pendaftaran",
  "Infaq Event",
  "Penjualan tiket",
  "Kerja sama program",
  "Infaq Rutinan",
  "Infaq Program",
] as const;

export const defaultExpenseTypes = [
  "Honor narasumber",
  "Honor panitia",
  "Biaya admin bank",
  "Biaya transfer",
  "Santunan",
  "Transport & Ongkir",
  "Akomodasi",
  "Iklan/promosi",
  "Sewa tempat",
  "Konsumsi",
] as const;

type DbLike = PrismaClient | Prisma.TransactionClient;

export async function seedDefaultMaster(db: DbLike) {
  for (const name of defaultIncomeMasters) {
    await db.incomeMaster.upsert({
      where: { name },
      update: { active: true },
      create: { name },
    });
  }

  for (const name of defaultExpenseTypes) {
    await db.expenseType.upsert({
      where: { name },
      update: { active: true },
      create: { name },
    });
  }

  for (const [code, name] of defaultMinistries) {
    await db.ministry.upsert({
      where: { code },
      update: { name, active: true },
      create: { code, name },
    });
  }

  const ministryRows = await db.ministry.findMany();
  const ministryByName = new Map(ministryRows.map((row) => [row.name, row.id]));

  for (const [name, ministryName, category] of defaultEvents) {
    const ministryId = ministryByName.get(ministryName);
    if (!ministryId) continue;
    await db.event.upsert({
      where: { ministryId_name: { ministryId, name } },
      update: { category, active: true },
      create: { name, category, ministryId },
    });
  }

  for (const type of defaultIncomeTypes) {
    const event = await db.event.findFirst({ where: { name: type.eventName } });
    const incomeMaster = await db.incomeMaster.findUnique({ where: { name: type.name } });
    if (!event) continue;
    const existingByEventName = await db.incomeType.findUnique({
      where: { eventId_name: { eventId: event.id, name: type.name } },
    });
    const existingByCode = await db.incomeType.findUnique({ where: { uniqueCode: type.uniqueCode } });

    if (existingByEventName) {
      await db.incomeType.update({
        where: { id: existingByEventName.id },
        data: {
          incomeMasterId: incomeMaster?.id || null,
          active: true,
          ...(existingByCode && existingByCode.id !== existingByEventName.id ? {} : { uniqueCode: type.uniqueCode }),
        },
      });
      if (existingByCode && existingByCode.id !== existingByEventName.id) {
        console.warn(
          `[seed] Kode unik ${type.uniqueCode} sudah dipakai mapping lain, jadi mapping default ${event.name} / ${type.name} diaktifkan tanpa memindahkan kode itu.`,
        );
      }
      continue;
    }

    if (existingByCode) {
      await db.incomeType.update({
        where: { id: existingByCode.id },
        data: {
          eventId: event.id,
          name: type.name,
          uniqueCode: type.uniqueCode,
          incomeMasterId: incomeMaster?.id || null,
          active: true,
        },
      });
      continue;
    }

    await db.incomeType.create({
      data: {
        eventId: event.id,
        name: type.name,
        uniqueCode: type.uniqueCode,
        incomeMasterId: incomeMaster?.id || null,
      },
    });
  }
}
