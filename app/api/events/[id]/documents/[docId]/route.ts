import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  if (session.role !== "FINANCE") return NextResponse.json({ error: "Hanya Menteri Keuangan yang dapat hapus dokumen." }, { status: 403 });
  const { id, docId } = await params;
  const document = await db.eventDocument.findFirst({ where: { id: docId, eventId: id } });
  if (!document) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
  await db.eventDocument.delete({ where: { id: docId } });
  return NextResponse.json({ ok: true });
}
