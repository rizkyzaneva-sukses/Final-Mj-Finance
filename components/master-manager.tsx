"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarDays, CircleDollarSign, LoaderCircle, Plus } from "lucide-react";

type IncomeType = { id: string; name: string; uniqueCode: string | null; active: boolean; eventId: string };
type Event = { id: string; name: string; category: string | null; active: boolean; ministryId: string; incomeTypes: IncomeType[] };
type Ministry = { id: string; code: number; name: string; active: boolean; events: Event[] };

export function MasterManager({ ministries }: { ministries: Ministry[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"ministry" | "event" | "income">("income");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const events = ministries.flatMap((ministry) => ministry.events.map((event) => ({ ...event, ministry })));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    const response = await fetch("/api/master", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity: tab, ...form }) });
    const payload = await response.json();
    if (!response.ok) setError(payload.error || "Data gagal disimpan.");
    else { setForm({}); router.refresh(); }
    setLoading(false);
  }

  return <div className="master-layout">
    <section className="panel master-form-panel">
      <div className="master-tabs">
        <button className={tab === "ministry" ? "selected" : ""} onClick={() => { setTab("ministry"); setForm({}); }}><Building2 /> Kementerian</button>
        <button className={tab === "event" ? "selected" : ""} onClick={() => { setTab("event"); setForm({}); }}><CalendarDays /> Event</button>
        <button className={tab === "income" ? "selected" : ""} onClick={() => { setTab("income"); setForm({}); }}><CircleDollarSign /> Jenis pemasukan</button>
      </div>
      <form className="master-form" onSubmit={submit}>
        <div><span className="eyebrow">TAMBAH BARU</span><h2>{tab === "ministry" ? "Kementerian" : tab === "event" ? "Event kegiatan" : "Jenis pemasukan"}</h2></div>
        {tab === "ministry" && <><label>Kode kementerian<input type="number" min="0" value={form.code || ""} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Contoh: 1" required /></label><label>Nama kementerian<input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kementerian SDM" required /></label></>}
        {tab === "event" && <><label>Kementerian<select value={form.ministryId || ""} onChange={(e) => setForm({ ...form, ministryId: e.target.value })} required><option value="">Pilih kementerian...</option>{ministries.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label><label>Nama event<input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama kegiatan" required /></label><label>Kategori (opsional)<input value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Contoh: Rutin" /></label></>}
        {tab === "income" && <><label>Event<select value={form.eventId || ""} onChange={(e) => setForm({ ...form, eventId: e.target.value })} required><option value="">Pilih event...</option>{events.map((row) => <option key={row.id} value={row.id}>{row.ministry.code} · {row.ministry.name} / {row.name}</option>)}</select></label><label>Nama jenis pemasukan<input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contoh: Sponsor" required /></label><label>Kode unik akhir nominal<input inputMode="numeric" pattern="0|[1-9][0-9]*" maxLength={8} value={form.uniqueCode || ""} onChange={(e) => setForm({ ...form, uniqueCode: e.target.value.replace(/\D/g, "") })} placeholder="Contoh: 121" required /><small>Tanpa nol di depan. Rp100.121 akan cocok dengan kode 121.</small></label></>}
        {error && <div className="form-error">{error}</div>}
        <button className="button button-primary button-wide" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <Plus />} Tambahkan</button>
      </form>
    </section>
    <section className="panel master-list-panel">
      <div className="panel-title"><div><span className="eyebrow">STRUKTUR AKTIF</span><h2>Kementerian → Event → Pemasukan</h2></div></div>
      <div className="master-tree">{ministries.map((ministry) => <details key={ministry.id} open={ministry.events.some((event) => event.incomeTypes.length)}><summary><span className="ministry-code">{ministry.code}</span><strong>{ministry.name}</strong><small>{ministry.events.length} event</small></summary><div className="event-tree">{ministry.events.map((event) => <div className="event-branch" key={event.id}><div className="event-name"><CalendarDays size={16} /><strong>{event.name}</strong>{event.category && <span>{event.category}</span>}</div>{event.incomeTypes.length ? <div className="income-chips">{event.incomeTypes.map((type) => <span key={type.id}><b>{type.uniqueCode || "—"}</b>{type.name}</span>)}</div> : <small className="no-code">Belum memiliki jenis pemasukan</small>}</div>)}</div></details>)}</div>
    </section>
  </div>;
}
