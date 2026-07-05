import * as XLSX from "xlsx";
import type {
  Prisma,
  TransactionDirection,
  TransactionSource,
  TransactionStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { BATCH_QRIS_MARKER, fingerprint, type NormalizedTransaction } from "@/lib/matching";

type HistoricalKind = "MUTASI" | "QRIS";

type HistoricalMapping = {
  ministryName: string | null;
  eventName: string | null;
  incomeTypeName: string | null;
  expenseTypeName: string | null;
};

export type HistoricalRow = NormalizedTransaction & {
  mapping: HistoricalMapping;
  forceSkip?: boolean;
};

export type ParsedHistoricalWorkbook = {
  kind: HistoricalKind;
  source: TransactionSource;
  accountHolder: string | null;
  accountNumber: string | null;
  rows: HistoricalRow[];
};

type SheetRow = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function optionalText(value: unknown) {
  return text(value) || null;
}

function amount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const source = text(value);
  const normalized = /^\d{1,3}(?:[.,]\d{3})+$/.test(source)
    ? source.replace(/[.,]/g, "")
    : source.replace(/,/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Nominal tidak valid: ${source || "kosong"}`);
  return parsed;
}

function jakartaDate(value: unknown, includeTime: boolean) {
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    const hour = String(value.getUTCHours()).padStart(2, "0");
    const minute = String(value.getUTCMinutes()).padStart(2, "0");
    const second = String(value.getUTCSeconds()).padStart(2, "0");
    return new Date(`${year}-${month}-${day}T${includeTime ? `${hour}:${minute}:${second}` : "12:00:00"}+07:00`);
  }

  const source = text(value).replaceAll("/", "-");
  const normalized = source.includes("T") ? source : source.replace(" ", "T");
  const withTime = normalized.includes("T") ? normalized : `${normalized}T12:00:00`;
  const parsed = new Date(`${withTime}+07:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Tanggal tidak valid: ${source || "kosong"}`);
  return parsed;
}

function sheetRows(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Worksheet ${sheetName} tidak ditemukan.`);
  return XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: null, raw: true });
}

function serializableRow(row: SheetRow, extra: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify({ ...row, ...extra })) as Prisma.InputJsonValue;
}

function parseMutasi(workbook: XLSX.WorkBook): ParsedHistoricalWorkbook {
  const rows = sheetRows(workbook, "Mutasi_Clean_All_Real").map((row, index) => {
    const direction = text(row.direction).toUpperCase();
    if (direction !== "IN" && direction !== "OUT") {
      throw new Error(`Arah transaksi mutasi baris ${index + 2} harus IN atau OUT.`);
    }

    const description = text(row.bank_description);
    if (!description) throw new Error(`Deskripsi mutasi baris ${index + 2} kosong.`);
    const forceSkip = text(row.qris_batch_flag).toUpperCase() === "YES" || description.toUpperCase().includes(BATCH_QRIS_MARKER);
    const accountHolder = optionalText(row.account_holder);
    const accountNumber = optionalText(row.account_number)?.replace(/\D/g, "") || null;
    const mapping: HistoricalMapping = {
      ministryName: optionalText(row.ministry_name),
      eventName: optionalText(row.event_name),
      incomeTypeName: optionalText(row.income_type_name),
      expenseTypeName: optionalText(row.expense_type_name),
    };

    return {
      transactionDate: jakartaDate(row.transaction_date, false),
      description,
      amount: amount(row.amount),
      direction: direction as TransactionDirection,
      source: "BANK_PDF" as const,
      accountHolder,
      accountNumber,
      sourceReference: optionalText(row.bank_id),
      rawData: serializableRow(row, {
        historicalImport: true,
        accountAlias: optionalText(row.account_alias),
        requestedMapping: mapping,
      }),
      mapping,
      forceSkip,
    } satisfies HistoricalRow;
  });

  return { kind: "MUTASI", source: "BANK_PDF", accountHolder: null, accountNumber: null, rows };
}

function parseQris(
  workbook: XLSX.WorkBook,
  accountHolder: string | null,
  accountNumber: string | null,
): ParsedHistoricalWorkbook {
  const rows = sheetRows(workbook, "QRIS_Clean_Mapping").map((row, index) => {
    const rrn = text(row.rrn);
    const reference = text(row.transaction_id_real) || rrn || text(row.invoice_number);
    if (!reference) throw new Error(`Referensi QRIS baris ${index + 2} kosong.`);
    const mapping: HistoricalMapping = {
      ministryName: optionalText(row.ministry_name),
      eventName: optionalText(row.event_name),
      incomeTypeName: optionalText(row.income_type_name),
      expenseTypeName: null,
    };

    return {
      transactionDate: jakartaDate(row.approval_date_time || row.transaction_date, true),
      description: `QRIS ${text(row.merchant_name) || "Muda Juara"} - RRN ${rrn || "-"}`,
      amount: amount(row.amount),
      direction: "IN" as const,
      source: "QRIS_XLSX" as const,
      accountHolder,
      accountNumber,
      sourceReference: reference,
      rawData: serializableRow(row, {
        historicalImport: true,
        requestedMapping: mapping,
      }),
      mapping,
    } satisfies HistoricalRow;
  });

  return { kind: "QRIS", source: "QRIS_XLSX", accountHolder, accountNumber, rows };
}

export function parseHistoricalWorkbook(
  buffer: Buffer,
  qrisAccount?: { holder?: string | null; number?: string | null },
): ParsedHistoricalWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  if (workbook.SheetNames.includes("Mutasi_Clean_All_Real")) return parseMutasi(workbook);
  if (workbook.SheetNames.includes("QRIS_Clean_Mapping")) {
    const holder = optionalText(qrisAccount?.holder);
    const number = optionalText(qrisAccount?.number)?.replace(/\D/g, "") || null;
    return parseQris(workbook, holder, number);
  }
  throw new Error("Format FINAL tidak dikenali. Gunakan workbook MUTASI atau QRIS dari folder FINAL.");
}

function key(value: string | null | undefined) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

function missingMappingMessage(mapping: HistoricalMapping, direction: TransactionDirection) {
  const missing = [
    !mapping.ministryName ? "kementerian" : null,
    !mapping.eventName ? "event" : null,
    direction === "IN" && !mapping.incomeTypeName ? "jenis pemasukan" : null,
    direction === "OUT" && !mapping.expenseTypeName ? "jenis pengeluaran" : null,
  ].filter(Boolean);
  return missing.length ? `Mapping FINAL belum lengkap: ${missing.join(", ")}.` : null;
}

export async function stageHistoricalWorkbook(options: {
  parsed: ParsedHistoricalWorkbook;
  fileName: string;
  replaceExisting: boolean;
  assignedByRole: string;
}) {
  const { parsed, fileName, replaceExisting, assignedByRole } = options;
  const [ministries, expenseTypes] = await Promise.all([
    db.ministry.findMany({
      where: { active: true },
      include: {
        events: {
          where: { active: true },
          include: { incomeTypes: { where: { active: true } } },
        },
      },
    }),
    db.expenseType.findMany({ where: { active: true } }),
  ]);

  const ministryByName = new Map(ministries.map((item) => [key(item.name), item]));
  const expenseByName = new Map(expenseTypes.map((item) => [key(item.name), item]));
  const prepared = parsed.rows.map((row) => {
    const hash = fingerprint(row.source === "QRIS_XLSX" ? { ...row, accountHolder: null, accountNumber: null } : row);
    if (row.forceSkip) {
      return {
        row,
        hash,
        status: "SKIPPED" as TransactionStatus,
        skipReason: "Gabungan pencairan QRIS, detail dihitung dari file QRIS.",
        ministryId: null,
        eventId: null,
        incomeTypeId: null,
        expenseTypeId: null,
      };
    }

    const ministry = ministryByName.get(key(row.mapping.ministryName));
    const event = ministry?.events.find((item) => key(item.name) === key(row.mapping.eventName));
    const incomeType = row.direction === "IN"
      ? event?.incomeTypes.find((item) => key(item.name) === key(row.mapping.incomeTypeName))
      : undefined;
    const expenseType = row.direction === "OUT" ? expenseByName.get(key(row.mapping.expenseTypeName)) : undefined;
    const incomplete = missingMappingMessage(row.mapping, row.direction);
    const missingMaster = [
      row.mapping.ministryName && !ministry ? `kementerian “${row.mapping.ministryName}”` : null,
      row.mapping.eventName && !event ? `event “${row.mapping.eventName}”` : null,
      row.direction === "IN" && row.mapping.incomeTypeName && !incomeType ? `jenis pemasukan “${row.mapping.incomeTypeName}”` : null,
      row.direction === "OUT" && row.mapping.expenseTypeName && !expenseType ? `jenis pengeluaran “${row.mapping.expenseTypeName}”` : null,
    ].filter(Boolean);
    const matched = !incomplete && !missingMaster.length;

    return {
      row,
      hash,
      status: matched ? "MATCHED" as TransactionStatus : "UNMATCHED" as TransactionStatus,
      skipReason: incomplete || (missingMaster.length ? `Tidak ditemukan di Master Data: ${missingMaster.join(", ")}.` : null),
      ministryId: ministry?.id || null,
      eventId: event?.id || null,
      incomeTypeId: incomeType?.id || null,
      expenseTypeId: expenseType?.id || null,
    };
  });

  return db.$transaction(async (tx) => {
    if (replaceExisting) {
      await tx.transaction.deleteMany();
      await tx.importBatch.deleteMany();
    }

    const hashes = [...new Set(prepared.map((item) => item.hash))];
    const existing = hashes.length
      ? await tx.transaction.findMany({ where: { fingerprint: { in: hashes } }, select: { fingerprint: true } })
      : [];
    const seen = new Set(existing.map((item) => item.fingerprint));
    const insertable = prepared.filter((item) => {
      if (seen.has(item.hash)) return false;
      seen.add(item.hash);
      return true;
    });

    const batch = await tx.importBatch.create({
      data: {
        fileName: fileName.slice(0, 255),
        source: parsed.source,
        accountHolder: parsed.accountHolder,
        accountNumber: parsed.accountNumber,
        status: "REVIEW",
        totalRows: parsed.rows.length,
        importedRows: insertable.length,
        duplicateRows: prepared.length - insertable.length,
        matchedRows: insertable.filter((item) => item.status === "MATCHED").length,
        unmatchedRows: insertable.filter((item) => item.status === "UNMATCHED").length,
        skippedRows: insertable.filter((item) => item.status === "SKIPPED").length,
      },
    });

    if (insertable.length) {
      await tx.transaction.createMany({
        data: insertable.map((item) => ({
          transactionDate: item.row.transactionDate,
          description: item.row.description,
          amount: item.row.amount,
          direction: item.row.direction,
          source: item.row.source,
          accountHolder: item.row.accountHolder || null,
          accountNumber: item.row.accountNumber || null,
          sourceReference: item.row.sourceReference || null,
          fingerprint: item.hash,
          isDraft: true,
          status: item.status,
          skipReason: item.skipReason,
          rawData: item.row.rawData || undefined,
          importBatchId: batch.id,
          ministryId: item.ministryId,
          eventId: item.eventId,
          incomeTypeId: item.incomeTypeId,
          expenseTypeId: item.expenseTypeId,
          assignedAt: item.status === "MATCHED" ? new Date() : null,
          assignedByRole: item.status === "MATCHED" ? assignedByRole : null,
        })),
      });
    }

    return {
      batchId: batch.id,
      kind: parsed.kind,
      imported: batch.importedRows,
      duplicate: batch.duplicateRows,
      matched: batch.matchedRows,
      unmatched: batch.unmatchedRows,
      skipped: batch.skippedRows,
    };
  }, { timeout: 120_000 });
}
