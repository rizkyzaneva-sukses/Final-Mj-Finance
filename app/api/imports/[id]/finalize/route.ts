import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { finalizeImportBatch } from "@/lib/matching";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  const { id } = await params;
  const batch = await db.importBatch.findUnique({ where: { id } });
  if (!batch) return NextResponse.json({ error: "Batch impor tidak ditemukan." }, { status: 404 });
  if (batch.status !== "REVIEW") return NextResponse.json({ error: "Batch ini sudah tidak dalam tahap review." }, { status: 400 });

  await finalizeImportBatch(id);
  await db.importBatch.update({
    where: { id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
