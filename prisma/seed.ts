import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ministries = [
  [0, "Keuangan"],
  [1, "Kementerian SDM"],
  [2, "Kementerian Ekonomi"],
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

const events = [
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

async function main() {
  for (const [code, name] of ministries) {
    await prisma.ministry.upsert({
      where: { code },
      update: { name, active: true },
      create: { code, name },
    });
  }

  const ministryRows = await prisma.ministry.findMany();
  const ministryByName = new Map(ministryRows.map((row) => [row.name, row.id]));

  for (const [name, ministryName, category] of events) {
    const ministryId = ministryByName.get(ministryName);
    if (!ministryId) continue;
    await prisma.event.upsert({
      where: { ministryId_name: { ministryId, name } },
      update: { category, active: true },
      create: { name, category, ministryId },
    });
  }

  const bukber = await prisma.event.findFirst({ where: { name: "Bukber 2026" } });
  if (bukber) {
    for (const type of [
      { name: "Sponsor", uniqueCode: "121" },
      { name: "Pendaftaran", uniqueCode: "122" },
    ]) {
      await prisma.incomeType.upsert({
        where: { eventId_name: { eventId: bukber.id, name: type.name } },
        update: { uniqueCode: type.uniqueCode, active: true },
        create: { eventId: bukber.id, ...type },
      });
    }
  }
}

main()
  .then(() => console.log("Master data MUDA JUARA berhasil disiapkan."))
  .finally(() => prisma.$disconnect());
