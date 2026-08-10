"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, LoaderCircle, Search, Trash2, TriangleAlert, Undo2, UploadCloud, X } from "lucide-react";
import { compactRupiah, dateId, rupiah } from "@/lib/format";
import { TransactionAssignmentModal, type AssignmentTarget, type MasterTree } from "@/components/transaction-assignment-modal";

type DuplicateOf =
  | {
      id: string;
      date: string;
      description: string;
      amount: number;
      direction: "IN" | "OUT";
      source: string;
      accountHolder: string | null;
      accountNumber: string | null;
      status: string;
      isDraft: boolean;
      missing?: false;
    }
  | { id: string; missing: true };

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
  isDuplicate?: boolean;
  isExactDuplicate?: boolean;
  duplicateOf?: DuplicateOf | null;
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

type BalanceImpact = {
  accountLabel: string;
  accountNumber: string | null;
  openingBalance: number;
  currentConfirmed: number;
  currentEstimated: number;
  bankDelta: number;
  incomeDelta: number;
  expenseDelta: number;
  qrisDeltaNet: number;
  afterConfirmed: number;
  afterEstimated: number;
  isBankBatch: boolean;
  isQrisBatch: boolean;
};

type SkipFilter = "ALL" | "DUPLICATE" | "OTHER";

function formatSigned(value: number) {
  if (value > 0) return `+${rupiah.format(value)}`;
  if (value < 0) return `-${rupiah.format(Math.abs(value))}`;
  return rupiah.format(0);
}

export function ImportPreview({
  batch,
  rows,
  master,
  balanceImpact,
}: {
  batch: Batch;
  rows: Row[];
  master: MasterTree[];
  balanceImpact: BalanceImpact;
}) {
  const router = useRouter();
  const counts = {
    MATCHED: rows.filter((row) => row.status === "MATCHED").length,
    UNMATCHED: rows.filter((row) => row.status === "UNMATCHED").length,
    SKIPPED: rows.filter((row) => row.status === "SKIPPED").length,
    DUPLICATE: rows.filter((row) => row.status === "SKIPPED" && row.isDuplicate).length,
    EXACT: rows.filter((row) => row.status === "SKIPPED" && row.isExactDuplicate).length,
  };
  const [activeStatus, setActiveStatus] = useState<"UNMATCHED" | "MATCHED" | "SKIPPED">(
    counts.EXACT ? "SKIPPED" : counts.UNMATCHED ? "UNMATCHED" : counts.MATCHED ? "MATCHED" : "SKIPPED",
  );
  const [skipFilter, setSkipFilter] = useState<SkipFilter>(counts.EXACT ? "DUPLICATE" : "ALL");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assignmentTarget, setAssignmentTarget] = useState<AssignmentTarget | null>(null);
  const [busyAction, setBusyAction] = useState<"finalize" | "discard" | "skip" | "reopen" | "forceUnique" | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (row.status !== activeStatus) return false;
      if (activeStatus === "SKIPPED") {
        if (skipFilter === "DUPLICATE" && !row.isDuplicate) return false;
        if (skipFilter === "OTHER" && row.isDuplicate) return false;
      }
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        row.description.toLowerCase().includes(q) ||
        row.accountHolder?.toLowerCase().includes(q) ||
        row.accountNumber?.includes(query) ||
        row.skipReason?.toLowerCase().includes(q)
      );
    });
  }, [rows, activeStatus, skipFilter, query]);

  const selectedRows = rows.filter((row) => selectedIds.includes(row.id));
  const mixedDirections = selectedRows.some((row) => row.direction !== selectedRows[0]?.direction);
  const selectedAreSkipped = selectedRows.length > 0 && selectedRows.every((row) => row.status === "SKIPPED");
  const selectedAreExact = selectedRows.length > 0 && selectedRows.every((row) => row.isExactDuplicate);

  function badgeClass(status: "UNMATCHED" | "MATCHED" | "SKIPPED") {
    if (status === "UNMATCHED") return "badge-warning";
    if (status === "SKIPPED") return "badge-muted";
    return "badge-ok";
  }

  function toggleRow(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    const visibleIds = visibleRows.map((row) => row.id);
    if (visibleIds.every((id) => selectedIds.includes(id))) setSelectedIds((current) => current.filter((id) => !visibleIds.includes(id)));
    else setSelectedIds((current) => [...new Set([...current, ...visibleIds])]);
  }

  async function runBulkAction(action: "skip" | "reopen" | "forceUnique", ids = selectedIds) {
    if (!ids.length) return;
    setBusyAction(action);
    if (ids.length === 1) setBusyRowId(ids[0]);
    const response = await fetch("/api/transactions/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(payload.error || "Aksi bulk gagal.");
      setBusyAction(null);
      setBusyRowId(null);
      return;
    }
    setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    setBusyAction(null);
    setBusyRowId(null);
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
        <div title="Baris exact-duplikat di tab Dilewati (bisa dipaksa unik)"><strong>{batch.duplicateRows}</strong><small>duplikat exact</small></div>
      </div>
      {(batch.duplicateRows > 0 || counts.DUPLICATE > 0) && (
        <div className="import-duplicate-note">
          <TriangleAlert size={16} />
          <div>
            <strong>Tentang angka duplikat · file ≈ {batch.importedRows} baris (semua tampil di tabel)</strong>
            <small>
              {counts.EXACT > 0 && (
                <>{counts.EXACT} baris <b>exact</b> (isi sama persis dengan yang sudah di buku, atau dobel di file). Lihat di <b>Dilewati → Duplikat</b>. Kalau yakin unik, klik <b>Paksa unik</b> agar ikut di-upload.</>
              )}
              {counts.EXACT > 0 && counts.DUPLICATE > counts.EXACT && " · "}
              {counts.DUPLICATE > counts.EXACT && (
                <>{counts.DUPLICATE - counts.EXACT} baris cocok secara fuzzy dengan sumber lain. Bisa dipindah ke Perlu ditinjau jika bukan duplikat.</>
              )}
              {counts.EXACT === 0 && counts.DUPLICATE > 0 && (
                <>{counts.DUPLICATE} baris di tab Dilewati cocok dengan transaksi di buku. Filter Duplikat untuk melihat pasangannya.</>
              )}
            </small>
          </div>
        </div>
      )}
    </section>

    <section className="transaction-toolbar">
      <div className="status-tabs">
        <button className={activeStatus === "UNMATCHED" ? "selected" : ""} onClick={() => setActiveStatus("UNMATCHED")}>Perlu ditinjau <b className={badgeClass("UNMATCHED")}>{counts.UNMATCHED}</b></button>
        <button className={activeStatus === "MATCHED" ? "selected" : ""} onClick={() => setActiveStatus("MATCHED")}>Sudah cocok <b className={badgeClass("MATCHED")}>{counts.MATCHED}</b></button>
        <button className={activeStatus === "SKIPPED" ? "selected" : ""} onClick={() => setActiveStatus("SKIPPED")}>Dilewati <b className={badgeClass("SKIPPED")}>{counts.SKIPPED}</b></button>
      </div>
      <form className="search-box" onSubmit={(event) => event.preventDefault()}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari deskripsi atau rekening..." /></form>
    </section>

    <section className="panel import-balance-impact">
      <div className="import-balance-impact-head">
        <span className="eyebrow">ESTIMASI SALDO REKENING INI</span>
        <strong>{balanceImpact.accountLabel}</strong>
        <small>
          {balanceImpact.accountNumber ? `Rek. ${balanceImpact.accountNumber}` : "Nomor rekening belum terbaca"}
          {" · "}hanya rekening batch ini, bukan total semua rekening
        </small>
      </div>
      <div className="import-balance-impact-grid">
        <div>
          <small>Saldo sekarang</small>
          <strong>{rupiah.format(balanceImpact.currentConfirmed)}</strong>
        </div>
        <div>
          <small>Masuk dari file</small>
          <strong className="money-in">+{rupiah.format(balanceImpact.incomeDelta)}</strong>
        </div>
        <div>
          <small>Keluar dari file</small>
          <strong className="money-out">-{rupiah.format(balanceImpact.expenseDelta)}</strong>
        </div>
        <div>
          <small>Neto file</small>
          <strong className={balanceImpact.bankDelta >= 0 ? "money-in" : "money-out"}>{formatSigned(balanceImpact.bankDelta)}</strong>
        </div>
        {balanceImpact.isQrisBatch && (
          <div>
            <small>Estimasi QRIS (netto)</small>
            <strong className="money-fee">{formatSigned(balanceImpact.qrisDeltaNet)}</strong>
          </div>
        )}
        <div>
          <small>Saldo setelah apply</small>
          <strong>{rupiah.format(balanceImpact.afterConfirmed)}</strong>
        </div>
      </div>
      <p className="import-balance-impact-note">
        {balanceImpact.isBankBatch
          ? "Fokus rekening yang di-upload. Skip biasa tetap menggerakkan saldo; duplikat exact yang masih di-skip dibuang saat apply."
          : balanceImpact.isQrisBatch
            ? "QRIS dilewati tidak menambah estimasi. Saldo bank rekening ini baru berubah saat pencairan masuk mutasi bank."
            : "Angka dihitung hanya untuk rekening batch ini."}
        {" "}
        {compactRupiah.format(balanceImpact.currentConfirmed)} → {compactRupiah.format(balanceImpact.afterConfirmed)}
        {balanceImpact.openingBalance !== 0 ? ` · saldo awal ${rupiah.format(balanceImpact.openingBalance)}` : ""}.
      </p>
    </section>

    {activeStatus === "SKIPPED" && (
      <div className="batch-filter-tabs import-skip-filters" role="tablist">
        <button className={skipFilter === "ALL" ? "selected" : ""} onClick={() => setSkipFilter("ALL")}>
          Semua skip <b className={skipFilter === "ALL" ? "badge-ok" : "badge-muted"}>{counts.SKIPPED}</b>
        </button>
        <button className={skipFilter === "DUPLICATE" ? "selected" : ""} onClick={() => setSkipFilter("DUPLICATE")}>
          Duplikat <b className={skipFilter === "DUPLICATE" ? "badge-ok" : "badge-muted"}>{counts.DUPLICATE}</b>
        </button>
        <button className={skipFilter === "OTHER" ? "selected" : ""} onClick={() => setSkipFilter("OTHER")}>
          Skip lain <b className={skipFilter === "OTHER" ? "badge-ok" : "badge-muted"}>{counts.SKIPPED - counts.DUPLICATE}</b>
        </button>
      </div>
    )}

    {selectedIds.length > 0 && <section className="panel bulk-bar">
      <div>
        <strong>{selectedIds.length} transaksi dipilih</strong>
        <small>
          {selectedAreExact
            ? "Baris exact-duplikat: paksa unik agar ikut di-upload (fingerprint diganti)."
            : selectedAreSkipped
            ? "Pindahkan ke Perlu ditinjau kalau yakin bukan duplikat / tidak perlu di-skip."
            : mixedDirections
              ? "Pilih transaksi dengan arah yang sama untuk bulk assign."
              : selectedRows[0]?.direction === "IN"
                ? "Siap assign ke jenis pemasukan yang sama."
                : "Siap assign ke kementerian dan event yang sama."}
        </small>
      </div>
      <div className="bulk-bar-actions">
        {!selectedAreSkipped && (
          <button className="button button-dark" disabled={mixedDirections || busyAction !== null} onClick={() => setAssignmentTarget({ ids: selectedIds, direction: selectedRows[0]!.direction, date: selectedRows[0]!.date, description: `${selectedIds.length} transaksi terpilih`, amount: selectedRows[0]!.amount, accountHolder: selectedRows[0]!.accountHolder, accountNumber: selectedRows[0]!.accountNumber })}><ChevronRight size={17} /> Assign terpilih</button>
        )}
        {!selectedAreSkipped && (
          <button className="button" disabled={busyAction !== null} onClick={() => runBulkAction("skip")}>{busyAction === "skip" ? <LoaderCircle className="spin" size={17} /> : <X size={17} />} Lewati</button>
        )}
        <button className="button" disabled={busyAction !== null} onClick={() => runBulkAction("reopen")}>
          {busyAction === "reopen" || busyAction === "forceUnique" ? <LoaderCircle className="spin" size={17} /> : <Undo2 size={17} />}
          {selectedAreExact ? "Paksa unik & tinjau" : selectedAreSkipped ? "Pindah ke Perlu ditinjau" : "Buka lagi"}
        </button>
      </div>
    </section>}

    <section className="panel table-panel">
      {visibleRows.length ? <div className="responsive-table"><table className="responsive-import-table"><thead><tr><th><input type="checkbox" checked={visibleRows.length > 0 && visibleRows.every((row) => selectedIds.includes(row.id))} onChange={toggleAllVisible} /></th><th>Tanggal & sumber</th><th>Rekening</th><th>Deskripsi</th><th>Arah</th><th>Nominal</th><th>Assignment</th><th /></tr></thead><tbody>
        {visibleRows.map((row) => <tr key={row.id} className={row.isDuplicate ? "row-duplicate" : undefined}>
          <td data-label="Pilih"><input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} /></td>
          <td data-label="Tanggal & sumber">
            <strong>{dateId.format(new Date(row.date))}</strong>
            <small>{row.source.replaceAll("_", " ")}</small>
            {row.isExactDuplicate && <span className="duplicate-badge" title="Isi baris sama persis (fingerprint) dengan yang sudah di buku"><TriangleAlert size={13} /> Exact</span>}
            {row.isDuplicate && !row.isExactDuplicate && <span className="duplicate-badge" title="Sistem menganggap baris ini sama dengan transaksi di buku"><TriangleAlert size={13} /> Duplikat</span>}
          </td>
          <td data-label="Rekening"><strong>{row.accountHolder || "Belum terbaca"}</strong><small>{row.accountNumber || "Tanpa nomor rekening"}</small></td>
          <td className="description-cell" data-label="Deskripsi">
            {row.description}
            {row.skipReason && !row.isDuplicate && <small>{row.skipReason}</small>}
            {row.isDuplicate && row.duplicateOf && !("missing" in row.duplicateOf && row.duplicateOf.missing) && (
              <div className="duplicate-of-card">
                <span className="duplicate-of-label">{row.isExactDuplicate ? "Exact sama dengan baris di buku:" : "Cocok dengan baris di buku:"}</span>
                <strong>{dateId.format(new Date(row.duplicateOf.date))} · {row.duplicateOf.source.replaceAll("_", " ")}</strong>
                <small>{row.duplicateOf.description}</small>
                <small>
                  {row.duplicateOf.accountHolder || "—"}
                  {row.duplicateOf.accountNumber ? ` · ${row.duplicateOf.accountNumber}` : ""}
                  {" · "}
                  {row.duplicateOf.direction === "IN" ? "Masuk" : "Keluar"} {rupiah.format(row.duplicateOf.amount)}
                </small>
                <Link className="duplicate-of-link" href={`/transactions?q=${encodeURIComponent(row.duplicateOf.description.slice(0, 40))}`}>
                  Lihat di transaksi <ChevronRight size={12} />
                </Link>
                {row.isExactDuplicate && (
                  <button
                    type="button"
                    className="button button-primary force-unique-btn"
                    disabled={busyAction !== null}
                    onClick={() => void runBulkAction("forceUnique", [row.id])}
                  >
                    {busyRowId === row.id ? <LoaderCircle className="spin" size={14} /> : <Undo2 size={14} />}
                    Paksa unik (ikut upload)
                  </button>
                )}
              </div>
            )}
            {row.isDuplicate && row.duplicateOf && "missing" in row.duplicateOf && row.duplicateOf.missing && (
              <div className="duplicate-of-card">
                <span className="duplicate-of-label">{row.isExactDuplicate ? "Duplikat exact" : "Ditandai duplikat"}</span>
                <small>
                  {row.duplicateOf.id === "same-file"
                    ? "Baris identik dengan baris lain di file yang sama. Paksa unik hanya jika yakin ini transaksi berbeda."
                    : `Transaksi asli (${row.duplicateOf.id}) sudah tidak ada di buku. Aman dipaksa unik / dipindah ke Perlu ditinjau.`}
                </small>
                {row.isExactDuplicate && (
                  <button
                    type="button"
                    className="button button-primary force-unique-btn"
                    disabled={busyAction !== null}
                    onClick={() => void runBulkAction("forceUnique", [row.id])}
                  >
                    {busyRowId === row.id ? <LoaderCircle className="spin" size={14} /> : <Undo2 size={14} />}
                    Paksa unik (ikut upload)
                  </button>
                )}
              </div>
            )}
          </td>
          <td data-label="Arah"><span className={`direction-pill ${row.direction === "IN" ? "pill-in" : "pill-out"}`}>{row.direction === "IN" ? "Masuk" : "Keluar"}</span></td>
          <td className={row.direction === "IN" ? "money-in" : "money-out"} data-label="Nominal"><strong>{rupiah.format(row.amount)}</strong></td>
          <td data-label="Assignment">{row.event ? <div className="assignment-summary"><strong>{row.event}</strong><small>{row.ministry}{row.incomeType ? ` · ${row.incomeType}` : row.expenseType ? ` · ${row.expenseType}` : ""}</small></div> : <span className="muted">Belum di-assign</span>}</td>
          <td className="row-actions" data-label="Aksi">
            {row.status === "SKIPPED" ? (
              <>
                {!row.isExactDuplicate && (
                  <button className="icon-button action-assign" title="Assign" onClick={() => setAssignmentTarget({ ids: [row.id], direction: row.direction, date: row.date, description: row.description, amount: row.amount, accountHolder: row.accountHolder, accountNumber: row.accountNumber })}><ChevronRight /></button>
                )}
                <button
                  className="icon-button"
                  title={row.isExactDuplicate ? "Paksa unik & pindah ke Perlu ditinjau" : row.isDuplicate ? "Pindah ke Perlu ditinjau (bukan duplikat)" : "Kembalikan ke Perlu ditinjau"}
                  disabled={busyAction !== null}
                  onClick={() => void runBulkAction(row.isExactDuplicate ? "forceUnique" : "reopen", [row.id])}
                >
                  {busyRowId === row.id ? <LoaderCircle className="spin" /> : <Undo2 />}
                </button>
              </>
            ) : (
              <>
                <button className="icon-button action-assign" title="Assign" onClick={() => setAssignmentTarget({ ids: [row.id], direction: row.direction, date: row.date, description: row.description, amount: row.amount, accountHolder: row.accountHolder, accountNumber: row.accountNumber })}><ChevronRight /></button>
                <button className="icon-button" title="Lewati" onClick={() => void runBulkAction("skip", [row.id])}><X /></button>
                {row.status === "MATCHED" && <span className="verified"><Check /></span>}
              </>
            )}
          </td>
        </tr>)}
      </tbody></table></div> : <div className="empty-state"><span>✓</span><p>Tidak ada transaksi pada bagian ini.</p></div>}
    </section>

    {assignmentTarget && <TransactionAssignmentModal target={assignmentTarget} master={master} onClose={() => setAssignmentTarget(null)} />}
  </>;
}
