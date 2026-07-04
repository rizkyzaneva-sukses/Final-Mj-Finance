"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CircleDollarSign,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

type IncomeType = { id: string; name: string; uniqueCode: string | null; active: boolean; eventId: string };
type Event = { id: string; name: string; category: string | null; active: boolean; ministryId: string; incomeTypes: IncomeType[] };
type Ministry = { id: string; code: number; name: string; active: boolean; events: Event[] };

type EditState =
  | { entity: "ministry"; id: string; code: string; name: string }
  | { entity: "event"; id: string; ministryId: string; name: string; category: string }
  | { entity: "income"; id: string; eventId: string; name: string; uniqueCode: string }
  | null;

type MasterRow =
  | {
      key: string;
      entity: "ministry";
      id: string;
      level: "Kementerian";
      ministryId: string;
      ministryCode: number;
      ministryName: string;
      eventId: null;
      eventName: null;
      category: null;
      incomeName: null;
      uniqueCode: null;
      note: string;
    }
  | {
      key: string;
      entity: "event";
      id: string;
      level: "Event";
      ministryId: string;
      ministryCode: number;
      ministryName: string;
      eventId: string;
      eventName: string;
      category: string | null;
      incomeName: null;
      uniqueCode: null;
      note: string;
    }
  | {
      key: string;
      entity: "income";
      id: string;
      level: "Pemasukan";
      ministryId: string;
      ministryCode: number;
      ministryName: string;
      eventId: string;
      eventName: string;
      category: string | null;
      incomeName: string;
      uniqueCode: string | null;
      note: string;
    };

export function MasterManager({ ministries }: { ministries: Ministry[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"ministry" | "event" | "income">("income");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const [resetText, setResetText] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState<EditState>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const events = ministries.flatMap((ministry) => ministry.events.map((event) => ({ ...event, ministry })));

  const rows = useMemo<MasterRow[]>(() => {
    const result: MasterRow[] = [];
    for (const ministry of ministries) {
      result.push({
        key: `ministry-${ministry.id}`,
        entity: "ministry",
        id: ministry.id,
        level: "Kementerian",
        ministryId: ministry.id,
        ministryCode: ministry.code,
        ministryName: ministry.name,
        eventId: null,
        eventName: null,
        category: null,
        incomeName: null,
        uniqueCode: null,
        note: `${ministry.events.length} event`,
      });

      for (const event of ministry.events) {
        result.push({
          key: `event-${event.id}`,
          entity: "event",
          id: event.id,
          level: "Event",
          ministryId: ministry.id,
          ministryCode: ministry.code,
          ministryName: ministry.name,
          eventId: event.id,
          eventName: event.name,
          category: event.category,
          incomeName: null,
          uniqueCode: null,
          note: event.incomeTypes.length ? `${event.incomeTypes.length} jenis pemasukan` : "Belum ada jenis pemasukan",
        });

        for (const income of event.incomeTypes) {
          result.push({
            key: `income-${income.id}`,
            entity: "income",
            id: income.id,
            level: "Pemasukan",
            ministryId: ministry.id,
            ministryCode: ministry.code,
            ministryName: ministry.name,
            eventId: event.id,
            eventName: event.name,
            category: event.category,
            incomeName: income.name,
            uniqueCode: income.uniqueCode,
            note: "Siap untuk auto-match",
          });
        }
      }
    }
    return result;
  }, [ministries]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/master", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: tab, ...form }),
    });
    const payload = await response.json();
    if (!response.ok) setError(payload.error || "Data gagal disimpan.");
    else {
      setForm({});
      router.refresh();
    }
    setLoading(false);
  }

  async function resetAllData() {
    setResetLoading(true);
    setResetMessage(null);
    const response = await fetch("/api/master/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: resetText }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setResetMessage({ type: "error", text: payload.error || "Reset data gagal." });
      setResetLoading(false);
      return;
    }
    setResetText("");
    setResetMessage({ type: "ok", text: payload.message || "Semua data berhasil direset." });
    router.refresh();
    setResetLoading(false);
  }

  function startEdit(row: MasterRow) {
    if (row.entity === "ministry") {
      setEditing({ entity: "ministry", id: row.id, code: String(row.ministryCode), name: row.ministryName });
      return;
    }
    if (row.entity === "event") {
      setEditing({
        entity: "event",
        id: row.id,
        ministryId: row.ministryId,
        name: row.eventName || "",
        category: row.category || "",
      });
      return;
    }
    setEditing({
      entity: "income",
      id: row.id,
      eventId: row.eventId,
      name: row.incomeName || "",
      uniqueCode: row.uniqueCode || "",
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setEditLoading(true);
    setEditError("");
    const payload = editing.entity === "ministry"
      ? { entity: "ministry", id: editing.id, code: editing.code, name: editing.name }
      : editing.entity === "event"
        ? { entity: "event", id: editing.id, ministryId: editing.ministryId, name: editing.name, category: editing.category }
        : { entity: "income", id: editing.id, eventId: editing.eventId, name: editing.name, uniqueCode: editing.uniqueCode };
    const response = await fetch("/api/master", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setEditError(body.error || "Perubahan gagal disimpan.");
      setEditLoading(false);
      return;
    }
    setEditing(null);
    setEditLoading(false);
    router.refresh();
  }

  async function removeRow(row: MasterRow) {
    const label = row.entity === "ministry" ? row.ministryName : row.entity === "event" ? row.eventName : row.incomeName;
    if (!window.confirm(`Hapus ${row.level.toLowerCase()} "${label}"?`)) return;
    setActionId(row.id);
    const response = await fetch("/api/master", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: row.entity, id: row.id }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) alert(body.error || "Data gagal dihapus.");
    setActionId(null);
    router.refresh();
  }

  const editableEvents = editing?.entity === "income"
    ? events
    : [];

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
      <div className="reset-box">
        <div className="reset-box-header">
          <span className="reset-icon"><AlertTriangle size={16} /></span>
          <div>
            <strong>Reset semua data percobaan</strong>
            <small>Transaksi, batch impor, event, jenis pemasukan, dan kementerian akan dibersihkan lalu master default dipasang lagi.</small>
          </div>
        </div>
        <label>Ketik <b>RESET SEMUA DATA</b> untuk konfirmasi
          <input value={resetText} onChange={(e) => setResetText(e.target.value)} placeholder="RESET SEMUA DATA" />
        </label>
        {resetMessage && <div className={resetMessage.type === "error" ? "form-error" : "form-success"}>{resetMessage.text}</div>}
        <button className="button reset-button button-wide" disabled={resetLoading || resetText.trim().toUpperCase() !== "RESET SEMUA DATA"} onClick={resetAllData}>
          {resetLoading ? <LoaderCircle className="spin" /> : <RotateCcw />}
          Reset semua data
        </button>
      </div>
    </section>
    <section className="panel master-list-panel table-panel">
      <div className="panel-title">
        <div>
          <span className="eyebrow">STRUKTUR AKTIF</span>
          <h2>Mapping master dalam tabel</h2>
        </div>
      </div>
      <div className="responsive-table">
        <table className="master-table">
          <thead>
            <tr>
              <th>Level</th>
              <th>Kode</th>
              <th>Kementerian</th>
              <th>Event</th>
              <th>Kategori</th>
              <th>Jenis pemasukan</th>
              <th>Kode unik</th>
              <th>Catatan</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => <tr key={row.key}>
              <td><span className={`level-pill level-${row.entity}`}>{row.level}</span></td>
              <td><span className="ministry-code">{row.ministryCode}</span></td>
              <td><strong>{row.ministryName}</strong></td>
              <td>{row.eventName || <span className="muted">—</span>}</td>
              <td>{row.category || <span className="muted">—</span>}</td>
              <td>{row.incomeName || <span className="muted">—</span>}</td>
              <td>{row.uniqueCode ? <span className="code-chip">{row.uniqueCode}</span> : <span className="muted">—</span>}</td>
              <td><small>{row.note}</small></td>
              <td className="row-actions">
                <button className="icon-button" title="Edit" onClick={() => startEdit(row)}><Pencil /></button>
                <button className="icon-button" title="Hapus" disabled={actionId === row.id} onClick={() => void removeRow(row)}>{actionId === row.id ? <LoaderCircle className="spin" /> : <Trash2 />}</button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
    {editing && <div className="modal-backdrop" onMouseDown={() => setEditing(null)}><div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
      <button className="modal-close" onClick={() => setEditing(null)}><X /></button>
      <div className="eyebrow">EDIT MASTER</div>
      <h2>{editing.entity === "ministry" ? "Ubah kementerian" : editing.entity === "event" ? "Ubah event" : "Ubah jenis pemasukan"}</h2>
      {editing.entity === "ministry" && <>
        <label>Kode kementerian<input type="number" min="0" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></label>
        <label>Nama kementerian<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
      </>}
      {editing.entity === "event" && <>
        <label>Kementerian<select value={editing.ministryId} onChange={(e) => setEditing({ ...editing, ministryId: e.target.value })}><option value="">Pilih kementerian...</option>{ministries.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
        <label>Nama event<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
        <label>Kategori (opsional)<input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></label>
      </>}
      {editing.entity === "income" && <>
        <label>Event<select value={editing.eventId} onChange={(e) => setEditing({ ...editing, eventId: e.target.value })}><option value="">Pilih event...</option>{editableEvents.map((row) => <option key={row.id} value={row.id}>{row.ministry.code} · {row.ministry.name} / {row.name}</option>)}</select></label>
        <label>Nama jenis pemasukan<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
        <label>Kode unik<input inputMode="numeric" maxLength={8} value={editing.uniqueCode} onChange={(e) => setEditing({ ...editing, uniqueCode: e.target.value.replace(/\D/g, "") })} /></label>
      </>}
      {editError && <div className="form-error">{editError}</div>}
      <button className="button button-primary button-wide" disabled={editLoading} onClick={() => void saveEdit()}>{editLoading ? <LoaderCircle className="spin" /> : <Pencil />} Simpan perubahan</button>
    </div></div>}
  </div>;
}
