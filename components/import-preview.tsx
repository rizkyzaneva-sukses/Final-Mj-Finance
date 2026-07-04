"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, LoaderCircle, Search, Trash2, Undo2, UploadCloud, X } from "lucide-react";
import { dateId, rupiah } from "@/lib/format";
import { TransactionAssignmentModal, type AssignmentTarget, type MasterTree } from "@/components/transaction-assignment-modal";

type Row = {
  id: string;
  date: string;
  description: string;
  amount: number;
  direction: "IN" | "OUT";
  source: string;
  status: string;
  ministry: string | null;
  event: string | null;
  incomeType: string | null;
  expenseType: string | null;
  skipReason: string | null;
  accountHolder: string | null;
  accountNumber: string | null;
};

type Batch = {
  id: string;
  fileName: string;
  source: string;
  accountHolder: string | null;
  accountNumber: string | null;
  importedRows: number;
  matchedRows: number;
  unmatchedRows: number;
  skippedRows: number;
  duplicateRows: number;
};

export function ImportPreview({ batch, rows, master }: { batch: Batch; rows: Row[]; master: MasterTree[] }) {
  const router = useRouter();
  const counts = {
    MATCHED: rows.filter((row) => row.status === "MATCHED").length,
    UNMATCHED: rows.filter((row) => row.status === "UNMATCHED").length,
    SKIPPED: rows.filter((row) => row.status === "SKIPPED").length,
  };
  const [activeStatus, setActiveStatus] = useState<"UNMATCHED" | "MATCHED" | "SKIPPED">(counts.UNMATCHED ? "UNMATCHED" : counts.MATCHED ? "MATCHED" : "SKIPPED");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assignmentTarget, setAssignmentTarget] = useState<AssignmentTarget | null>(null);
  const [busyAction, setBusyAction] = useState<"finalize" | "discard" | "skip" | "reopen" | null>(null);
  const visibleRows = rows.filter((row) => row.status === activeStatus && (!query || row.description.toLowerCase().includes(query.toLowerCase()) || row.accountHolder?.toLowerCase().includes(query.toLowerCase()) || row.accountNumber?.includes(query)));
  const selectedRows = rows.filter((row) => selectedIds.includes(row.id));
  const mixedDirections = selectedRows.some((row) => row.direction !== selectedRows[0]?.direction);

  function toggleRow(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    const visibleIds = visibleRows.map((row) => row.id);
    if (visibleIds.every((id) => selectedIds.includes(id))) setSelectedIds((current) => current.filter((id) => !visibleIds.includes(id)));
    else setSelectedIds((current) => [...new Set([...current, ...visibleIds])]);
  }

  async function runBulkAction(action: "skip" | "reopen", ids = selectedIds) {
    if (!ids.length) return;
    setBusyAction(action);
    const response = await fetch("/api/transactions/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(payload.error || "Aksi bulk gagal.");
      setBusyAction(null);
      return;
    }
    setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    setBusyAction(null);
    router.refresh();
  }

  async function finalize() {
    setBusyAction("finalize");
    const response = await fetch(`/api/imports/${batch.id}/finalize`, { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(payload.error || "Gagal menerapkan batch.");
      setBusyAction(null);
      return;
    }
    router.push("/transactions");
  }

  async function discard() {
    setBusyAction("discard");
    const response = await fetch(`/api/imports/${batch.id}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(payload.error || "Gagal membuang draft.");
      setBusyAction(null);
      return;
    }
    router.push("/imports");
  }

  return <>
    <section className="panel import-preview-card">
      <div className="panel-title import-preview-head">
        <div>
          <span className="eyebrow">BATCH AKTIF</span>
          <h2>{batch.fileName}</h2>
          <p className="import-preview-meta">{batch.source.replaceAll("_", " ")} · {batch.accountHolder || "Rekening belum terbaca"}{batch.accountNumber ? ` · ${batch.accountNumber}` : ""}</p>
        </div>
        <div className="import-preview-actions">
          <button className="button button-dark" onClick={discard} disabled={busyAction !== null}>{busyAction === "discard" ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />} Buang draft</button>
          <button className="button button-primary" onClick={finalize} disabled={busyAction !== null}>{busyAction === "finalize" ? <LoaderCircle className="spin" size={17} /> : <UploadCloud size={17} />} Terapkan ke buku transaksi</button>
        </div>
      </div>
      <div className="import-preview-stats">
        <div><strong>{batch.importedRows}</strong><small>masuk</small></div>
        <div><strong>{batch.matchedRows}</strong><small>cocok</small></div>
        <div><strong>{batch.unmatchedRows}</strong><small>tinjau</small></div>
        <div><strong>{batch.skippedRows}</strong><small>skip</small></div>
        <div><strong>{batch.duplicateRows}</strong><small>duplikat</small></div>
      </div>
    </section>

    <section className="transaction-toolbar">
      <div className="status-tabs">
        <button className={activeStatus === "UNMATCHED" ? "selected" : ""} onClick={() => setActiveStatus("UNMATCHED")}>Perlu ditinjau <b>{counts.UNMATCHED}</b></button>
        <button className={activeStatus === "MATCHED" ? "selected" : ""} onClick={() => setActiveStatus("MATCHED")}>Sudah cocok <b>{counts.MATCHED}</b></button>
        <button className={activeStatus === "SKIPPED" ? "selected" : ""} onClick={() => setActiveStatus("SKIPPED")}>Dilewati <b>{counts.SKIPPED}</b></button>
      </div>
      <form className="search-box" onSubmit={(event) => event.preventDefault()}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari deskripsi atau rekening..." /></form>
    </section>

    {selectedIds.length > 0 && <section className="panel bulk-bar">
      <div>
        <strong>{selectedIds.length} transaksi dipilih</strong>
        <small>{mixedDirections ? "Pilih transaksi dengan arah yang sama untuk bulk assign." : selectedRows[0]?.direction === "IN" ? "Siap assign ke jenis pemasukan yang sama." : "Siap assign ke kementerian dan event yang sama."}</small>
      </div>
      <div className="bulk-bar-actions">
        <button className="button button-dark" disabled={mixedDirections || busyAction !== null} onClick={() => setAssignmentTarget({ ids: selectedIds, direction: selectedRows[0]!.direction, date: selectedRows[0]!.date, description: `${selectedIds.length} transaksi terpilih`, amount: selectedRows[0]!.amount, accountHolder: selectedRows[0]!.accountHolder, accountNumber: selectedRows[0]!.accountNumber })}><ChevronRight size={17} /> Assign terpilih</button>
        <button className="button" disabled={busyAction !== null} onClick={() => runBulkAction("skip")}>{busyAction === "skip" ? <LoaderCircle className="spin" size={17} /> : <X size={17} />} Lewati</button>
        <button className="button" disabled={busyAction !== null} onClick={() => runBulkAction("reopen")}><Undo2 size={17} /> Buka lagi</button>
      </div>
    </section>}

    <section className="panel table-panel">
      {visibleRows.length ? <div className="responsive-table"><table><thead><tr><th><input type="checkbox" checked={visibleRows.length > 0 && visibleRows.every((row) => selectedIds.includes(row.id))} onChange={toggleAllVisible} /></th><th>Tanggal & sumber</th><th>Rekening</th><th>Deskripsi</th><th>Arah</th><th>Nominal</th><th>Assignment</th><th /></tr></thead><tbody>
        {visibleRows.map((row) => <tr key={row.id}>
          <td><input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} /></td>
          <td><strong>{dateId.format(new Date(row.date))}</strong><small>{row.source.replaceAll("_", " ")}</small></td>
          <td><strong>{row.accountHolder || "Belum terbaca"}</strong><small>{row.accountNumber || "Tanpa nomor rekening"}</small></td>
          <td className="description-cell">{row.description}{row.skipReason && <small>{row.skipReason}</small>}</td>
          <td><span className={`direction-pill ${row.direction === "IN" ? "pill-in" : "pill-out"}`}>{row.direction === "IN" ? "Masuk" : "Keluar"}</span></td>
          <td className={row.direction === "IN" ? "money-in" : "money-out"}><strong>{rupiah.format(row.amount)}</strong></td>
          <td>{row.event ? <div className="assignment-summary"><strong>{row.event}</strong><small>{row.ministry}{row.incomeType ? ` · ${row.incomeType}` : row.expenseType ? ` · ${row.expenseType}` : ""}</small></div> : <span className="muted">Belum di-assign</span>}</td>
          <td className="row-actions">{row.status === "SKIPPED" ? <><button className="icon-button action-assign" title="Assign" onClick={() => setAssignmentTarget({ ids: [row.id], direction: row.direction, date: row.date, description: row.description, amount: row.amount, accountHolder: row.accountHolder, accountNumber: row.accountNumber })}><ChevronRight /></button><button className="icon-button" title="Kembalikan" onClick={() => void runBulkAction("reopen", [row.id])}><Undo2 /></button></> : <><button className="icon-button action-assign" title="Assign" onClick={() => setAssignmentTarget({ ids: [row.id], direction: row.direction, date: row.date, description: row.description, amount: row.amount, accountHolder: row.accountHolder, accountNumber: row.accountNumber })}><ChevronRight /></button><button className="icon-button" title="Lewati" onClick={() => void runBulkAction("skip", [row.id])}><X /></button>{row.status === "MATCHED" && <span className="verified"><Check /></span>}</>}</td>
        </tr>)}
      </tbody></table></div> : <div className="empty-state"><span>✓</span><p>Tidak ada transaksi pada bagian ini.</p></div>}
    </section>

    {assignmentTarget && <TransactionAssignmentModal target={assignmentTarget} master={master} onClose={() => setAssignmentTarget(null)} />}
  </>;
}
