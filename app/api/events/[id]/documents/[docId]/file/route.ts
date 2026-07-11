import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  const { id, docId } = await params;
  const document = await db.eventDocument.findFirst({ where: { id: docId, eventId: id } });
  if (!document) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });

  const bytes = Buffer.from(document.data);

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(document.fileName)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
