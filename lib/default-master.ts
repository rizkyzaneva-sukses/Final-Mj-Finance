import type { Prisma, PrismaClient } from "@prisma/client";

export const defaultMinistries = [
  [1, "Kementerian SDM"],
  [2, "Keuangan"],
  [3, "Kementerian Pendidikan"],
  [4, "Kementerian Sosial"],
  [5, "KemenPorPar"],
  [6, "Kementerian Luar Negeri"],
  [7, "Kominfo"],
  [8, "Kementerian Muslimah"],
  [9, "Menkumham & Nilai"],
  [96, "Yayasan"],
  [98, "Kabinet 25"],
] as const;

export const defaultEvents = [
  ["Bukber 2026", "Kementerian SDM", null],
  ["ID Card", "Kementerian SDM", null],
  ["ID CARD MJ", "Kementerian SDM", null],
  ["Pembuatan ID CARD", "Kementerian SDM", null],
  ["Training For Mentor", "Kementerian SDM", null],
  ["SERTIJAB 26", "Keuangan", null],
  ["Buka Rekening Baru", "Keuangan", null],
  ["Ngopbis", "Kementerian Pendidikan", null],
  ["Baksos", "Kementerian Sosial", null],
  ["Infaq", "Kementerian Sosial", "Rutin"],
  ["Santunan", "Kementerian Sosial", null],
  ["Mabit Juara", "KemenPorPar", null],
  ["Transaksi Kabinet 2025", "Kabinet 25", null],
  ["UMROH MJ", "Kabinet 25", null],
] as const;

export const defaultIncomeTypes = [
  { ministryName: "Kementerian SDM", eventName: "Bukber 2026", name: "Pendaftaran", uniqueCode: "122" },
  { ministryName: "Kementerian SDM", eventName: "Bukber 2026", name: "Sponsorship", uniqueCode: "112" },
  { ministryName: "Kementerian SDM", eventName: "Bukber 2026", name: "Pendapatan Event Lain lain", uniqueCode: null },
  { ministryName: "Kementerian SDM", eventName: "Bukber 2026", name: "Pengembalian Biaya Transfer", uniqueCode: null },
  { ministryName: "Kementerian SDM", eventName: "Pembuatan ID CARD", name: "Pendaftaran", uniqueCode: "121" },
  { ministryName: "Kementerian SDM", eventName: "ID CARD MJ", name: "Pendaftaran", uniqueCode: null },
  { ministryName: "Keuangan", eventName: "Buka Rekening Baru", name: "Alih Dana", uniqueCode: "299" },
  { ministryName: "Keuangan", eventName: "SERTIJAB 26", name: "Infaq Operasional", uniqueCode: "212" },
  { ministryName: "Keuangan", eventName: "SERTIJAB 26", name: "Pengembalian Biaya Transfer", uniqueCode: null },
  { ministryName: "Kementerian Pendidikan", eventName: "Ngopbis", name: "Pendaftaran", uniqueCode: "311" },
  { ministryName: "Kementerian Pendidikan", eventName: "Ngopbis", name: "Sponsorship", uniqueCode: "312" },
  { ministryName: "Kementerian Pendidikan", eventName: "Ngopbis", name: "Pengembalian Biaya Transfer", uniqueCode: null },
  { ministryName: "Kementerian Sosial", eventName: "Infaq", name: "Infaq Rutinan", uniqueCode: "415" },
  { ministryName: "KemenPorPar", eventName: "Mabit Juara", name: "Pendaftaran", uniqueCode: "511" },
  { ministryName: "KemenPorPar", eventName: "Mabit Juara", name: "Sponsorship", uniqueCode: "512" },
  { ministryName: "Kabinet 25", eventName: "Transaksi Kabinet 2025", name: "Transaksi Lama", uniqueCode: null },
] as const;

export const defaultIncomeMasters = [
  "Alih Dana",
  "Infaq Event",
  "Infaq Operasional",
  "Infaq Program",
  "Infaq Program Mensos",
  "Infaq Rutinan",
  "Kerja sama program",
  "Sponsorship",
  "Pendaftaran",
  "Pendapatan Event Lain lain",
  "Pengembalian Biaya Transfer",
  "Penjualan tiket",
  "Transaksi Lama",
] as const;

export const defaultExpenseTypes = [
  "Akomodasi",
  "Alih Dana",
  "Biaya admin bank",
  "Biaya transfer",
  "Honor narasumber",
  "Honor panitia",
  "Iklan/promosi",
  "Konsumsi",
  "Refund",
  "Santunan",
  "Sewa tempat",
  "Transaksi Lama",
  "Transport & Ongkir",
] as const;

type DbLike = PrismaClient | Prisma.TransactionClient;
const itemKey = (value: string | null | undefined) => String(value || "").trim().toLowerCase();

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

  const [eventRows, incomeMasterRows] = await Promise.all([
    db.event.findMany({ include: { ministry: true } }),
    db.incomeMaster.findMany(),
  ]);
  const eventByKey = new Map(
    eventRows.map((row) => [`${itemKey(row.ministry.name)}::${itemKey(row.name)}`, row]),
  );
  const incomeMasterByName = new Map(incomeMasterRows.map((row) => [row.name, row.id]));

  for (const type of defaultIncomeTypes) {
    const event = eventByKey.get(`${itemKey(type.ministryName)}::${itemKey(type.eventName)}`);
    const incomeMasterId = incomeMasterByName.get(type.name) || null;
    if (!event) continue;
    const existingByEventName = await db.incomeType.findUnique({
      where: { eventId_name: { eventId: event.id, name: type.name } },
    });
    const existingByCode = type.uniqueCode
      ? await db.incomeType.findUnique({ where: { uniqueCode: type.uniqueCode } })
      : null;

    if (existingByEventName) {
      await db.incomeType.update({
        where: { id: existingByEventName.id },
        data: {
          incomeMasterId,
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
          incomeMasterId,
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
        incomeMasterId,
      },
    });
  }
}
