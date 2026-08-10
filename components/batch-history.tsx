"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock3, FileWarning, LoaderCircle, Undo2 } from "lucide-react";
import { dateId } from "@/lib/format";

type Batch = {
  id: string;
  fileName: string;
  source: string;
  accountHolder: string | null;
  accountNumber: string | null;
  status: string;
  importedRows: number;
  matchedRows: number;
  unmatchedRows: number;
  skippedRows: number;
  duplicateRows: number;
  createdAt: string;
  errorMessage: string | null;
};

type FilterKey = "ALL" | "QRIS" | "RIZKY" | "SUGIARSA";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "Semua" },
  { key: "QRIS", label: "QRIS" },
  { key: "RIZKY", label: "BCA Rizky" },
  { key: "SUGIARSA", label: "BCA Sugiarsa" },
];

function matchesFilter(batch: Batch, filter: FilterKey): boolean {
  if (filter === "ALL") return true;
  if (filter === "QRIS") return batch.source === "QRIS_XLSX";
  if (filter === "RIZKY") return batch.accountNumber === "0770015477";
  if (filter === "SUGIARSA") return batch.accountNumber === "0590040242";
  return true;
}

export function BatchHistory({
  batches,
  canUndo = false,
  undoableIds = [],
}: {
  batches: Batch[];
  canUndo?: boolean;
  undoableIds?: string[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const filtered = batches.filter((b) => matchesFilter(b, filter));
  const undoableSet = new Set(undoableIds);

  async function undoBatch(batch: Batch) {
    const isFailed = batch.status === "FAILED";
    const message = isFailed
      ? `Hapus riwayat impor gagal "${batch.fileName}"?`
      : [
          `Batalkan impor "${batch.fileName}"?`,
          "",
          `• ${batch.importedRows} transaksi akan dihapus dari buku`,
          "• Saldo rekening akan kembali seperti sebelum impor ini",
          "• Saldo awal tidak terpengaruh",
          "• Hanya 2 impor selesai terakhir yang bisa dibatalkan",
          "",
          "Tindakan ini tidak bisa dibatalkan lagi.",
        ].join("\n");
    if (!window.confirm(message)) return;

    setUndoingId(batch.id);
    setError("");
    try {
      const response = await fetch(`/api/imports/${batch.id}/undo`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || "Impor gagal dibatalkan.");
        return;
      }
      router.refresh();
    } catch {
      setError("Koneksi gagal. Coba lagi.");
    } finally {
      setUndoingId(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <span className="eyebrow">RIWAYAT</span>
          <h2>Impor terakhir</h2>
        </div>
        {canUndo && (
          <small className="panel-title-note">
            Batalkan hanya untuk 2 impor selesai terakhir · hapus transaksi + riwayat
          </small>
        )}
      </div>
      <div className="batch-filter-tabs" role="tablist">
        {FILTERS.map((f) => {
          const count = batches.filter((b) => matchesFilter(b, f.key)).length;
          return (
            <button
              key={f.key}
              className={filter === f.key ? "selected" : ""}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <b className={filter === f.key ? "badge-ok" : "badge-muted"}>{count}</b>
            </button>
          );
        })}
      </div>
      {error && <div className="form-error" style={{ margin: "0 .85rem .5rem" }}>{error}</div>}
      {filtered.length ? (
        <div className="batch-list">
          {filtered.map((batch) => {
            const showUndo = canUndo && undoableSet.has(batch.id) && (batch.status === "COMPLETED" || batch.status === "FAILED");
            return (
              <div className="batch-item" key={batch.id}>
                <div className={`batch-status status-${batch.status.toLowerCase()}`}>
                  {batch.status === "COMPLETED" ? <CheckCircle2 /> : batch.status === "FAILED" ? <FileWarning /> : <Clock3 />}
                </div>
                <div className="batch-main">
                  <strong>{batch.fileName}</strong>
                  <small>{dateId.format(new Date(batch.createdAt))} · {batch.source.replaceAll("_", " ")}{batch.accountNumber ? ` · ${batch.accountNumber}` : ""}</small>
                  {batch.accountHolder && <small>{batch.accountHolder}</small>}
                  {batch.errorMessage && <span>{batch.errorMessage}</span>}
                  {batch.status === "REVIEW" && <Link href={`/imports/${batch.id}`}>Lanjut review <ArrowRight size={14} /></Link>}
                  {showUndo && (
                    <button
                      type="button"
                      className="batch-undo-link"
                      disabled={undoingId === batch.id}
                      onClick={() => void undoBatch(batch)}
                    >
                      {undoingId === batch.id ? <LoaderCircle className="spin" size={14} /> : <Undo2 size={14} />}
                      {batch.status === "FAILED" ? "Hapus riwayat" : "Batalkan impor"}
                    </button>
                  )}
                </div>
                <div className="batch-numbers"><b>{batch.importedRows}</b><small>masuk</small></div>
                <div className="batch-numbers"><b>{batch.matchedRows}</b><small>cocok</small></div>
                <div className="batch-numbers"><b>{batch.unmatchedRows}</b><small>tinjau</small></div>
                <div className="batch-numbers"><b>{batch.skippedRows}</b><small>skip</small></div>
                <div className="batch-numbers"><b>{batch.duplicateRows}</b><small>duplikat</small></div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state"><span>+</span><p>Tidak ada impor untuk filter ini.</p></div>
      )}
    </section>
  );
}
