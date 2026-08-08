"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, FileUp, FileWarning } from "lucide-react";
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

export function BatchHistory({ batches }: { batches: Batch[] }) {
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const filtered = batches.filter((b) => matchesFilter(b, filter));

  return (
    <section className="panel">
      <div className="panel-title">
        <div><span className="eyebrow">RIWAYAT</span><h2>Impor terakhir</h2></div>
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
      {filtered.length ? (
        <div className="batch-list">
          {filtered.map((batch) => (
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
              </div>
              <div className="batch-numbers"><b>{batch.importedRows}</b><small>masuk</small></div>
              <div className="batch-numbers"><b>{batch.matchedRows}</b><small>cocok</small></div>
              <div className="batch-numbers"><b>{batch.unmatchedRows}</b><small>tinjau</small></div>
              <div className="batch-numbers"><b>{batch.skippedRows}</b><small>skip</small></div>
              <div className="batch-numbers"><b>{batch.duplicateRows}</b><small>duplikat</small></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state"><span>+</span><p>Tidak ada impor untuk filter ini.</p></div>
      )}
    </section>
  );
}
