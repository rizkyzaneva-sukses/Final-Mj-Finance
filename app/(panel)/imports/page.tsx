import { UploadPanel } from "@/components/upload-panel";
import { BatchHistory } from "@/components/batch-history";
import { PageHeading } from "@/components/page-heading";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { FileUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const [session, batches] = await Promise.all([
    getSession(),
    db.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const serialized = batches.map((b) => ({
    ...b,
    createdAt: b.createdAt.toISOString(),
  }));
  return (
    <div className="page-stack">
      <PageHeading eyebrow="MASUKKAN DATA" title="Dua sumber, satu pembukuan." description="Unggah mutasi BCA dan laporan QRIS. Sistem akan membersihkan, mencocokkan, lalu menyiapkan sisanya untuk ditinjau." icon={<FileUp size={26} />} />
      <UploadPanel canImportHistorical={session?.role === "FINANCE"} />
      <BatchHistory batches={serialized} />
    </div>
  );
}
