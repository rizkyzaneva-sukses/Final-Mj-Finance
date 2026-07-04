"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronRight, LoaderCircle, Search, Undo2, X } from "lucide-react";
import { dateId, rupiah } from "@/lib/format";
import { TransactionAssignmentModal, type AssignmentTarget, type MasterTree } from "@/components/transaction-assignment-modal";

type Row = { id: string; date: string; description: string; amount: number; direction: "IN" | "OUT"; source: string; status: string; ministry: string | null; event: string | null; incomeType: string | null; expenseType: string | null; skipReason: string | null; accountHolder: string | null; accountNumber: string | null };

export function TransactionReview({ rows, master, activeStatus, counts }: { rows: Row[]; master: MasterTree[]; activeStatus: string; counts: Record<string, number> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<AssignmentTarget | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") || "");

  function setStatus(status: string) {
    const next = new URLSearchParams(searchParams);
    next.set("status", status);
    router.push(`/transactions?${next}`);
  }

  function search(event: React.FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (query) next.set("q", query); else next.delete("q");
    router.push(`/transactions?${next}`);
  }

  async function changeStatus(row: Row, action: "skip" | "reopen") {
    setLoadingId(row.id);
    const response = await fetch(`/api/transactions/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (!response.ok) alert((await response.json()).error || "Perubahan gagal.");
    setLoadingId(null);
    router.refresh();
  }

  function badgeClass(status: "UNMATCHED" | "MATCHED" | "SKIPPED") {
    if (status === "UNMATCHED") return "badge-warning";
    if (status === "SKIPPED") return "badge-muted";
    return "badge-ok";
  }

  return <>
    <section className="transaction-toolbar">
      <div className="status-tabs">
        <button className={activeStatus === "UNMATCHED" ? "selected" : ""} onClick={() => setStatus("UNMATCHED")}>Perlu ditinjau <b className={badgeClass("UNMATCHED")}>{counts.UNMATCHED || 0}</b></button>
        <button className={activeStatus === "MATCHED" ? "selected" : ""} onClick={() => setStatus("MATCHED")}>Sudah cocok <b className={badgeClass("MATCHED")}>{counts.MATCHED || 0}</b></button>
        <button className={activeStatus === "SKIPPED" ? "selected" : ""} onClick={() => setStatus("SKIPPED")}>Dilewati <b className={badgeClass("SKIPPED")}>{counts.SKIPPED || 0}</b></button>
      </div>
      <form className="search-box" onSubmit={search}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari deskripsi..." /></form>
    </section>
    <section className="panel table-panel">
      {rows.length ? <div className="responsive-table"><table><thead><tr><th>Tanggal & sumber</th><th>Rekening</th><th>Deskripsi</th><th>Arah</th><th>Nominal</th><th>Assignment</th><th /></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id}>
          <td><strong>{dateId.format(new Date(row.date))}</strong><small>{row.source.replaceAll("_", " ")}</small></td>
          <td><strong>{row.accountHolder || "Belum terbaca"}</strong><small>{row.accountNumber || "Tanpa nomor rekening"}</small></td>
          <td className="description-cell">{row.description}{row.skipReason && <small>{row.skipReason}</small>}</td>
          <td><span className={`direction-pill ${row.direction === "IN" ? "pill-in" : "pill-out"}`}>{row.direction === "IN" ? "Masuk" : "Keluar"}</span></td>
          <td className={row.direction === "IN" ? "money-in" : "money-out"}><strong>{rupiah.format(row.amount)}</strong></td>
          <td>{row.event ? <div className="assignment-summary"><strong>{row.event}</strong><small>{row.ministry}{row.incomeType ? ` · ${row.incomeType}` : row.expenseType ? ` · ${row.expenseType}` : ""}</small></div> : <span className="muted">Belum di-assign</span>}</td>
          <td className="row-actions">{row.status === "SKIPPED" ? <><button className="icon-button action-assign" title="Assign" onClick={() => setSelected({ ids: [row.id], direction: row.direction, date: row.date, description: row.description, amount: row.amount, accountHolder: row.accountHolder, accountNumber: row.accountNumber })}><ChevronRight /></button><button className="icon-button" title="Kembalikan" disabled={loadingId === row.id} onClick={() => changeStatus(row, "reopen")}><Undo2 /></button></> : row.status === "MATCHED" ? <><button className="icon-button action-assign" title="Ubah assignment" onClick={() => setSelected({ ids: [row.id], direction: row.direction, date: row.date, description: row.description, amount: row.amount, accountHolder: row.accountHolder, accountNumber: row.accountNumber })}><ChevronRight /></button><span className="verified"><Check /></span></> : <><button className="icon-button action-assign" title="Assign" onClick={() => setSelected({ ids: [row.id], direction: row.direction, date: row.date, description: row.description, amount: row.amount, accountHolder: row.accountHolder, accountNumber: row.accountNumber })}><ChevronRight /></button><button className="icon-button" title="Lewati" disabled={loadingId === row.id} onClick={() => changeStatus(row, "skip")}>{loadingId === row.id ? <LoaderCircle className="spin" /> : <X />}</button></>}</td>
        </tr>)}
      </tbody></table></div> : <div className="empty-state"><span>✓</span><p>Tidak ada transaksi pada bagian ini.</p></div>}
    </section>
    {selected && <TransactionAssignmentModal target={selected} master={master} onClose={() => setSelected(null)} />}
  </>;
}
