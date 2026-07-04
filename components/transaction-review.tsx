"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronRight, LoaderCircle, Search, Undo2, X } from "lucide-react";
import { dateId, rupiah } from "@/lib/format";

type Row = { id: string; date: string; description: string; amount: number; direction: "IN" | "OUT"; source: string; status: string; ministry: string | null; event: string | null; incomeType: string | null; skipReason: string | null };
type Master = { id: string; code: number; name: string; events: { id: string; name: string; incomeTypes: { id: string; name: string; uniqueCode: string | null }[] }[] };

export function TransactionReview({ rows, master, activeStatus, counts }: { rows: Row[]; master: Master[]; activeStatus: string; counts: Record<string, number> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Row | null>(null);
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

  return <>
    <section className="transaction-toolbar">
      <div className="status-tabs">
        <button className={activeStatus === "UNMATCHED" ? "selected" : ""} onClick={() => setStatus("UNMATCHED")}>Perlu ditinjau <b>{counts.UNMATCHED || 0}</b></button>
        <button className={activeStatus === "MATCHED" ? "selected" : ""} onClick={() => setStatus("MATCHED")}>Sudah cocok <b>{counts.MATCHED || 0}</b></button>
        <button className={activeStatus === "SKIPPED" ? "selected" : ""} onClick={() => setStatus("SKIPPED")}>Dilewati <b>{counts.SKIPPED || 0}</b></button>
      </div>
      <form className="search-box" onSubmit={search}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari deskripsi..." /></form>
    </section>
    <section className="panel table-panel">
      {rows.length ? <div className="responsive-table"><table><thead><tr><th>Tanggal & sumber</th><th>Deskripsi</th><th>Arah</th><th>Nominal</th><th>Assignment</th><th /></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id}>
          <td><strong>{dateId.format(new Date(row.date))}</strong><small>{row.source.replaceAll("_", " ")}</small></td>
          <td className="description-cell">{row.description}{row.skipReason && <small>{row.skipReason}</small>}</td>
          <td><span className={`direction-pill ${row.direction === "IN" ? "pill-in" : "pill-out"}`}>{row.direction === "IN" ? "Masuk" : "Keluar"}</span></td>
          <td className={row.direction === "IN" ? "money-in" : "money-out"}><strong>{rupiah.format(row.amount)}</strong></td>
          <td>{row.event ? <div className="assignment-summary"><strong>{row.event}</strong><small>{row.ministry}{row.incomeType ? ` · ${row.incomeType}` : ""}</small></div> : <span className="muted">Belum di-assign</span>}</td>
          <td className="row-actions">{row.status === "UNMATCHED" ? <><button className="icon-button action-assign" title="Assign" onClick={() => setSelected(row)}><ChevronRight /></button><button className="icon-button" title="Lewati" disabled={loadingId === row.id} onClick={() => changeStatus(row, "skip")}>{loadingId === row.id ? <LoaderCircle className="spin" /> : <X />}</button></> : row.status === "SKIPPED" ? <button className="icon-button" title="Kembalikan" disabled={loadingId === row.id} onClick={() => changeStatus(row, "reopen")}><Undo2 /></button> : <span className="verified"><Check /></span>}</td>
        </tr>)}
      </tbody></table></div> : <div className="empty-state"><span>✓</span><p>Tidak ada transaksi pada bagian ini.</p></div>}
    </section>
    {selected && <AssignmentModal row={selected} master={master} onClose={() => setSelected(null)} />}
  </>;
}

function AssignmentModal({ row, master, onClose }: { row: Row; master: Master[]; onClose: () => void }) {
  const router = useRouter();
  const [ministryId, setMinistryId] = useState("");
  const [eventId, setEventId] = useState("");
  const [incomeTypeId, setIncomeTypeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ministry = master.find((item) => item.id === ministryId);

  async function save() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/transactions/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", ministryId, eventId, incomeTypeId }),
    });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error || "Assignment gagal."); setLoading(false); return; }
    onClose();
    router.refresh();
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
    <button className="modal-close" onClick={onClose}><X /></button>
    <div className="eyebrow">ASSIGN TRANSAKSI</div><h2>{row.direction === "IN" ? "Tentukan jenis pemasukan" : "Tentukan tujuan pengeluaran"}</h2>
    <div className="modal-amount"><span>{dateId.format(new Date(row.date))}</span><strong>{rupiah.format(row.amount)}</strong></div>
    <p className="modal-description">{row.description}</p>
    {row.direction === "IN" ? <label>Jenis pemasukan<select value={incomeTypeId} onChange={(e) => setIncomeTypeId(e.target.value)}><option value="">Pilih jenis pemasukan...</option>{master.flatMap((m) => m.events.flatMap((ev) => ev.incomeTypes.map((type) => <option key={type.id} value={type.id}>{m.code} · {m.name} / {ev.name} / {type.name} ({type.uniqueCode || "tanpa kode"})</option>)))}</select></label> : <>
      <label>Kementerian<select value={ministryId} onChange={(e) => { setMinistryId(e.target.value); setEventId(""); }}><option value="">Pilih kementerian...</option>{master.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
      <label>Event<select value={eventId} onChange={(e) => setEventId(e.target.value)} disabled={!ministry}><option value="">Pilih event...</option>{ministry?.events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </>}
    {error && <div className="form-error">{error}</div>}
    <button className="button button-primary button-wide" disabled={loading || (row.direction === "IN" ? !incomeTypeId : !ministryId || !eventId)} onClick={save}>{loading ? <LoaderCircle className="spin" /> : <Check />} Simpan assignment</button>
  </div></div>;
}
