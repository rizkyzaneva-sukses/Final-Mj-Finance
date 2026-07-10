"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, LoaderCircle, Search, Trash2, Undo2, X, Layers } from "lucide-react";
import { dateId, rupiah } from "@/lib/format";
import { TransactionAssignmentModal, type AssignmentTarget, type MasterTree } from "@/components/transaction-assignment-modal";

type Row = { id: string; date: string; description: string; amount: number; direction: "IN" | "OUT"; source: string; status: string; ministry: string | null; event: string | null; incomeType: string | null; expenseType: string | null; skipReason: string | null; accountHolder: string | null; accountNumber: string | null };
type Option = { value: string; label: string };
type EventOption = Option & { ministryId: string };
type IncomeTypeOption = Option & { ministryId: string; eventId: string };

export function TransactionReview({
  rows,
  master,
  canDelete,
  activeStatus,
  activeTab,
  counts,
  filters,
  pagination,
}: {
  rows: Row[];
  master: MasterTree[];
  canDelete: boolean;
  activeStatus: string;
  activeTab: string;
  counts: Record<string, number>;
  filters: {
    query: string;
    source: string;
    ministryId: string;
    eventId: string;
    incomeTypeId: string;
    expenseTypeId: string;
    account: string;
    direction: string;
    ministries: Option[];
    events: EventOption[];
    incomeTypes: IncomeTypeOption[];
    expenseTypes: Option[];
    accounts: Option[];
  };
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<AssignmentTarget | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [query, setQuery] = useState(filters.query);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [form, setForm] = useState({
    ministryId: filters.ministryId,
    eventId: filters.eventId,
    incomeTypeId: filters.incomeTypeId,
    expenseTypeId: filters.expenseTypeId,
    account: filters.account,
    direction: filters.direction,
  });
  const visibleEvents = filters.events.filter((item) => !form.ministryId || item.ministryId === form.ministryId);
  const visibleIncomeTypes = filters.incomeTypes.filter((item) => {
    if (form.eventId) return item.eventId === form.eventId;
    if (form.ministryId) return item.ministryId === form.ministryId;
    return true;
  });

  function pushWith(next: URLSearchParams) {
    const queryString = next.toString();
    router.push(queryString ? `/transactions?${queryString}` : "/transactions");
  }

  function setStatus(status: string) {
    const next = new URLSearchParams(searchParams);
    next.set("status", status);
    next.delete("page");
    pushWith(next);
  }

  function search(event: React.FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (query) next.set("q", query); else next.delete("q");
    if (form.ministryId) next.set("ministryId", form.ministryId); else next.delete("ministryId");
    if (form.eventId) next.set("eventId", form.eventId); else next.delete("eventId");
    if (form.incomeTypeId) next.set("incomeTypeId", form.incomeTypeId); else next.delete("incomeTypeId");
    if (form.expenseTypeId) next.set("expenseTypeId", form.expenseTypeId); else next.delete("expenseTypeId");
    if (form.account) next.set("account", form.account); else next.delete("account");
    if (form.direction) next.set("direction", form.direction); else next.delete("direction");
    next.delete("page");
    pushWith(next);
  }

  function clearFilters() {
    setQuery("");
    setForm({
      ministryId: "",
      eventId: "",
      incomeTypeId: "",
      expenseTypeId: "",
      account: "",
      direction: "",
    });
    const next = new URLSearchParams(searchParams);
    next.delete("q");
    next.delete("ministryId");
    next.delete("eventId");
    next.delete("incomeTypeId");
    next.delete("expenseTypeId");
    next.delete("account");
    next.delete("direction");
    next.delete("page");
    pushWith(next);
  }

  function goToPage(page: number) {
    const next = new URLSearchParams(searchParams);
    if (page <= 1) next.delete("page");
    else next.set("page", String(page));
    pushWith(next);
  }

  async function changeStatus(row: Row, action: "skip" | "reopen") {
    setLoadingId(row.id);
    const response = await fetch(`/api/transactions/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (!response.ok) alert((await response.json()).error || "Perubahan gagal.");
    setLoadingId(null);
    router.refresh();
  }

  async function deleteRow(row: Row) {
    if (!confirm(`Hapus transaksi ini secara permanen?\n\n${dateId.format(new Date(row.date))} · ${row.description} · ${rupiah.format(row.amount)}\n\nTindakan ini tidak bisa dibatalkan.`)) return;
    setLoadingId(row.id);
    const response = await fetch(`/api/transactions/${row.id}`, { method: "DELETE" });
    if (!response.ok) alert((await response.json()).error || "Gagal menghapus transaksi.");
    setLoadingId(null);
    router.refresh();
  }

  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const hasSelection = selectedIds.size > 0;
  const selectedRows = useMemo(() => rows.filter((row) => selectedIds.has(row.id)), [rows, selectedIds]);
  const selectedDirection = selectedRows.length > 0 ? selectedRows[0].direction : null;
  const directionConflict = selectedRows.some((row) => row.direction !== selectedDirection);

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        rows.forEach((row) => next.delete(row.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        rows.forEach((row) => next.add(row.id));
        return next;
      });
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openBulkAssign() {
    if (!hasSelection || directionConflict) return;
    const firstRow = selectedRows[0];
    setSelected({
      ids: Array.from(selectedIds),
      direction: firstRow.direction,
      date: firstRow.date,
      description: `[${selectedIds.size} transaksi]`,
      amount: selectedRows.reduce((sum, r) => sum + r.amount, 0),
      accountHolder: null,
      accountNumber: null,
    });
  }

  async function bulkSkip() {
    if (!hasSelection) return;
    setBulkLoading(true);
    const response = await fetch("/api/transactions/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds), action: "skip" }),
    });
    if (!response.ok) alert((await response.json()).error || "Gagal melewati transaksi.");
    setSelectedIds(new Set());
    setBulkLoading(false);
    router.refresh();
  }

  function badgeClass(status: "UNMATCHED" | "MATCHED" | "SKIPPED") {
    if (status === "UNMATCHED") return "badge-warning";
    if (status === "SKIPPED") return "badge-muted";
    return "badge-ok";
  }

  return <>
    <section className="transaction-toolbar">
      <div className="source-tabs">
        <button className={activeTab === "" ? "selected" : ""} onClick={() => { const next = new URLSearchParams(searchParams); next.delete("tab"); pushWith(next); }}>Semua</button>
        <button className={activeTab === "mutasi" ? "selected" : ""} onClick={() => { const next = new URLSearchParams(searchParams); next.set("tab", "mutasi"); next.delete("page"); pushWith(next); }}>Mutasi</button>
        <button className={activeTab === "qris" ? "selected" : ""} onClick={() => { const next = new URLSearchParams(searchParams); next.set("tab", "qris"); next.delete("page"); pushWith(next); }}>QRIS</button>
      </div>
      <div className="status-tabs">
        <button className={activeStatus === "UNMATCHED" ? "selected" : ""} onClick={() => setStatus("UNMATCHED")}>Perlu ditinjau <b className={badgeClass("UNMATCHED")}>{counts.UNMATCHED || 0}</b></button>
        <button className={activeStatus === "MATCHED" ? "selected" : ""} onClick={() => setStatus("MATCHED")}>Sudah cocok <b className={badgeClass("MATCHED")}>{counts.MATCHED || 0}</b></button>
        <button className={activeStatus === "SKIPPED" ? "selected" : ""} onClick={() => setStatus("SKIPPED")}>Dilewati <b className={badgeClass("SKIPPED")}>{counts.SKIPPED || 0}</b></button>
      </div>
      <form className="search-box" onSubmit={search}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari deskripsi, event, kementerian, rekening..." /></form>
    </section>
    <section className="panel transaction-filter-panel">
      <form className="transaction-filters" onSubmit={search}>
        <label>Cari teks<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Deskripsi / rekening / event" /></label>
        <label>Kementerian<select value={form.ministryId} onChange={(event) => setForm((current) => ({ ...current, ministryId: event.target.value, eventId: "", incomeTypeId: "" }))}><option value="">Semua kementerian</option>{filters.ministries.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>Event<select value={form.eventId} onChange={(event) => setForm((current) => ({ ...current, eventId: event.target.value, incomeTypeId: "" }))}><option value="">Semua event</option>{visibleEvents.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>Jenis pemasukan<select value={form.incomeTypeId} onChange={(event) => setForm((current) => ({ ...current, incomeTypeId: event.target.value }))}><option value="">Semua pemasukan</option>{visibleIncomeTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>Jenis pengeluaran<select value={form.expenseTypeId} onChange={(event) => setForm((current) => ({ ...current, expenseTypeId: event.target.value }))}><option value="">Semua pengeluaran</option>{filters.expenseTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>Sumber rekening<select value={form.account} onChange={(event) => setForm((current) => ({ ...current, account: event.target.value }))}><option value="">Semua rekening</option>{filters.accounts.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>In / Out<select value={form.direction} onChange={(event) => setForm((current) => ({ ...current, direction: event.target.value }))}><option value="">Semua arah</option><option value="IN">Masuk</option><option value="OUT">Keluar</option></select></label>
        <div className="transaction-filter-actions">
          <button className="button button-dark" type="submit">Terapkan filter</button>
          <button className="button" type="button" onClick={clearFilters}>Reset</button>
        </div>
      </form>
    </section>
    {hasSelection && <section className="panel bulk-toolbar">
      <div className="bulk-info">
        <strong>{selectedIds.size} transaksi dipilih</strong>
        {directionConflict && <small className="muted">⚠ Arah transaksi berbeda — pilih yang sama untuk assign</small>}
      </div>
      <div className="bulk-actions">
        <button className="button button-primary" disabled={directionConflict || bulkLoading} onClick={openBulkAssign}><Layers size={16} /> Assign sekaligus</button>
        <button className="button" disabled={bulkLoading} onClick={bulkSkip}>Lewati semua</button>
        <button className="button" onClick={() => setSelectedIds(new Set())}>Batal pilih</button>
      </div>
    </section>}
    <section className="panel table-panel">
      {rows.length ? <div className="responsive-table"><table className="responsive-transaction-table"><thead><tr><th className="checkbox-cell"><input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} title="Pilih semua" /></th><th>Tanggal & sumber</th><th>Rekening</th><th>Deskripsi</th><th>Arah</th><th>Nominal</th><th>Assignment</th><th /></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id} className={selectedIds.has(row.id) ? "row-selected" : ""}>
          <td className="checkbox-cell"><input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleRow(row.id)} /></td>
          <td data-label="Tanggal & sumber"><strong>{dateId.format(new Date(row.date))}</strong><small>{row.source.replaceAll("_", " ")}</small></td>
          <td data-label="Rekening"><strong>{row.accountHolder || "Belum terbaca"}</strong><small>{row.accountNumber || "Tanpa nomor rekening"}</small></td>
          <td className="description-cell" data-label="Deskripsi">{row.description}{row.skipReason && <small>{row.skipReason}</small>}</td>
          <td data-label="Arah"><span className={`direction-pill ${row.direction === "IN" ? "pill-in" : "pill-out"}`}>{row.direction === "IN" ? "Masuk" : "Keluar"}</span></td>
          <td className={row.direction === "IN" ? "money-in" : "money-out"} data-label="Nominal"><strong>{rupiah.format(row.amount)}</strong></td>
          <td data-label="Assignment">{row.event ? <div className="assignment-summary"><strong>{row.event}</strong><small>{row.ministry}{row.incomeType ? ` · ${row.incomeType}` : row.expenseType ? ` · ${row.expenseType}` : ""}</small></div> : <span className="muted">Belum di-assign</span>}</td>
          <td className="row-actions" data-label="Aksi">{row.status === "SKIPPED" ? <><button className="icon-button action-assign" title="Assign" onClick={() => setSelected({ ids: [row.id], direction: row.direction, date: row.date, description: row.description, amount: row.amount, accountHolder: row.accountHolder, accountNumber: row.accountNumber })}><ChevronRight /></button><button className="icon-button" title="Kembalikan" disabled={loadingId === row.id} onClick={() => changeStatus(row, "reopen")}><Undo2 /></button></> : row.status === "MATCHED" ? <><button className="icon-button action-assign" title="Ubah assignment" onClick={() => setSelected({ ids: [row.id], direction: row.direction, date: row.date, description: row.description, amount: row.amount, accountHolder: row.accountHolder, accountNumber: row.accountNumber })}><ChevronRight /></button><span className="verified"><Check /></span></> : <><button className="icon-button action-assign" title="Assign" onClick={() => setSelected({ ids: [row.id], direction: row.direction, date: row.date, description: row.description, amount: row.amount, accountHolder: row.accountHolder, accountNumber: row.accountNumber })}><ChevronRight /></button><button className="icon-button" title="Lewati" disabled={loadingId === row.id} onClick={() => changeStatus(row, "skip")}>{loadingId === row.id ? <LoaderCircle className="spin" /> : <X />}</button></>}{canDelete && <button className="icon-button icon-button-danger" title="Hapus permanen" disabled={loadingId === row.id} onClick={() => deleteRow(row)}><Trash2 /></button>}</td>
        </tr>)}
      </tbody></table></div> : <div className="empty-state"><span>✓</span><p>Tidak ada transaksi pada bagian ini.</p></div>}
    </section>
    <section className="transaction-pagination">
      <div className="transaction-pagination-meta">
        <strong>{pagination.totalRows}</strong>
        <small>transaksi cocok dengan filter ini</small>
      </div>
      <div className="transaction-pagination-controls">
        <button className="button" type="button" disabled={pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)}><ChevronLeft size={16} /> Sebelumnya</button>
        <span>Halaman {pagination.page} / {pagination.totalPages}</span>
        <button className="button" type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => goToPage(pagination.page + 1)}>Berikutnya <ChevronRight size={16} /></button>
      </div>
    </section>
    {selected && <TransactionAssignmentModal target={selected} master={master} onClose={() => setSelected(null)} />}
  </>;
}
