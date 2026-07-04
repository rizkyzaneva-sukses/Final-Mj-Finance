import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  const { id } = await params;
  const batch = await db.importBatch.findUnique({ where: { id } });
  if (!batch) return NextResponse.json({ error: "Batch impor tidak ditemukan." }, { status: 404 });
  if (batch.status !== "REVIEW") return NextResponse.json({ error: "Hanya draft review yang bisa dibuang." }, { status: 400 });

  await db.transaction.deleteMany({ where: { importBatchId: id, isDraft: true } });
  await db.importBatch.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
