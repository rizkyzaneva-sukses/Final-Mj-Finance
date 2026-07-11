import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

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
  const event = await db.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Event tidak ditemukan." }, { status: 404 });
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
  if (session.role !== "FINANCE") return NextResponse.json({ error: "Hanya Menteri Keuangan yang dapat unggah dokumen." }, { status: 403 });
  const { id } = await params;
  const event = await db.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Event tidak ditemukan." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Berkas wajib diunggah." }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Format harus gambar (JPG/PNG/WebP/GIF) atau PDF." }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Ukuran maksimal 10 MB per berkas." }, { status: 400 });

  const note = typeof form?.get("note") === "string" ? String(form.get("note") || "").trim() || null : null;
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
  return NextResponse.json({ document });
}
