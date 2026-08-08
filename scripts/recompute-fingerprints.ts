/**
 * Hitung ulang fingerprint transaksi + audit pergeseran tanggal QRIS.
 *
 * Pemakaian:
 *   npm run db:recompute-fingerprints            -> DRY RUN (default, tidak menulis apa pun)
 *   npm run db:recompute-fingerprints -- --apply -> tulis perubahan ke database
 *
 * Kenapa audit QRIS ada di sini?
 * Sebelum perbaikan di lib/qris.ts, tanggal QRIS dari Excel tersimpan geser +7 jam
 * (wall time sel dibaca sebagai UTC). Fingerprint memakai `transactionDate.toISOString()`,
 * jadi baris lama yang tanggalnya geser TIDAK akan dikenali sebagai duplikat ketika file
 * yang sama diimpor ulang dengan parser yang sudah benar -> pemasukan bisa dobel.
 * Script ini menandai baris-baris tersebut sebelum masalahnya terjadi.
 */

import { PrismaClient } from "@prisma/client";
import { fingerprint } from "../lib/matching";

const prisma = new PrismaClient();

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
/** Jam WIB 00:00–06:59 = kandidat hasil pergeseran +7 jam dari transaksi sore/malam (17:00–23:59). */
const SHIFT_SUSPECT_MAX_HOUR = 6;
const MAX_LISTED = 25;

const KNOWN_FLAGS = new Set(["--apply", "--dry-run", "--help"]);
const flags = new Set(process.argv.slice(2));
const unknownFlags = [...flags].filter((flag) => !KNOWN_FLAGS.has(flag));
// Default AMAN: tanpa --apply script hanya melapor. --dry-run selalu menang atas --apply.
const apply = flags.has("--apply") && !flags.has("--dry-run");

function loadTransactions() {
  return prisma.transaction.findMany({
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
      isDraft: true,
    },
    orderBy: { transactionDate: "asc" },
  });
}

type Row = Awaited<ReturnType<typeof loadTransactions>>[number];

function hashOf(row: Row, transactionDate = row.transactionDate) {
  return fingerprint({
    transactionDate,
    description: row.description,
    amount: Number(row.amount),
    direction: row.direction,
    source: row.source,
    accountHolder: row.accountHolder,
    accountNumber: row.accountNumber,
    sourceReference: row.sourceReference,
  });
}

/** Tampilkan Date sebagai waktu dinding WIB (bukan UTC) supaya mudah dicocokkan dengan Excel. */
function wib(date: Date) {
  return `${new Date(date.getTime() + WIB_OFFSET_MS).toISOString().replace("T", " ").slice(0, 19)} WIB`;
}

function wibHour(date: Date) {
  return new Date(date.getTime() + WIB_OFFSET_MS).getUTCHours();
}

function rupiah(value: unknown) {
  return `Rp ${Number(value).toLocaleString("id-ID")}`;
}

function describe(row: Row) {
  return `id=${row.id} | ${wib(row.transactionDate)} | ${row.source}${row.isDraft ? " (draft)" : ""} | ${rupiah(row.amount)} | ${row.description}`;
}

function listed<T>(items: T[], render: (item: T) => string) {
  for (const item of items.slice(0, MAX_LISTED)) console.log(render(item));
  if (items.length > MAX_LISTED) console.log(`  … dan ${items.length - MAX_LISTED} baris lainnya.`);
}

async function main() {
  if (flags.has("--help")) {
    console.log("Hitung ulang fingerprint transaksi + audit pergeseran tanggal QRIS.\n");
    console.log("  npm run db:recompute-fingerprints                -> DRY RUN (default, tidak menulis apa pun)");
    console.log("  npm run db:recompute-fingerprints -- --dry-run   -> sama seperti di atas, eksplisit");
    console.log("  npm run db:recompute-fingerprints -- --apply     -> tulis fingerprint baru ke database");
    return;
  }
  if (unknownFlags.length) {
    console.log(`Flag tidak dikenal diabaikan: ${unknownFlags.join(", ")}. Pakai --help untuk daftar flag.\n`);
  }

  console.log("=".repeat(72));
  console.log(apply
    ? "MODE: --apply  → perubahan AKAN ditulis ke database."
    : "MODE: DRY RUN  → tidak ada satu pun data yang diubah.");
  console.log("=".repeat(72));

  const transactions = await loadTransactions();

  // ---- 1. Hitung ulang fingerprint dari data yang tersimpan sekarang -------------------
  const groups = new Map<string, Row[]>();
  for (const row of transactions) {
    const hash = hashOf(row);
    const bucket = groups.get(hash) || [];
    bucket.push(row);
    groups.set(hash, bucket);
  }

  const pending: { row: Row; hash: string }[] = [];
  const conflicts: { hash: string; rows: Row[] }[] = [];
  let alreadyCorrect = 0;

  for (const [hash, rows] of groups) {
    if (rows.length > 1) {
      conflicts.push({ hash, rows });
      continue;
    }
    const [row] = rows;
    if (row.fingerprint === hash) {
      alreadyCorrect++;
      continue;
    }
    pending.push({ row, hash });
  }

  const conflictRowCount = conflicts.reduce((total, item) => total + item.rows.length, 0);

  // ---- 2. Audit pergeseran tanggal QRIS ------------------------------------------------
  const qrisRows = transactions.filter((row) => row.source === "QRIS_XLSX");
  const suspects = qrisRows.filter((row) => wibHour(row.transactionDate) <= SHIFT_SUSPECT_MAX_HOUR);

  const correctedHashes = new Map<string, Row[]>();
  const shifted = suspects.map((row) => {
    const corrected = new Date(row.transactionDate.getTime() - WIB_OFFSET_MS);
    const hash = hashOf(row, corrected);
    const bucket = correctedHashes.get(hash) || [];
    bucket.push(row);
    correctedHashes.set(hash, bucket);
    return { row, corrected, hash };
  });

  // Tabrakan A: baris tergeser vs baris lain yang sudah ada di database.
  const collisionsWithExisting = shifted
    .map((item) => ({
      ...item,
      // `groups` = fingerprint semua baris apa adanya, dipakai untuk mengecek tabrakan
      // terhadap versi tanggal yang sudah dikoreksi.
      others: (groups.get(item.hash) || []).filter((other) => other.id !== item.row.id),
    }))
    .filter((item) => item.others.length > 0);

  // Tabrakan B: dua baris tergeser yang setelah dikoreksi jadi identik.
  const collisionsAmongShifted = [...correctedHashes.values()].filter((rows) => rows.length > 1);

  // ---- 3. Laporan ---------------------------------------------------------------------
  console.log("\n[1/3] FINGERPRINT");
  console.log(`  Total transaksi diperiksa      : ${transactions.length}`);
  console.log(`  Fingerprint sudah benar        : ${alreadyCorrect}`);
  console.log(`  Perlu diperbarui               : ${pending.length}`);
  console.log(`  Dilewati karena bentrok        : ${conflictRowCount} baris dalam ${conflicts.length} kelompok`);

  if (pending.length) {
    console.log(`\n  ${apply ? "Akan diperbarui" : "Kandidat pembaruan (dry run)"}:`);
    listed(pending, ({ row, hash }) => `  - ${describe(row)}\n      ${row.fingerprint.slice(0, 12)}… → ${hash.slice(0, 12)}…`);
  }

  if (conflicts.length) {
    console.log("\n  Bentrok fingerprint — perlu ditinjau manual (hapus salah satu lewat halaman /transactions):");
    for (const { rows } of conflicts.slice(0, MAX_LISTED)) {
      console.log("  ---");
      for (const row of rows) console.log(`    ${describe(row)}`);
    }
    if (conflicts.length > MAX_LISTED) console.log(`  … dan ${conflicts.length - MAX_LISTED} kelompok lainnya.`);
  }

  console.log("\n[2/3] AUDIT TANGGAL QRIS (dugaan pergeseran +7 jam)");
  console.log(`  Total transaksi QRIS_XLSX      : ${qrisRows.length}`);
  console.log(`  Diduga tanggalnya tergeser     : ${suspects.length}  (jam WIB 00:00–0${SHIFT_SUSPECT_MAX_HOUR}:59)`);

  if (shifted.length) {
    console.log("\n  Baris berikut kemungkinan besar aslinya transaksi sore/malam hari SEBELUMNYA:");
    listed(shifted, ({ row, corrected }) =>
      `  - ${describe(row)}\n      tersimpan: ${wib(row.transactionDate)}  →  seharusnya: ${wib(corrected)}`);
    console.log("\n  CATATAN: script ini TIDAK mengubah tanggal. Kolom tanggal hanya dilaporkan,");
    console.log("  karena koreksi tanggal harus diputuskan manual (bandingkan dulu dengan file Excel aslinya).");
  }

  console.log("\n[3/3] RISIKO DOBEL SAAT IMPOR ULANG");
  if (!collisionsWithExisting.length && !collisionsAmongShifted.length) {
    console.log("  Tidak ditemukan pasangan yang akan bertabrakan fingerprint-nya.");
  }
  if (collisionsWithExisting.length) {
    console.log(`  ${collisionsWithExisting.length} baris tergeser akan bertabrakan dengan transaksi yang SUDAH ada:`);
    for (const item of collisionsWithExisting.slice(0, MAX_LISTED)) {
      console.log("  ---");
      console.log(`    tergeser : ${describe(item.row)}`);
      for (const other of item.others) console.log(`    existing : ${describe(other)}`);
    }
    if (collisionsWithExisting.length > MAX_LISTED) console.log(`  … dan ${collisionsWithExisting.length - MAX_LISTED} pasangan lainnya.`);
  }
  if (collisionsAmongShifted.length) {
    console.log(`\n  ${collisionsAmongShifted.length} kelompok baris tergeser menjadi identik setelah tanggalnya dikoreksi:`);
    for (const rows of collisionsAmongShifted.slice(0, MAX_LISTED)) {
      console.log("  ---");
      for (const row of rows) console.log(`    ${describe(row)}`);
    }
    if (collisionsAmongShifted.length > MAX_LISTED) console.log(`  … dan ${collisionsAmongShifted.length - MAX_LISTED} kelompok lainnya.`);
  }
  if (suspects.length) {
    console.log("\n  PERINGATAN: parser QRIS yang baru menyimpan tanggal dengan benar, sehingga baris lama");
    console.log("  yang tergeser TIDAK akan dikenali sebagai duplikat saat file yang sama diimpor ulang.");
    console.log("  Periksa daftar di atas sebelum mengimpor ulang file QRIS periode yang sama.");
  }

  // ---- 4. Eksekusi --------------------------------------------------------------------
  console.log(`\n${"-".repeat(72)}`);
  if (!apply) {
    console.log("DRY RUN selesai. TIDAK ADA data yang diubah.");
    console.log(pending.length
      ? `Jalankan ulang dengan flag --apply untuk memperbarui ${pending.length} fingerprint di atas:`
      : "Tidak ada fingerprint yang perlu diperbarui.");
    if (pending.length) console.log("  npm run db:recompute-fingerprints -- --apply");
    return;
  }

  let updated = 0;
  for (const { row, hash } of pending) {
    await prisma.transaction.update({ where: { id: row.id }, data: { fingerprint: hash } });
    updated++;
  }
  console.log(`Selesai menulis. Fingerprint diperbarui: ${updated}.`);
  console.log(`Dilewati karena bentrok: ${conflictRowCount} baris (tidak disentuh, tinjau manual).`);
}

main()
  .then(() => console.log("\nSelesai."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
