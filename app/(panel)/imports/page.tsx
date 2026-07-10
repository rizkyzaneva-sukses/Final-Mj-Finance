import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, FileUp, FileWarning } from "lucide-react";
import { UploadPanel } from "@/components/upload-panel";
import { PageHeading } from "@/components/page-heading";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateId } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const [session, batches] = await Promise.all([
    getSession(),
    db.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  return (
    <div className="page-stack">
      <PageHeading eyebrow="MASUKKAN DATA" title="Dua sumber, satu pembukuan." description="Unggah mutasi BCA dan laporan QRIS. Sistem akan membersihkan, mencocokkan, lalu menyiapkan sisanya untuk ditinjau." icon={<FileUp size={26} />} />
      <UploadPanel canImportHistorical={session?.role === "FINANCE"} />
      <section className="panel">
        <div className="panel-title"><div><span className="eyebrow">RIWAYAT</span><h2>Impor terakhir</h2></div></div>
        {batches.length ? <div className="batch-list">{batches.map((batch) => <div className="batch-item" key={batch.id}>
          <div className={`batch-status status-${batch.status.toLowerCase()}`}>{batch.status === "COMPLETED" ? <CheckCircle2 /> : batch.status === "FAILED" ? <FileWarning /> : <Clock3 />}</div>
          <div className="batch-main"><strong>{batch.fileName}</strong><small>{dateId.format(batch.createdAt)} · {batch.source.replaceAll("_", " ")}{batch.accountNumber ? ` · ${batch.accountNumber}` : ""}</small>{batch.accountHolder && <small>{batch.accountHolder}</small>}{batch.errorMessage && <span>{batch.errorMessage}</span>}{batch.status === "REVIEW" && <Link href={`/imports/${batch.id}`}>Lanjut review <ArrowRight size={14} /></Link>}</div>
          <div className="batch-numbers"><b>{batch.importedRows}</b><small>masuk</small></div>
          <div className="batch-numbers"><b>{batch.matchedRows}</b><small>cocok</small></div>
          <div className="batch-numbers"><b>{batch.unmatchedRows}</b><small>tinjau</small></div>
          <div className="batch-numbers"><b>{batch.skippedRows}</b><small>skip</small></div>
          <div className="batch-numbers"><b>{batch.duplicateRows}</b><small>duplikat</small></div>
        </div>)}</div> : <div className="empty-state"><span>+</span><p>Belum ada file yang diimpor.</p></div>}
      </section>
    </div>
  );
}
