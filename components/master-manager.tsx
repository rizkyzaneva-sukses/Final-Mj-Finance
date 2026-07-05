"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CircleDollarSign,
  LoaderCircle,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";

type IncomeType = { id: string; name: string; uniqueCode: string | null; incomeMasterId: string | null; incomeMasterName: string; active: boolean; eventId: string };
type Event = { id: string; name: string; category: string | null; active: boolean; ministryId: string; incomeTypes: IncomeType[] };
type Ministry = { id: string; code: number; name: string; active: boolean; events: Event[] };
type IncomeMaster = { id: string; name: string; active: boolean };
type ExpenseType = { id: string; name: string; active: boolean };

type Tab = "ministry" | "event" | "incomeMapping" | "incomeMaster" | "expenseType";

type MappingRow =
  | {
      key: string;
      entity: "ministry";
      id: string;
      ministryId: string;
      ministryCode: number;
      ministryName: string;
      eventId: null;
      eventName: null;
      category: null;
      incomeMappingId: null;
      incomeMasterId: null;
      incomeMasterName: null;
      uniqueCode: null;
      note: string;
    }
  | {
      key: string;
      entity: "event";
      id: string;
      ministryId: string;
      ministryCode: number;
      ministryName: string;
      eventId: string;
      eventName: string;
      category: string | null;
      incomeMappingId: null;
      incomeMasterId: null;
      incomeMasterName: null;
      uniqueCode: null;
      note: string;
    }
  | {
      key: string;
      entity: "income";
      id: string;
      ministryId: string;
      ministryCode: number;
      ministryName: string;
      eventId: string;
      eventName: string;
      category: string | null;
      incomeMappingId: string;
      incomeMasterId: string | null;
      incomeMasterName: string;
      uniqueCode: string | null;
      note: string;
    };

type EditState =
  | { entity: "ministry"; id: string; code: string; name: string }
  | { entity: "event"; id: string; ministryId: string; name: string; category: string }
  | { entity: "income"; id: string; eventId: string; incomeMasterId: string; uniqueCode: string }
  | { entity: "incomeMaster"; id: string; name: string }
  | { entity: "expenseType"; id: string; name: string }
  | null;

export function MasterManager({
  ministries,
  incomeMasters,
  expenseTypes,
}: {
  ministries: Ministry[];
  incomeMasters: IncomeMaster[];
  expenseTypes: ExpenseType[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("incomeMapping");
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

  useEffect(() => {
    if (!editing) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editing]);

  const mappingGroups = useMemo(() => ministries.map((ministry) => {
    const rows: MappingRow[] = [{
      key: `ministry-${ministry.id}`,
      entity: "ministry",
      id: ministry.id,
      ministryId: ministry.id,
      ministryCode: ministry.code,
      ministryName: ministry.name,
      eventId: null,
      eventName: null,
      category: null,
      incomeMappingId: null,
      incomeMasterId: null,
      incomeMasterName: null,
      uniqueCode: null,
      note: `${ministry.events.length} event`,
    }];

    for (const event of ministry.events) {
      rows.push({
        key: `event-${event.id}`,
        entity: "event",
        id: event.id,
        ministryId: ministry.id,
        ministryCode: ministry.code,
        ministryName: ministry.name,
        eventId: event.id,
        eventName: event.name,
        category: event.category,
        incomeMappingId: null,
        incomeMasterId: null,
        incomeMasterName: null,
        uniqueCode: null,
        note: event.incomeTypes.length ? `${event.incomeTypes.length} mapping pemasukan` : "Belum ada mapping pemasukan",
      });

      for (const income of event.incomeTypes) {
        rows.push({
          key: `income-${income.id}`,
          entity: "income",
          id: income.id,
          ministryId: ministry.id,
          ministryCode: ministry.code,
          ministryName: ministry.name,
          eventId: event.id,
          eventName: event.name,
          category: event.category,
          incomeMappingId: income.id,
          incomeMasterId: income.incomeMasterId,
          incomeMasterName: income.incomeMasterName,
          uniqueCode: income.uniqueCode,
          note: "Siap untuk auto-match",
        });
      }
    }

    return { ministryId: ministry.id, rows };
  }), [ministries]);

  function noteMeta(note: string) {
    if (/siap/i.test(note)) {
      return { short: "Siap", tone: "ready" as const, title: note };
    }
    if (/belum/i.test(note)) {
      return { short: "Belum ada", tone: "empty" as const, title: note };
    }
    return { short: note, tone: "count" as const, title: note };
  }

  function mobileCardTitle(row: MappingRow) {
    if (row.entity === "ministry") return `#${row.ministryCode} ${row.ministryName}`;
    if (row.entity === "event") return row.eventName;
    return row.incomeMasterName;
  }

  function mobileCardMeta(row: MappingRow) {
    if (row.entity === "ministry") return "Kementerian";
    if (row.entity === "event") return `Event · ${row.ministryName}`;
    return `Pemasukan · ${row.eventName}`;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const entity = tab === "incomeMapping" ? "income" : tab;
    const response = await fetch("/api/master", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, ...form }),
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

  function startEdit(row: MappingRow | IncomeMaster | ExpenseType, entity?: "incomeMaster" | "expenseType") {
    if (entity === "incomeMaster" && "name" in row) {
      setEditing({ entity: "incomeMaster", id: row.id, name: row.name });
      return;
    }
    if (entity === "expenseType" && "name" in row) {
      setEditing({ entity: "expenseType", id: row.id, name: row.name });
      return;
    }
    if ("entity" in row && row.entity === "ministry") {
      setEditing({ entity: "ministry", id: row.id, code: String(row.ministryCode), name: row.ministryName });
      return;
    }
    if ("entity" in row && row.entity === "event") {
      setEditing({ entity: "event", id: row.id, ministryId: row.ministryId, name: row.eventName || "", category: row.category || "" });
      return;
    }
    if ("entity" in row && row.entity === "income") {
      setEditing({
        entity: "income",
        id: row.id,
        eventId: row.eventId || "",
        incomeMasterId: row.incomeMasterId || "",
        uniqueCode: row.uniqueCode || "",
      });
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setEditLoading(true);
    setEditError("");
    const payload = editing.entity === "ministry"
      ? { entity: "ministry", id: editing.id, code: editing.code, name: editing.name }
      : editing.entity === "event"
        ? { entity: "event", id: editing.id, ministryId: editing.ministryId, name: editing.name, category: editing.category }
        : editing.entity === "income"
          ? { entity: "income", id: editing.id, eventId: editing.eventId, incomeMasterId: editing.incomeMasterId, uniqueCode: editing.uniqueCode }
          : editing.entity === "incomeMaster"
            ? { entity: "incomeMaster", id: editing.id, name: editing.name }
            : { entity: "expenseType", id: editing.id, name: editing.name };
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

  async function removeEntity(entity: string, id: string, label: string) {
    if (!window.confirm(`Hapus "${label}"?`)) return;
    setActionId(id);
    const response = await fetch("/api/master", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, id }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) alert(body.error || "Data gagal dihapus.");
    setActionId(null);
    router.refresh();
  }

  const editEvents = events;

  return <div className="master-layout">
    <section className="panel master-form-panel">
      <div className="master-tabs master-tabs-five">
        <button className={tab === "ministry" ? "selected" : ""} onClick={() => { setTab("ministry"); setForm({}); }}><Building2 /> Kementerian</button>
        <button className={tab === "event" ? "selected" : ""} onClick={() => { setTab("event"); setForm({}); }}><CalendarDays /> Event</button>
        <button className={tab === "incomeMaster" ? "selected" : ""} onClick={() => { setTab("incomeMaster"); setForm({}); }}><WalletCards /> Master pemasukan</button>
        <button className={tab === "incomeMapping" ? "selected" : ""} onClick={() => { setTab("incomeMapping"); setForm({}); }}><CircleDollarSign /> Mapping event</button>
        <button className={tab === "expenseType" ? "selected" : ""} onClick={() => { setTab("expenseType"); setForm({}); }}><ReceiptText /> Pengeluaran</button>
      </div>
      <form className="master-form" onSubmit={submit}>
        <div>
          <span className="eyebrow">TAMBAH BARU</span>
          <h2>
            {tab === "ministry" ? "Kementerian" :
              tab === "event" ? "Event kegiatan" :
                tab === "incomeMaster" ? "Master jenis pemasukan" :
                  tab === "incomeMapping" ? "Mapping pemasukan event" :
                    "Master jenis pengeluaran"}
          </h2>
        </div>
        {tab === "ministry" && <>
          <label>Kode kementerian<input type="number" min="0" value={form.code || ""} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Contoh: 1" required /></label>
          <label>Nama kementerian<input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kementerian SDM" required /></label>
        </>}
        {tab === "event" && <>
          <label>Kementerian<select value={form.ministryId || ""} onChange={(e) => setForm({ ...form, ministryId: e.target.value })} required><option value="">Pilih kementerian...</option>{ministries.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
          <label>Nama event<input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama kegiatan" required /></label>
          <label>Kategori (opsional)<input value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Contoh: Rutin" /></label>
        </>}
        {tab === "incomeMaster" && <label>Nama master pemasukan<input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contoh: Sponsorship" required /></label>}
        {tab === "incomeMapping" && <>
          <label>Event<select value={form.eventId || ""} onChange={(e) => setForm({ ...form, eventId: e.target.value })} required><option value="">Pilih event...</option>{events.map((row) => <option key={row.id} value={row.id}>{row.ministry.code} · {row.ministry.name} / {row.name}</option>)}</select></label>
          <label>Master pemasukan<select value={form.incomeMasterId || ""} onChange={(e) => setForm({ ...form, incomeMasterId: e.target.value })} required><option value="">Pilih master pemasukan...</option>{incomeMasters.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label>Kode unik akhir nominal<input inputMode="numeric" pattern="0|[1-9][0-9]*" maxLength={8} value={form.uniqueCode || ""} onChange={(e) => setForm({ ...form, uniqueCode: e.target.value.replace(/\D/g, "") })} placeholder="Contoh: 121" required /><small>Tanpa nol di depan. Rp100.121 akan cocok dengan kode 121.</small></label>
        </>}
        {tab === "expenseType" && <label>Nama jenis pengeluaran<input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contoh: Transport & Ongkir" required /></label>}
        {error && <div className="form-error">{error}</div>}
        <button className="button button-primary button-wide" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <Plus />} Tambahkan</button>
      </form>
      <div className="reset-box">
        <div className="reset-box-header">
          <span className="reset-icon"><AlertTriangle size={16} /></span>
          <div>
            <strong>Reset semua data percobaan</strong>
            <small>Transaksi, batch impor, event, jenis pemasukan, jenis pengeluaran, dan kementerian akan dibersihkan lalu master default dipasang lagi.</small>
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
          <h2>Kementerian → Event → Mapping pemasukan</h2>
        </div>
      </div>
      <div className="responsive-table">
        <table className="master-table responsive-master-table">
          <thead>
            <tr>
              <th>Kementerian</th>
              <th>Event</th>
              <th>Master pemasukan</th>
              <th>Kode unik</th>
              <th>Catatan</th>
              <th />
            </tr>
          </thead>
          {mappingGroups.map((group, groupIndex) => (
            <tbody key={group.ministryId} className={`master-group ${groupIndex > 0 ? "group-start" : ""}`}>
              {group.rows.map((row) => {
                const showMinistry = row.entity === "ministry";
                const showEvent = row.entity === "event";
                const note = noteMeta(row.note);
                return <tr key={row.key} className={`master-row row-${row.entity}`}>
                  <td className={`hierarchy-cell hierarchy-${row.entity}`} data-label="Kementerian">
                    <div className="mobile-card-title">
                      <strong>{mobileCardTitle(row)}</strong>
                      <small>{mobileCardMeta(row)}</small>
                    </div>
                    {showMinistry ? <div className="master-ministry-name"><span className="ministry-prefix">#{row.ministryCode}</span><strong>{row.ministryName}</strong></div> : <span className="muted"> </span>}
                  </td>
                  <td className={`hierarchy-cell hierarchy-${row.entity}`} data-label="Event">
                    {showEvent ? <div className="master-event-name">{row.eventName}</div> : <span className="muted"> </span>}
                  </td>
                  <td className={`hierarchy-cell hierarchy-${row.entity}`} data-label="Master pemasukan">
                    {row.entity === "income" ? <div className="master-income-name">{row.incomeMasterName}</div> : <span className="muted"> </span>}
                  </td>
                  <td className="master-code-column" data-label="Kode unik">
                    {row.entity === "income"
                      ? <span className="code-chip code-chip-strong" title={`Kode unik ${row.uniqueCode}`}>{row.uniqueCode}</span>
                      : <span className="code-chip code-chip-muted" title="Belum ada kode unik">—</span>}
                  </td>
                  <td data-label="Catatan">
                    <span className={`status-pill tone-${note.tone}`} title={note.title}>{note.short}</span>
                  </td>
                  <td className="row-actions" data-label="Aksi">
                    <button className="icon-button" title="Edit" onClick={() => startEdit(row)}><Pencil /></button>
                    <button
                      className="icon-button"
                      title="Hapus"
                      disabled={actionId === row.id}
                      onClick={() => void removeEntity(row.entity, row.id, row.entity === "ministry" ? row.ministryName : row.entity === "event" ? row.eventName || "" : `${row.eventName} · ${row.incomeMasterName}`)}
                    >
                      {actionId === row.id ? <LoaderCircle className="spin" /> : <Trash2 />}
                    </button>
                  </td>
                </tr>;
              })}
            </tbody>
          ))}
        </table>
      </div>

      <div className="master-subtables">
        <section className="master-subtable">
          <div className="panel-title">
            <div>
              <span className="eyebrow">MASTER PEMASUKAN</span>
              <h2>Daftar baku pemasukan</h2>
            </div>
          </div>
          <div className="responsive-table">
            <table className="master-table compact-table">
              <thead><tr><th>Nama</th><th /></tr></thead>
              <tbody>
                {incomeMasters.map((row) => <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  <td className="row-actions">
                    <button className="icon-button" onClick={() => startEdit(row, "incomeMaster")}><Pencil /></button>
                    <button className="icon-button" disabled={actionId === row.id} onClick={() => void removeEntity("incomeMaster", row.id, row.name)}>{actionId === row.id ? <LoaderCircle className="spin" /> : <Trash2 />}</button>
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <section className="master-subtable">
          <div className="panel-title">
            <div>
              <span className="eyebrow">MASTER PENGELUARAN</span>
              <h2>Daftar baku pengeluaran</h2>
            </div>
          </div>
          <div className="responsive-table">
            <table className="master-table compact-table">
              <thead><tr><th>Nama</th><th /></tr></thead>
              <tbody>
                {expenseTypes.map((row) => <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  <td className="row-actions">
                    <button className="icon-button" onClick={() => startEdit(row, "expenseType")}><Pencil /></button>
                    <button className="icon-button" disabled={actionId === row.id} onClick={() => void removeEntity("expenseType", row.id, row.name)}>{actionId === row.id ? <LoaderCircle className="spin" /> : <Trash2 />}</button>
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>

    {editing && typeof document !== "undefined" && createPortal(
      <div className="modal-backdrop" onMouseDown={() => setEditing(null)}>
        <div className="modal-card modal-card-edit" onMouseDown={(event) => event.stopPropagation()}>
          <button className="modal-close" onClick={() => setEditing(null)}><X /></button>
          <div className="eyebrow">EDIT MASTER</div>
          <h2>
            {editing.entity === "ministry" ? "Ubah kementerian" :
              editing.entity === "event" ? "Ubah event" :
                editing.entity === "income" ? "Ubah mapping pemasukan" :
                  editing.entity === "incomeMaster" ? "Ubah master pemasukan" :
                    "Ubah jenis pengeluaran"}
          </h2>
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
            <label>Event<select value={editing.eventId} onChange={(e) => setEditing({ ...editing, eventId: e.target.value })}><option value="">Pilih event...</option>{editEvents.map((row) => <option key={row.id} value={row.id}>{row.ministry.code} · {row.ministry.name} / {row.name}</option>)}</select></label>
            <label>Master pemasukan<select value={editing.incomeMasterId} onChange={(e) => setEditing({ ...editing, incomeMasterId: e.target.value })}><option value="">Pilih master pemasukan...</option>{incomeMasters.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <label>Kode unik<input inputMode="numeric" maxLength={8} value={editing.uniqueCode} onChange={(e) => setEditing({ ...editing, uniqueCode: e.target.value.replace(/\D/g, "") })} /></label>
          </>}
          {editing.entity === "incomeMaster" && <label>Nama master pemasukan<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>}
          {editing.entity === "expenseType" && <label>Nama jenis pengeluaran<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>}
          {editError && <div className="form-error">{editError}</div>}
          <button className="button button-primary button-wide" disabled={editLoading} onClick={() => void saveEdit()}>{editLoading ? <LoaderCircle className="spin" /> : <Pencil />} Simpan perubahan</button>
        </div>
      </div>,
      document.body,
    )}
  </div>;
}
