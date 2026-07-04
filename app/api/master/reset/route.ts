import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { seedDefaultMaster } from "@/lib/default-master";

export async function POST(request: Request) {
  const session = await getSession();
  if (session?.role !== "FINANCE") {
    return NextResponse.json({ error: "Hanya Menteri Keuangan yang dapat mereset data." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  if (String(body.confirmation || "").trim().toUpperCase() !== "RESET SEMUA DATA") {
    return NextResponse.json({ error: "Konfirmasi reset tidak cocok." }, { status: 400 });
  }

  const summary = await db.$transaction(async (tx) => {
    const transactionResult = await tx.transaction.deleteMany();
    const importBatchResult = await tx.importBatch.deleteMany();
    const incomeTypeResult = await tx.incomeType.deleteMany();
    const expenseTypeResult = await tx.expenseType.deleteMany();
    const incomeMasterResult = await tx.incomeMaster.deleteMany();
    const eventResult = await tx.event.deleteMany();
    const ministryResult = await tx.ministry.deleteMany();
    await seedDefaultMaster(tx);
    return {
      deletedTransactions: transactionResult.count,
      deletedImportBatches: importBatchResult.count,
      deletedIncomeTypes: incomeTypeResult.count,
      deletedIncomeMasters: incomeMasterResult.count,
      deletedExpenseTypes: expenseTypeResult.count,
      deletedEvents: eventResult.count,
      deletedMinistries: ministryResult.count,
    };
  });

  return NextResponse.json({
    ok: true,
    message: "Semua data percobaan berhasil direset dan master default dipulihkan.",
    ...summary,
  });
}
