"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, FileSpreadsheet, ImagePlus, LoaderCircle, UploadCloud } from "lucide-react";

type UploadKind = "QRIS" | "BANK" | "HISTORICAL";

export function UploadPanel({ canImportHistorical = false }: { canImportHistorical?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<UploadKind>("QRIS");
  const [file, setFile] = useState<File | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [qrisAccountHolder, setQrisAccountHolder] = useState("");
  const [qrisAccountNumber, setQrisAccountNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  function changeKind(next: UploadKind) {
    setKind(next);
    setFile(null);
    setReplaceExisting(false);
    setMessage(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function upload() {
    if (!file) return;
    if (kind === "HISTORICAL" && replaceExisting && !window.confirm("Hapus seluruh transaksi dan riwayat impor saat ini? Master Data tetap dipertahankan.")) return;
    setLoading(true);
    setMessage(null);
    const data = new FormData();
    data.set("kind", kind);
    data.set("file", file);
    if (kind === "HISTORICAL") {
      data.set("replaceExisting", String(replaceExisting));
      data.set("qrisAccountHolder", qrisAccountHolder);
      data.set("qrisAccountNumber", qrisAccountNumber);
    }
    const response = await fetch("/api/imports", { method: "POST", body: data });
    const payload = await response.json();
    if (!response.ok) setMessage({ type: "error", text: payload.error || "Impor gagal." });
    else {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      router.push(`/imports/${payload.batchId}`);
    }
    setLoading(false);
  }

  const accept = kind === "QRIS" ? ".xlsx,.xls" : kind === "HISTORICAL" ? ".xlsx" : ".pdf,.jpg,.jpeg,.png,.webp";
  const fileLabel = kind === "QRIS" ? "QRIS" : kind === "BANK" ? "mutasi BCA" : "Data Lama FINAL";
  const fileFormat = kind === "BANK" ? "Format .pdf, .jpg, .png, atau .webp" : kind === "HISTORICAL" ? "Format .xlsx FINAL" : "Format .xlsx atau .xls";
  return (
    <section className="upload-section">
      <div className="upload-tabs" role="tablist">
        <button className={kind === "QRIS" ? "selected" : ""} onClick={() => changeKind("QRIS")}><FileSpreadsheet /> <span><b>Data QRIS</b><small>Excel laporan transaksi</small></span></button>
        <button className={kind === "BANK" ? "selected" : ""} onClick={() => changeKind("BANK")}><ImagePlus /> <span><b>Mutasi BCA</b><small>PDF atau screenshot</small></span></button>
        {canImportHistorical && <button className={kind === "HISTORICAL" ? "selected" : ""} onClick={() => changeKind("HISTORICAL")}><ArchiveRestore /> <span><b>Data Lama FINAL</b><small>Mapping historis siap review</small></span></button>}
      </div>
      <div className="drop-zone" onClick={() => inputRef.current?.click()}>
        <input ref={inputRef} type="file" accept={accept} onChange={(event) => setFile(event.target.files?.[0] || null)} hidden />
        <div className="drop-icon"><UploadCloud /></div>
        {file ? <><strong>{file.name}</strong><p>{(file.size / 1024 / 1024).toFixed(2)} MB · klik untuk mengganti</p></> : <><strong>Pilih file {fileLabel}</strong><p>{fileFormat} · maksimum 15 MB</p></>}
      </div>
      {kind === "BANK" && <div className="info-strip"><b>Catatan cerdas</b><span>Baris “TRF BATCH MYBB - PEMBAYARAN” otomatis dilewati agar QRIS tidak dihitung dua kali.</span></div>}
      {kind === "HISTORICAL" && <div className="historical-options">
        <div className="historical-copy"><b>Impor aman lewat preview</b><span>Mapping pada workbook FINAL diterapkan langsung. Baris yang belum lengkap tetap masuk ke “Perlu ditinjau”. Sheet APPS_Belum_Terhubung tidak ikut diimpor.</span></div>
        <div className="historical-account-fields">
          <label>Pemilik rekening QRIS (opsional)<input value={qrisAccountHolder} onChange={(event) => setQrisAccountHolder(event.target.value)} placeholder="Khusus saat unggah FINAL QRIS" /></label>
          <label>Nomor rekening QRIS (opsional)<input inputMode="numeric" value={qrisAccountNumber} onChange={(event) => setQrisAccountNumber(event.target.value.replace(/\D/g, ""))} placeholder="Khusus saat unggah FINAL QRIS" /></label>
        </div>
        <label className="historical-replace"><input type="checkbox" checked={replaceExisting} onChange={(event) => setReplaceExisting(event.target.checked)} /><span><b>Bersihkan transaksi lama sebelum upload ini</b><small>Hanya transaksi dan riwayat impor yang dihapus. Kementerian, event, dan master tetap aman. Centang hanya pada file FINAL pertama.</small></span></label>
      </div>}
      {message && <div className={`notice notice-${message.type}`}>{message.text}</div>}
      <button className="button button-primary upload-button" disabled={!file || loading} onClick={upload}>{loading ? <><LoaderCircle className="spin" size={18} /> Sedang membaca...</> : <><UploadCloud size={18} /> {kind === "HISTORICAL" ? "Upload ke preview" : "Impor dan cocokkan"}</>}</button>
    </section>
  );
}
