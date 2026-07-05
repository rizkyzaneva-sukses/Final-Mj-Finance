import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { fingerprint } from "@/lib/matching";
import { openingBalanceReference, OPENING_BALANCE_PREFIX } from "@/lib/opening-balance";

function ensureFinance(session: Awaited<ReturnType<typeof getSession>>) {
  if (session?.role !== "FINANCE") {
    return NextResponse.json({ error: "Hanya Menteri Keuangan yang dapat mengatur saldo awal rekening." }, { status: 403 });
  }
  return null;
}

function parseOpeningDate(value: unknown) {
  const source = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) throw new Error("Tanggal saldo awal wajib berformat YYYY-MM-DD.");
  const parsed = new Date(`${source}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error("Tanggal saldo awal tidak valid.");
  return parsed;
}

function parseAmount(value: unknown) {
  const numeric = String(value || "").replace(/[^\d]/g, "");
  if (!numeric) throw new Error("Nominal saldo awal wajib diisi.");
  const amount = Number(numeric);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Nominal saldo awal harus lebih dari nol.");
  return amount;
}

function normalizePayload(body: Record<string, unknown>) {
  const accountHolder = String(body.accountHolder || "").trim();
  const accountNumber = String(body.accountNumber || "").replace(/\D/g, "") || null;
  const note = String(body.note || "").trim() || null;
  if (!accountHolder) throw new Error("Nama pemilik rekening wajib diisi.");
  return {
    accountHolder,
    accountNumber,
    note,
    amount: parseAmount(body.amount),
    transactionDate: parseOpeningDate(body.transactionDate),
  };
}

export async function POST(request: Request) {
  const session = await getSession();
  const guard = ensureFinance(session);
  if (guard) return guard;
  const role = session?.role || "FINANCE";
  const body = await request.json().catch(() => ({}));

  try {
    const payload = normalizePayload(body);
    const sourceReference = openingBalanceReference(payload.accountHolder, payload.accountNumber);
    const existing = await db.transaction.findFirst({
      where: {
        isDraft: false,
        source: "MANUAL",
        sourceReference,
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "Saldo awal untuk rekening ini sudah ada. Silakan edit yang lama." }, { status: 409 });
    }

    const transaction = {
      transactionDate: payload.transactionDate,
      description: `Saldo awal rekening ${payload.accountHolder}`,
      amount: payload.amount,
      direction: "IN" as const,
      source: "MANUAL" as const,
      accountHolder: payload.accountHolder,
      accountNumber: payload.accountNumber,
      sourceReference,
    };

    const row = await db.transaction.create({
      data: {
        ...transaction,
        fingerprint: fingerprint(transaction),
        isDraft: false,
        status: "MATCHED",
        assignedAt: new Date(),
        assignedByRole: role,
        rawData: {
          manualKind: "OPENING_BALANCE",
          note: payload.note,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Saldo awal serupa sudah ada." }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Saldo awal gagal disimpan." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  const guard = ensureFinance(session);
  if (guard) return guard;
  const body = await request.json().catch(() => ({}));

  try {
    const id = String(body.id || "");
    if (!id) throw new Error("ID saldo awal wajib diisi.");
    const existing = await db.transaction.findFirst({
      where: {
        id,
        isDraft: false,
        source: "MANUAL",
        sourceReference: { startsWith: OPENING_BALANCE_PREFIX },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Saldo awal yang ingin diubah tidak ditemukan." }, { status: 404 });
    }

    const payload = normalizePayload(body);
    const sourceReference = openingBalanceReference(payload.accountHolder, payload.accountNumber);
    const duplicate = await db.transaction.findFirst({
      where: {
        id: { not: id },
        isDraft: false,
        source: "MANUAL",
        sourceReference,
      },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: "Sudah ada saldo awal lain untuk rekening ini." }, { status: 409 });
    }

    const transaction = {
      transactionDate: payload.transactionDate,
      description: `Saldo awal rekening ${payload.accountHolder}`,
      amount: payload.amount,
      direction: "IN" as const,
      source: "MANUAL" as const,
      accountHolder: payload.accountHolder,
      accountNumber: payload.accountNumber,
      sourceReference,
    };

    const row = await db.transaction.update({
      where: { id },
      data: {
        ...transaction,
        fingerprint: fingerprint(transaction),
        status: "MATCHED",
        skipReason: null,
        rawData: {
          manualKind: "OPENING_BALANCE",
          note: payload.note,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Saldo awal serupa sudah ada." }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Saldo awal gagal diubah." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  const guard = ensureFinance(session);
  if (guard) return guard;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "ID saldo awal wajib diisi." }, { status: 400 });

  try {
    const row = await db.transaction.findFirst({
      where: {
        id,
        isDraft: false,
        source: "MANUAL",
        sourceReference: { startsWith: OPENING_BALANCE_PREFIX },
      },
      select: { id: true },
    });
    if (!row) return NextResponse.json({ error: "Saldo awal yang ingin dihapus tidak ditemukan." }, { status: 404 });

    await db.transaction.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Saldo awal gagal dihapus." }, { status: 400 });
  }
}
