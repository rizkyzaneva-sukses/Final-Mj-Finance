"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";

type EventDoc = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  note: string | null;
  uploadedAt: string;
  uploadedByRole: string | null;
};

export function EventDocumentManager({
  eventId,
  eventName,
  initialCount = 0,
}: {
  eventId: string;
  eventName: string;
  initialCount?: number;
}) {
  const [docs, setDocs] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(initialCount > 0);

  async function loadDocs() {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/events/${eventId}/documents`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || "Dokumen gagal dimuat.");
      setDocs([]);
    } else {
      setDocs(body.documents || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (open) void loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventId]);

  async function upload() {
    if (!files.length) return;
    setUploading(true);
    setError("");
    const data = new FormData();
    files.forEach((file) => data.append("file", file));
    data.set("note", note);
    const response = await fetch(`/api/events/${eventId}/documents`, { method: "POST", body: data });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || "Dokumen gagal diunggah.");
      setUploading(false);
      return;
    }
    setFiles([]);
    setNote("");
    setUploading(false);
    await loadDocs();
  }

  async function remove(docId: string, label: string) {
    if (!window.confirm(`Hapus dokumen "${label}"?`)) return;
    setError("");
    const response = await fetch(`/api/events/${eventId}/documents/${docId}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || "Dokumen gagal dihapus.");
      return;
    }
    await loadDocs();
  }

  return (
    <div className="doc-manager">
      <div className="doc-manager-head">
        <span className="eyebrow">DOKUMENTASI STRUK</span>
        <small>Bukti / bon untuk program {eventName}</small>
        <button type="button" className="button button-dark" style={{ width: "fit-content", marginTop: ".35rem" }} onClick={() => setOpen((v) => !v)}>
          {open ? "Sembunyikan dokumen" : `Kelola dokumen${docs.length || initialCount ? ` (${docs.length || initialCount})` : ""}`}
        </button>
      </div>
      {open && (
        <>
          {loading ? (
            <p className="doc-loading">Memuat dokumen…</p>
          ) : (
            <ul className="doc-list">
              {docs.length ? docs.map((doc) => (
                <li key={doc.id} className="doc-item">
                  <a className="doc-preview" href={`/api/events/${eventId}/documents/${doc.id}/file`} target="_blank" rel="noreferrer">
                    {doc.mimeType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/events/${eventId}/documents/${doc.id}/file`} alt={doc.fileName} />
                    ) : <span className="doc-file-icon">PDF</span>}
                    <span className="doc-meta">
                      <strong>{doc.fileName}</strong>
                      <small>{(doc.size / 1024).toFixed(0)} KB{doc.note ? ` · ${doc.note}` : ""}</small>
                    </span>
                  </a>
                  <button type="button" className="icon-button" title="Hapus dokumen" onClick={() => void remove(doc.id, doc.fileName)}><Trash2 /></button>
                </li>
              )) : <li className="doc-empty">Belum ada dokumen bukti. Unggah foto struk atau PDF.</li>}
            </ul>
          )}
          {error && <div className="form-error">{error}</div>}
          <div className="doc-upload">
            <label className="doc-file-label">
              <input type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} hidden />
              <span>{files.length ? `${files.length} berkas dipilih` : "Pilih gambar atau PDF (maks 10 MB)"}</span>
            </label>
            <input className="doc-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Keterangan struk (opsional)" />
            <button type="button" className="button button-primary" disabled={!files.length || uploading} onClick={() => void upload()}>
              {uploading ? <LoaderCircle className="spin" /> : <Plus />} Unggah
            </button>
          </div>
        </>
      )}
    </div>
  );
}
