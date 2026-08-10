import { createHash } from "node:crypto";
import type { Event, IncomeType, Prisma, TransactionDirection, TransactionSource, TransactionStatus } from "@prisma/client";
import { db } from "@/lib/db";

/** Teks kanonik (dokumentasi / UI). Deteksi aktual pakai `isBatchQrisSettlementDescription`. */
export const BATCH_QRIS_MARKER = "TRF BATCH MYBB - PEMBAYARAN";

/**
 * Normalisasi deskripsi agar deteksi pencairan QRIS tahan OCR:
 * spasi berlebih, en/em-dash, underscore, dll.
 */
export function normalizeBatchQrisText(description: string) {
  return String(description || "")
    .toUpperCase()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-") // berbagai dash unicode → -
    .replace(/[_/|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True jika baris mutasi bank adalah pencairan gabungan QRIS (MYBB).
 * Harus auto-SKIP untuk mapping event, tapi tetap menggerakkan saldo bank.
 *
 * Mencakup variasi OCR / PDF:
 * - TRF BATCH MYBB - PEMBAYARAN
 * - TRF BATCH MYBB - PEMBAYARAN TRX ...
 * - BATCH MYBB PEMBAYARAN (tanpa TRF / tanpa dash)
 * - TRF  BATCH  MYBB–PEMBAYARAN (spasi / dash aneh)
 */
export function isBatchQrisSettlementDescription(description: string) {
  const text = normalizeBatchQrisText(description);
  if (!text) return false;
  if (text.includes(BATCH_QRIS_MARKER)) return true;
  // Inti: BATCH + MYBB + PEMBAYARAN (urutan bebas antar kata, spasi/dash diabaikan)
  if (/\bBATCH\b/.test(text) && /\bMYBB\b/.test(text) && /\bPEMBAYARAN\b/.test(text)) return true;
  // Cadangan: TRF BATCH MYBB tanpa kata PEMBAYARAN (OCR potong)
  if (/\bTRF\b/.test(text) && /\bBATCH\b/.test(text) && /\bMYBB\b/.test(text)) return true;
  return false;
}

export type NormalizedTransaction = {
  transactionDate: Date;
  description: string;
  amount: number;
  direction: TransactionDirection;
  source: TransactionSource;
  accountHolder?: string | null;
  accountNumber?: string | null;
  sourceReference?: string | null;
  rawData?: Prisma.InputJsonValue;
};

export function fingerprint(transaction: NormalizedTransaction) {
  const stable = [
    transaction.accountNumber || "",
    transaction.sourceReference || "",
    transaction.transactionDate.toISOString(),
    transaction.description.trim().toUpperCase(),
    transaction.amount.toFixed(2),
    transaction.direction,
  ].join("|");
  return createHash("sha256").update(stable).digest("hex");
}

/** Fingerprint unik untuk baris exact-duplikat (kolom fingerprint @unique). */
export function saltedFingerprint(baseHash: string, salt: string) {
  return createHash("sha256").update(`${baseHash}|EXACT_DUP|${salt}`).digest("hex");
}

/** Fingerprint baru saat user memaksa baris exact-duplikat dianggap unik. */
export function forceUniqueFingerprint(baseHash: string) {
  return createHash("sha256")
    .update(`${baseHash}|FORCE_UNIQUE|${Date.now()}|${Math.random().toString(36).slice(2)}`)
    .digest("hex");
}

/**
 * Normalize a description for fuzzy comparison.
 * - Converts to uppercase
 * - Removes common noise words (transfer, payment, etc.)
 * - Splits into unique keywords
 */
function normalizeDescriptionKeywords(description: string): string[] {
  const noiseWords = new Set([
    'TRANSFER', 'TRF', 'TF', 'PAYMENT', 'BAYAR', 'PEMBAYARAN',
    'QRIS', 'DEBIT', 'KREDIT', 'CR', 'DB', 'ADM', 'BIAYA',
    'FEE', 'PPN', 'TAX', 'TGL', 'DATE',
  ]);
  return description
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !noiseWords.has(w));
}

/**
 * Calculate Jaccard similarity between two keyword sets.
 * Returns a value between 0 and 1.
 */
function keywordSimilarity(kwA: string[], kwB: string[]): number {
  if (kwA.length === 0 && kwB.length === 0) return 1;
  if (kwA.length === 0 || kwB.length === 0) return 0;
  const setA = new Set(kwA);
  const setB = new Set(kwB);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const DUPLICATE_SIMILARITY_THRESHOLD = 0.6;
/** Referensi yang terlalu pendek (mis. "-", "0") tidak cukup unik untuk dijadikan bukti duplikat. */
const MIN_REFERENCE_LENGTH = 4;

export type DuplicateCandidate = {
  id: string;
  source: TransactionSource;
  description: string;
  direction: TransactionDirection;
  amount: Prisma.Decimal | number;
  transactionDate: Date;
  accountNumber: string | null;
  sourceReference: string | null;
};

export type DuplicateIndex = {
  byReference: Map<string, DuplicateCandidate[]>;
  byAccount: Map<string, DuplicateCandidate[]>;
};

function toNumber(value: Prisma.Decimal | number) {
  return typeof value === "number" ? value : Number(value.toString());
}

function normalizeReference(value: string | null | undefined) {
  const cleaned = String(value || "").trim().toUpperCase();
  return cleaned.length >= MIN_REFERENCE_LENGTH ? cleaned : null;
}

const DAY_MS = 86_400_000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Rentang toleransi ±1 hari penuh di sekitar sebuah tanggal transaksi, dihitung
 * dalam WIB tanpa bergantung pada zona waktu server.
 *
 * `setHours(0,0,0,0)` memakai zona waktu proses: di container UTC batas harinya
 * meleset 7 jam, sehingga transaksi menjelang tengah malam WIB bisa lolos dari
 * jendela pembanding dan tidak terdeteksi sebagai duplikat.
 */
function dayWindow(date: Date) {
  // Geser +7 jam supaya komponen UTC-nya menjadi wall clock WIB.
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  const startOfDay = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) - WIB_OFFSET_MS;
  return {
    from: new Date(startOfDay - DAY_MS),
    to: new Date(startOfDay + 2 * DAY_MS - 1),
  };
}

/**
 * Keputusan apakah `candidate` adalah transaksi yang sama dengan `row`.
 * Dua jalur pembuktian:
 *  1. Referensi sumber identik (mis. RRN/TRANSACTION_ID QRIS) — berlaku walaupun
 *     `source` kedua baris sama, karena baris QRIS yang sama bisa masuk lewat dua
 *     jalur impor berbeda dan menghasilkan fingerprint berbeda.
 *  2. Sumber berbeda + rekening sama + deskripsi mirip (≥60% irisan kata kunci).
 * Keduanya tetap wajib sama arah, sama nominal, dan berjarak maksimal ±1 hari.
 */
function isSameTransaction(row: NormalizedTransaction, candidate: DuplicateCandidate) {
  if (candidate.direction !== row.direction) return false;
  if (toNumber(candidate.amount) !== row.amount) return false;
  const { from, to } = dayWindow(row.transactionDate);
  if (candidate.transactionDate < from || candidate.transactionDate > to) return false;

  const rowReference = normalizeReference(row.sourceReference);
  const candidateReference = normalizeReference(candidate.sourceReference);
  if (rowReference && candidateReference && rowReference === candidateReference) return true;

  // Sumber sama tanpa referensi yang cocok: biarkan fingerprint yang menangani.
  if (candidate.source === row.source) return false;
  if (!row.accountNumber || !candidate.accountNumber) return false;
  if (candidate.accountNumber !== row.accountNumber) return false;

  const similarity = keywordSimilarity(
    normalizeDescriptionKeywords(row.description),
    normalizeDescriptionKeywords(candidate.description),
  );
  return similarity >= DUPLICATE_SIMILARITY_THRESHOLD;
}

/**
 * Ambil sekali jalan seluruh kandidat duplikat untuk sekumpulan baris.
 * Dipisah jadi dua query yang sama-sama selektif (referensi dan rekening) supaya
 * tidak menimbulkan N+1 saat mengimpor file besar.
 */
export async function loadDuplicateCandidates(
  rows: NormalizedTransaction[],
  options?: { excludeBatchId?: string | null },
): Promise<DuplicateCandidate[]> {
  if (!rows.length) return [];

  let earliest = rows[0].transactionDate.getTime();
  let latest = earliest;
  for (const row of rows) {
    const time = row.transactionDate.getTime();
    if (time < earliest) earliest = time;
    if (time > latest) latest = time;
  }
  const from = dayWindow(new Date(earliest)).from;
  const to = dayWindow(new Date(latest)).to;
  const directions = [...new Set(rows.map((row) => row.direction))];
  const amounts = [...new Set(rows.map((row) => row.amount))];

  // `in` bersifat case-sensitive, jadi sertakan beberapa varian penulisan referensi.
  const references = new Set<string>();
  for (const row of rows) {
    const raw = String(row.sourceReference || "").trim();
    if (raw.length < MIN_REFERENCE_LENGTH) continue;
    references.add(raw);
    references.add(raw.toUpperCase());
    references.add(raw.toLowerCase());
  }
  const accountNumbers = [...new Set(rows.map((row) => row.accountNumber).filter((value): value is string => !!value))];

  const scope = {
    isDraft: false,
    direction: { in: directions },
    amount: { in: amounts },
    transactionDate: { gte: from, lte: to },
    ...(options?.excludeBatchId ? { importBatchId: { not: options.excludeBatchId } } : {}),
  };

  const queries: Promise<DuplicateCandidate[]>[] = [];
  if (references.size) {
    queries.push(db.transaction.findMany({
      where: { ...scope, sourceReference: { in: [...references] } },
      select: { id: true, source: true, description: true, direction: true, amount: true, transactionDate: true, accountNumber: true, sourceReference: true },
    }));
  }
  if (accountNumbers.length) {
    queries.push(db.transaction.findMany({
      where: { ...scope, accountNumber: { in: accountNumbers } },
      select: { id: true, source: true, description: true, direction: true, amount: true, transactionDate: true, accountNumber: true, sourceReference: true },
    }));
  }
  if (!queries.length) return [];

  const unique = new Map<string, DuplicateCandidate>();
  for (const list of await Promise.all(queries)) {
    for (const candidate of list) unique.set(candidate.id, candidate);
  }
  return [...unique.values()];
}

export function buildDuplicateIndex(candidates: DuplicateCandidate[]): DuplicateIndex {
  const byReference = new Map<string, DuplicateCandidate[]>();
  const byAccount = new Map<string, DuplicateCandidate[]>();
  for (const candidate of candidates) {
    const reference = normalizeReference(candidate.sourceReference);
    if (reference) byReference.set(reference, [...(byReference.get(reference) ?? []), candidate]);
    if (candidate.accountNumber) byAccount.set(candidate.accountNumber, [...(byAccount.get(candidate.accountNumber) ?? []), candidate]);
  }
  return { byReference, byAccount };
}

/** Cari duplikat lintas-sumber untuk satu baris di dalam indeks kandidat yang sudah dimuat. */
export function matchDuplicate(
  row: NormalizedTransaction,
  index: DuplicateIndex,
): { id: string; source: TransactionSource } | null {
  const reference = normalizeReference(row.sourceReference);
  const pools = [
    reference ? index.byReference.get(reference) : undefined,
    row.accountNumber ? index.byAccount.get(row.accountNumber) : undefined,
  ];
  const checked = new Set<string>();
  for (const pool of pools) {
    for (const candidate of pool ?? []) {
      if (checked.has(candidate.id)) continue;
      checked.add(candidate.id);
      if (isSameTransaction(row, candidate)) return { id: candidate.id, source: candidate.source };
    }
  }
  return null;
}

/**
 * Find a potential fuzzy duplicate among existing non-draft transactions.
 * Versi satu-baris dari {@link matchDuplicate}; untuk banyak baris pakai
 * {@link loadDuplicateCandidates} + {@link buildDuplicateIndex} agar tidak N+1.
 */
export async function findPotentialDuplicate(
  row: NormalizedTransaction,
  options?: { excludeBatchId?: string | null },
): Promise<{ id: string; source: TransactionSource } | null> {
  const candidates = await loadDuplicateCandidates([row], options);
  return matchDuplicate(row, buildDuplicateIndex(candidates));
}

export function duplicateSkipReason(duplicate: { id: string; source: TransactionSource }) {
  return `Duplikasi dari sumber lain (duplikasi dari transaksi ${duplicate.id} yang berasal dari ${duplicate.source})`;
}

export function exactDuplicateSkipReason(originalId: string) {
  return `Duplikat exact (fingerprint sama dengan transaksi ${originalId})`;
}

/** Ambil id transaksi asli dari teks skipReason duplikat lintas-sumber. */
export function parseDuplicateOfId(skipReason: string | null | undefined): string | null {
  const fuzzy = String(skipReason || "").match(/duplikasi dari transaksi ([a-z0-9]+) yang berasal/i);
  if (fuzzy?.[1]) return fuzzy[1];
  const exact = String(skipReason || "").match(/fingerprint sama dengan transaksi ([a-z0-9]+)/i);
  return exact?.[1] ?? null;
}

export function isDuplicateSkipReason(skipReason: string | null | undefined) {
  return String(skipReason || "").startsWith("Duplikasi dari sumber lain");
}

export function isExactDuplicateSkipReason(skipReason: string | null | undefined) {
  return String(skipReason || "").startsWith("Duplikat exact");
}

export function isAnyDuplicateSkipReason(skipReason: string | null | undefined) {
  return isDuplicateSkipReason(skipReason) || isExactDuplicateSkipReason(skipReason);
}

type MatchableIncomeType = IncomeType & { event: Event };

export function findIncomeMatch(amount: number, incomeTypes: MatchableIncomeType[]) {
  const wholeAmount = Math.abs(Math.trunc(amount)).toString();
  return [...incomeTypes]
    .filter((type) => type.active && type.uniqueCode)
    .sort((a, b) => (b.uniqueCode?.length ?? 0) - (a.uniqueCode?.length ?? 0))
    .find((type) => wholeAmount.endsWith(type.uniqueCode!));
}

/** Batas aman jumlah baris per `createMany` agar tidak melebihi batas parameter database. */
const CREATE_CHUNK_SIZE = 500;

async function persistTransactions(batchId: string, rows: NormalizedTransaction[], isDraft: boolean) {
  const counts = { imported: 0, duplicate: 0, matched: 0, unmatched: 0, skipped: 0, fuzzyDuplicate: 0 };
  if (!rows.length) return counts;

  const incomeTypes = await db.incomeType.findMany({
    where: { active: true, uniqueCode: { not: null } },
    include: { event: true },
  });

  // 1) Cek fingerprint sekali jalan (dulu satu `findUnique` per baris = N+1).
  // Exact-duplikat TETAP disimpan sebagai baris SKIPPED (fingerprint di-salt)
  // supaya reviewer bisa melihat apa yang bentrok dan memaksa jadi unik.
  const prepared = rows.map((row) => ({ row, hash: fingerprint(row) }));
  const existing = await db.transaction.findMany({
    where: { fingerprint: { in: [...new Set(prepared.map((item) => item.hash))] } },
    select: {
      id: true,
      fingerprint: true,
      source: true,
      description: true,
      amount: true,
      direction: true,
      transactionDate: true,
      accountHolder: true,
      accountNumber: true,
      status: true,
      isDraft: true,
    },
  });
  const existingByHash = new Map(existing.map((item) => [item.fingerprint, item]));

  type ExactDupeItem = { row: NormalizedTransaction; hash: string; originalId: string | null };
  const fresh: typeof prepared = [];
  const exactDupes: ExactDupeItem[] = [];
  // Hash yang pertama kali muncul di file ini (belum di DB) — baris berikutnya dengan hash sama = exact dup dalam file.
  const firstFreshByHash = new Map<string, true>();

  for (const item of prepared) {
    const known = existingByHash.get(item.hash);
    if (known) {
      exactDupes.push({ row: item.row, hash: item.hash, originalId: known.id });
      counts.duplicate++;
      continue;
    }
    if (firstFreshByHash.has(item.hash)) {
      // Identik dengan baris lain di file yang sama (bukan di buku).
      exactDupes.push({ row: item.row, hash: item.hash, originalId: null });
      counts.duplicate++;
      continue;
    }
    firstFreshByHash.set(item.hash, true);
    fresh.push(item);
  }

  // 2) Deteksi duplikat lintas-sumber. Kandidat selalu hanya baris non-draft
  //    (dan bukan milik batch ini), jadi sesama baris draft di batch yang sama
  //    tidak akan saling dianggap duplikat.
  const duplicateIndex = buildDuplicateIndex(
    await loadDuplicateCandidates(fresh.map((item) => item.row), { excludeBatchId: batchId }),
  );

  const payloads: Prisma.TransactionCreateManyInput[] = [];
  for (const { row, hash } of fresh) {
    const isBatchQris = isBatchQrisSettlementDescription(row.description);
    const fuzzyDupe = isBatchQris ? null : matchDuplicate(row, duplicateIndex);

    let status: TransactionStatus;
    let skipReason: string | null = null;

    if (isBatchQris) {
      status = "SKIPPED";
      skipReason = "Gabungan pencairan QRIS, detail dihitung dari file QRIS.";
    } else if (fuzzyDupe) {
      status = "SKIPPED";
      skipReason = duplicateSkipReason(fuzzyDupe);
    } else {
      status = "UNMATCHED";
    }

    // Auto-match kode unik: jangan pernah menimpa skip QRIS batch / fuzzy duplikat.
    const match =
      row.direction === "IN" && !isBatchQris && !fuzzyDupe
        ? findIncomeMatch(row.amount, incomeTypes)
        : undefined;
    if (match) {
      status = "MATCHED";
      skipReason = null;
    }

    payloads.push({
      ...row,
      fingerprint: hash,
      importBatchId: batchId,
      isDraft,
      status,
      skipReason,
      ministryId: match?.event.ministryId,
      eventId: match?.eventId,
      incomeTypeId: match?.id,
      assignedAt: match ? new Date() : null,
      assignedByRole: match ? "SYSTEM" : null,
    });
    counts.imported++;
    if (status === "MATCHED") counts.matched++;
    if (status === "UNMATCHED") counts.unmatched++;
    if (status === "SKIPPED") counts.skipped++;
    if (fuzzyDupe) counts.fuzzyDuplicate++;
  }

  // 3) Simpan massal baris non-exact-dup (dulu satu `create` per baris = N+1).
  for (let start = 0; start < payloads.length; start += CREATE_CHUNK_SIZE) {
    await db.transaction.createMany({ data: payloads.slice(start, start + CREATE_CHUNK_SIZE) });
  }

  // 4) Exact-duplikat: simpan sebagai SKIPPED dengan fingerprint di-salt agar lolos @unique.
  //    Original id dari DB, atau (untuk dobel dalam file) baris first-fresh yang baru disimpan.
  if (exactDupes.length) {
    const freshOriginals = await db.transaction.findMany({
      where: {
        importBatchId: batchId,
        fingerprint: { in: [...new Set(exactDupes.map((item) => item.hash))] },
      },
      select: { id: true, fingerprint: true },
    });
    const freshIdByHash = new Map(freshOriginals.map((item) => [item.fingerprint, item.id]));

    const exactPayloads: Prisma.TransactionCreateManyInput[] = exactDupes.map((item, index) => {
      const originalId = item.originalId || freshIdByHash.get(item.hash) || null;
      const salt = `${batchId}:${index}:${Date.now()}`;
      return {
        ...item.row,
        fingerprint: saltedFingerprint(item.hash, salt),
        importBatchId: batchId,
        isDraft,
        status: "SKIPPED" as TransactionStatus,
        skipReason: originalId
          ? exactDuplicateSkipReason(originalId)
          : "Duplikat exact (baris identik dalam file yang sama)",
        assignedByRole: "SYSTEM",
        rawData: {
          ...(typeof item.row.rawData === "object" && item.row.rawData && !Array.isArray(item.row.rawData)
            ? (item.row.rawData as Record<string, unknown>)
            : {}),
          exactDuplicateOf: originalId,
          baseFingerprint: item.hash,
        },
      };
    });

    for (let start = 0; start < exactPayloads.length; start += CREATE_CHUNK_SIZE) {
      await db.transaction.createMany({ data: exactPayloads.slice(start, start + CREATE_CHUNK_SIZE) });
    }

    counts.imported += exactPayloads.length;
    counts.skipped += exactPayloads.length;
  }

  return counts;
}

export async function stageImportTransactions(batchId: string, rows: NormalizedTransaction[]) {
  return persistTransactions(batchId, rows, true);
}

/**
 * Jadikan seluruh baris draft milik sebuah batch sebagai transaksi final.
 *
 * Sebelum di-flip, duplikat lintas-sumber dicek ulang sebagai jaring pengaman:
 * batch lain bisa saja difinalisasi setelah batch ini di-staging, sehingga saat
 * staging baris pembandingnya masih draft dan belum terlihat. Hanya baris yang
 * belum diputuskan manusia (`assignedByRole` kosong atau "SYSTEM") yang disentuh,
 * supaya keputusan manual reviewer tidak pernah ditimpa.
 */
export async function finalizeImportBatch(batchId: string) {
  // Exact-duplikat yang reviewer TIDAK paksa-unik: buang, jangan masuk buku
  // (kalau di-finalize sebagai SKIPPED, mutasi bank tetap menggerakkan saldo → double count).
  const droppedExact = await db.transaction.deleteMany({
    where: {
      importBatchId: batchId,
      isDraft: true,
      status: "SKIPPED",
      skipReason: { startsWith: "Duplikat exact" },
    },
  });

  // Baris yang belum diputuskan manusia (null/SYSTEM): jaring pengaman QRIS batch + fuzzy duplikat.
  const stillPending = await db.transaction.findMany({
    where: {
      importBatchId: batchId,
      isDraft: true,
      status: { not: "SKIPPED" },
      OR: [{ assignedByRole: null }, { assignedByRole: "SYSTEM" }],
    },
    select: {
      id: true,
      description: true,
      transactionDate: true,
      amount: true,
      direction: true,
      source: true,
      accountHolder: true,
      accountNumber: true,
      sourceReference: true,
    },
  });

  let batchQrisSkipped = 0;
  const batchQrisIds = stillPending
    .filter((item) => isBatchQrisSettlementDescription(item.description))
    .map((item) => item.id);
  if (batchQrisIds.length) {
    await db.transaction.updateMany({
      where: { id: { in: batchQrisIds } },
      data: {
        status: "SKIPPED",
        skipReason: "Gabungan pencairan QRIS, detail dihitung dari file QRIS.",
        ministryId: null,
        eventId: null,
        incomeTypeId: null,
        expenseTypeId: null,
        assignedAt: null,
        assignedByRole: "SYSTEM",
      },
    });
    batchQrisSkipped = batchQrisIds.length;
  }

  let duplicateSkipped = 0;
  const nonBatchQris = stillPending.filter(
    (item) => !isBatchQrisSettlementDescription(item.description),
  );
  if (nonBatchQris.length) {
    const candidates = nonBatchQris.map((item) => ({ id: item.id, row: { ...item, amount: toNumber(item.amount) } }));
    const duplicateIndex = buildDuplicateIndex(
      await loadDuplicateCandidates(candidates.map((item) => item.row), { excludeBatchId: batchId }),
    );
    for (const { id, row } of candidates) {
      const duplicate = matchDuplicate(row, duplicateIndex);
      if (!duplicate) continue;
      await db.transaction.update({
        where: { id },
        data: {
          status: "SKIPPED",
          skipReason: duplicateSkipReason(duplicate),
          ministryId: null,
          eventId: null,
          incomeTypeId: null,
          expenseTypeId: null,
          assignedAt: null,
          assignedByRole: "SYSTEM",
        },
      });
      duplicateSkipped++;
    }
  }

  const result = await db.transaction.updateMany({
    where: { importBatchId: batchId, isDraft: true },
    data: { isDraft: false },
  });
  await recalculateBatchStats(batchId);
  return {
    count: result.count,
    duplicateSkipped,
    batchQrisSkipped,
    droppedExactDuplicates: droppedExact.count,
  };
}

/** Recalculate imported/matched/unmatched/skipped counts for a batch from actual transaction data. */
export async function recalculateBatchStats(batchId: string) {
  const [imported, matched, unmatched, skipped, exactDuplicates] = await Promise.all([
    db.transaction.count({ where: { importBatchId: batchId } }),
    db.transaction.count({ where: { importBatchId: batchId, status: "MATCHED" } }),
    db.transaction.count({ where: { importBatchId: batchId, status: "UNMATCHED" } }),
    db.transaction.count({ where: { importBatchId: batchId, status: "SKIPPED" } }),
    db.transaction.count({
      where: { importBatchId: batchId, skipReason: { startsWith: "Duplikat exact" } },
    }),
  ]);
  await db.importBatch.update({
    where: { id: batchId },
    data: {
      importedRows: imported,
      matchedRows: matched,
      unmatchedRows: unmatched,
      skippedRows: skipped,
      duplicateRows: exactDuplicates,
    },
  });
}
