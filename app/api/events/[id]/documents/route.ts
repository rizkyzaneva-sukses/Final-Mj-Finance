import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessEventDocuments } from "@/lib/ministry-login";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  const { id } = await params;
  const access = await canAccessEventDocuments(session, id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const documents = await db.eventDocument.findMany({
    where: { eventId: id },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      size: true,
      note: true,
      uploadedAt: true,
      uploadedByRole: true,
    },
  });
  return NextResponse.json({ documents });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  const { id } = await params;
  const access = await canAccessEventDocuments(session, id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!access.canWrite) return NextResponse.json({ error: "Tidak diizinkan mengunggah dokumen." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Form unggahan tidak valid." }, { status: 400 });

  const files = form.getAll("file").filter((item): item is File => item instanceof File);
  if (!files.length) return NextResponse.json({ error: "Berkas wajib diunggah." }, { status: 400 });

  const note = typeof form.get("note") === "string" ? String(form.get("note") || "").trim() || null : null;
  const created = [];

  for (const file of files) {
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: `Format "${file.name}" harus gambar (JPG/PNG/WebP/GIF) atau PDF.` }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: `Ukuran "${file.name}" melebihi 10 MB.` }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await db.eventDocument.create({
      data: {
        eventId: id,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        data: new Uint8Array(buffer),
        note,
        uploadedByRole: session.role,
      },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        size: true,
        note: true,
        uploadedAt: true,
        uploadedByRole: true,
      },
    });
    created.push(document);
  }

  return NextResponse.json({ documents: created, document: created[0] });
}
