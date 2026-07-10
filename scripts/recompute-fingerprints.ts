import { PrismaClient } from "@prisma/client";
import { fingerprint } from "../lib/matching";

const prisma = new PrismaClient();

async function main() {
  const transactions = await prisma.transaction.findMany({
    select: {
      id: true,
      transactionDate: true,
      description: true,
      amount: true,
      direction: true,
      source: true,
      accountHolder: true,
      accountNumber: true,
      sourceReference: true,
      fingerprint: true,
    },
  });

  const groups = new Map<string, typeof transactions>();
  for (const row of transactions) {
    const hash = fingerprint({
      transactionDate: row.transactionDate,
      description: row.description,
      amount: Number(row.amount),
      direction: row.direction,
      source: row.source,
      accountHolder: row.accountHolder,
      accountNumber: row.accountNumber,
      sourceReference: row.sourceReference,
    });
    const bucket = groups.get(hash) || [];
    bucket.push(row);
    groups.set(hash, bucket);
  }

  let updated = 0;
  let skipped = 0;
  const conflicts: { hash: string; rows: typeof transactions }[] = [];

  for (const [hash, rows] of groups) {
    if (rows.length > 1) {
      conflicts.push({ hash, rows });
      skipped += rows.length;
      continue;
    }
    const [row] = rows;
    if (row.fingerprint === hash) continue;
    await prisma.transaction.update({ where: { id: row.id }, data: { fingerprint: hash } });
    updated++;
  }

  console.log(`Fingerprint diperbarui: ${updated}`);
  console.log(`Dilewati karena duplikat baru terdeteksi: ${skipped}`);

  if (conflicts.length) {
    console.log("\nDuplikat yang perlu ditinjau manual (hapus salah satu lewat halaman /transactions):");
    for (const { rows } of conflicts) {
      console.log("---");
      for (const row of rows) {
        console.log(`  id=${row.id} | ${row.transactionDate.toISOString().slice(0, 10)} | ${row.source} | ${row.accountHolder || "Belum terbaca"} | Rp ${Number(row.amount).toLocaleString("id-ID")} | ${row.description}`);
      }
    }
  }
}

main()
  .then(() => console.log("\nSelesai."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
