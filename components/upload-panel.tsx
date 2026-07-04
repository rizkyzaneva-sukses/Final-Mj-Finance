"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, ImagePlus, LoaderCircle, UploadCloud } from "lucide-react";

type UploadKind = "QRIS" | "BANK";

export function UploadPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<UploadKind>("QRIS");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  function changeKind(next: UploadKind) {
    setKind(next);
    setFile(null);
    setMessage(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function upload() {
    if (!file) return;
    setLoading(true);
    setMessage(null);
    const data = new FormData();
    data.set("kind", kind);
    data.set("file", file);
    const response = await fetch("/api/imports", { method: "POST", body: data });
    const payload = await response.json();
    if (!response.ok) setMessage({ type: "error", text: payload.error || "Impor gagal." });
    else {
      setMessage({ type: "ok", text: `${payload.imported} transaksi masuk, ${payload.matched} cocok otomatis, ${payload.unmatched} perlu ditinjau.` });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    }
    setLoading(false);
  }

  const accept = kind === "QRIS" ? ".xlsx,.xls" : ".pdf,.jpg,.jpeg,.png,.webp";
  return (
    <section className="upload-section">
      <div className="upload-tabs" role="tablist">
        <button className={kind === "QRIS" ? "selected" : ""} onClick={() => changeKind("QRIS")}><FileSpreadsheet /> <span><b>Data QRIS</b><small>Excel laporan transaksi</small></span></button>
        <button className={kind === "BANK" ? "selected" : ""} onClick={() => changeKind("BANK")}><ImagePlus /> <span><b>Mutasi BCA</b><small>PDF atau screenshot</small></span></button>
      </div>
      <div className="drop-zone" onClick={() => inputRef.current?.click()}>
        <input ref={inputRef} type="file" accept={accept} onChange={(event) => setFile(event.target.files?.[0] || null)} hidden />
        <div className="drop-icon"><UploadCloud /></div>
        {file ? <><strong>{file.name}</strong><p>{(file.size / 1024 / 1024).toFixed(2)} MB · klik untuk mengganti</p></> : <><strong>Pilih file {kind === "QRIS" ? "QRIS" : "mutasi BCA"}</strong><p>{kind === "QRIS" ? "Format .xlsx atau .xls" : "Format .pdf, .jpg, .png, atau .webp"} · maksimum 15 MB</p></>}
      </div>
      {kind === "BANK" && <div className="info-strip"><b>Catatan cerdas</b><span>Baris “TRF BATCH MYBB - PEMBAYARAN” otomatis dilewati agar QRIS tidak dihitung dua kali.</span></div>}
      {message && <div className={`notice notice-${message.type}`}>{message.text}</div>}
      <button className="button button-primary upload-button" disabled={!file || loading} onClick={upload}>{loading ? <><LoaderCircle className="spin" size={18} /> Sedang membaca...</> : <><UploadCloud size={18} /> Impor dan cocokkan</>}</button>
    </section>
  );
}
