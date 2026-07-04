"use client";

import { useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { dateId, rupiah } from "@/lib/format";

export type AssignmentTarget = {
  ids: string[];
  direction: "IN" | "OUT";
  date: string;
  description: string;
  amount: number;
  accountHolder?: string | null;
  accountNumber?: string | null;
};

export type MasterTree = {
  id: string;
  code: number;
  name: string;
  events: {
    id: string;
    name: string;
    incomeTypes: {
      id: string;
      name: string;
      uniqueCode: string | null;
    }[];
  }[];
};

export function TransactionAssignmentModal({ target, master, onClose }: { target: AssignmentTarget; master: MasterTree[]; onClose: () => void }) {
  const router = useRouter();
  const [ministryId, setMinistryId] = useState("");
  const [eventId, setEventId] = useState("");
  const [incomeTypeId, setIncomeTypeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ministry = master.find((item) => item.id === ministryId);
  const isBulk = target.ids.length > 1;

  async function save() {
    setLoading(true);
    setError("");
    const payload = target.direction === "IN"
      ? { action: "assign", incomeTypeId }
      : { action: "assign", ministryId, eventId };
    const response = await fetch(isBulk ? "/api/transactions/bulk" : `/api/transactions/${target.ids[0]}`, {
      method: isBulk ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isBulk ? { ids: target.ids, ...payload } : payload),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || "Assignment gagal.");
      setLoading(false);
      return;
    }
    onClose();
    router.refresh();
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
    <button className="modal-close" onClick={onClose}><X /></button>
    <div className="eyebrow">ASSIGN TRANSAKSI</div>
    <h2>{target.direction === "IN" ? "Tentukan jenis pemasukan" : "Tentukan tujuan pengeluaran"}</h2>
    <div className="modal-amount">
      <span>{isBulk ? `${target.ids.length} transaksi dipilih` : dateId.format(new Date(target.date))}</span>
      <strong>{isBulk ? "Bulk assign" : rupiah.format(target.amount)}</strong>
    </div>
    <p className="modal-description">
      {isBulk ? `${target.ids.length} transaksi akan memakai assignment yang sama.` : target.description}
      {(target.accountHolder || target.accountNumber) && ` · ${(target.accountHolder || "Rekening BCA")} ${target.accountNumber ? `(${target.accountNumber})` : ""}`}
    </p>
    {target.direction === "IN" ? <label>Jenis pemasukan<select value={incomeTypeId} onChange={(e) => setIncomeTypeId(e.target.value)}><option value="">Pilih jenis pemasukan...</option>{master.flatMap((m) => m.events.flatMap((ev) => ev.incomeTypes.map((type) => <option key={type.id} value={type.id}>{m.code} · {m.name} / {ev.name} / {type.name} ({type.uniqueCode || "tanpa kode"})</option>)))}</select></label> : <>
      <label>Kementerian<select value={ministryId} onChange={(e) => { setMinistryId(e.target.value); setEventId(""); }}><option value="">Pilih kementerian...</option>{master.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
      <label>Event<select value={eventId} onChange={(e) => setEventId(e.target.value)} disabled={!ministry}><option value="">Pilih event...</option>{ministry?.events.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </>}
    {error && <div className="form-error">{error}</div>}
    <button className="button button-primary button-wide" disabled={loading || (target.direction === "IN" ? !incomeTypeId : !ministryId || !eventId)} onClick={save}>{loading ? <LoaderCircle className="spin" /> : <Check />}{isBulk ? ` Terapkan ke ${target.ids.length} transaksi` : " Simpan assignment"}</button>
  </div></div>;
}
