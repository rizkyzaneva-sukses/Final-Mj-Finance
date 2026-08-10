import { UploadPanel } from "@/components/upload-panel";
import { BatchHistory } from "@/components/batch-history";
import { PageHeading } from "@/components/page-heading";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { FileUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const [session, batches, undoableCompleted] = await Promise.all([
    getSession(),
    db.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    // Hanya 2 impor COMPLETED terbaru yang boleh di-undo (hapus transaksi + riwayat).
    db.importBatch.findMany({
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 2,
      select: { id: true },
    }),
  ]);
  const serialized = batches.map((b) => ({
    ...b,
    createdAt: b.createdAt.toISOString(),
  }));
  const undoableIds = [
    ...undoableCompleted.map((b) => b.id),
    // FAILED hanya cleanup riwayat — boleh dihapus jika muncul di daftar.
    ...batches.filter((b) => b.status === "FAILED").map((b) => b.id),
  ];
  return (
    <div className="page-stack">
      <PageHeading eyebrow="MASUKKAN DATA" title="Dua sumber, satu pembukuan." description="Unggah mutasi BCA dan laporan QRIS. Sistem akan membersihkan, mencocokkan, lalu menyiapkan sisanya untuk ditinjau." icon={<FileUp size={26} />} />
      <UploadPanel canImportHistorical={session?.role === "FINANCE"} />
      <BatchHistory
        batches={serialized}
        canUndo={session?.role === "FINANCE"}
        undoableIds={undoableIds}
      />
    </div>
  );
}
