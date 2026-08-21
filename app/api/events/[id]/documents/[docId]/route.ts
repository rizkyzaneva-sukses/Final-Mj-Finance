import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessEventDocuments } from "@/lib/ministry-login";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  const { id, docId } = await params;
  const access = await canAccessEventDocuments(session, id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.canWrite) return NextResponse.json({ error: "Tidak diizinkan menghapus dokumen." }, { status: 403 });

  const document = await db.eventDocument.findFirst({ where: { id: docId, eventId: id } });
  if (!document) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
  await db.eventDocument.delete({ where: { id: docId } });
  return NextResponse.json({ ok: true });
}
