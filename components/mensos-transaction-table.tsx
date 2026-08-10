"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { dateId, rupiah } from "@/lib/format";

export type MensosTxRow = {
  id: string;
  date: string;
  description: string;
  direction: "IN" | "OUT";
  amount: number;
  source: string;
  incomeTypeName: string | null;
  expenseTypeName: string | null;
};

const PAGE_SIZE = 10;

export function MensosTransactionTable({ transactions }: { transactions: MensosTxRow[] }) {
  const [page, setPage] = useState(0);
  const [dirFilter, setDirFilter] = useState<"ALL" | "IN" | "OUT">("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const allTypes = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      const name = t.direction === "IN" ? t.incomeTypeName : t.expenseTypeName;
      if (name) set.add(name);
    }
    return [...set].sort();
  }, [transactions]);

  const filtered = useMemo(() => {
    let result = transactions;
    if (dirFilter !== "ALL") result = result.filter((t) => t.direction === dirFilter);
    if (typeFilter !== "ALL") result = result.filter((t) => {
      const name = t.direction === "IN" ? t.incomeTypeName : t.expenseTypeName;
      return name === typeFilter;
    });
    return result;
  }, [transactions, dirFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function resetPage() { setPage(0); }

  if (transactions.length === 0) return null;

  return (
    <div className="mensos-tx-section">
      <div className="mensos-tx-filters">
        <Filter size={15} />
        <label>
          Arah
          <select
            value={dirFilter}
            onChange={(e) => { setDirFilter(e.target.value as "ALL" | "IN" | "OUT"); resetPage(); }}
          >
            <option value="ALL">Semua</option>
            <option value="IN">Masuk</option>
            <option value="OUT">Keluar</option>
          </select>
        </label>
        <label>
          Jenis
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); resetPage(); }}
          >
            <option value="ALL">Semua</option>
            {allTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <span className="mensos-tx-count">{filtered.length} transaksi</span>
      </div>

      <div className="responsive-table">
        <table className="report-table responsive-report-table">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Keterangan</th>
              <th>Jenis</th>
              <th>Arah</th>
              <th>Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((t) => (
              <tr key={t.id}>
                <td data-label="Tanggal">{dateId.format(new Date(t.date))}</td>
                <td data-label="Keterangan">{t.description}</td>
                <td data-label="Jenis">{t.direction === "IN" ? (t.incomeTypeName || "—") : (t.expenseTypeName || "—")}</td>
                <td data-label="Arah"><span className={t.direction === "IN" ? "money-in" : "money-out"}>{t.direction === "IN" ? "Masuk" : "Keluar"}</span></td>
                <td data-label="Jumlah" className={t.direction === "IN" ? "money-in" : "money-out"}>{t.direction === "IN" ? "+" : "-"}{rupiah.format(t.amount)}</td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", opacity: 0.6 }}>Tidak ada transaksi sesuai filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mensos-tx-pagination">
          <button className="button button-dark" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft size={16} /> Sebelumnya</button>
          <span>Halaman {safePage + 1} / {totalPages}</span>
          <button className="button button-dark" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>Berikutnya <ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}
