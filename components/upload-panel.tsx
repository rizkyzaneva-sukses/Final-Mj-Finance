"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, FileSpreadsheet, ImagePlus, LoaderCircle, UploadCloud, X } from "lucide-react";

type UploadKind = "QRIS" | "BANK" | "HISTORICAL";

function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
}

function FilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (isImageFile(file)) {
      const objectUrl = URL.createObjectURL(file);
      setUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
  }, [file]);
  if (url) {
    return <img src={url} alt={file.name} className="upload-preview-thumb" />;
  }
  return <div className="upload-preview-icon"><FileSpreadsheet size={20} /></div>;
}

export function UploadPanel({ canImportHistorical = false }: { canImportHistorical?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<UploadKind>("QRIS");
  const [files, setFiles] = useState<File[]>([]);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [qrisAccountHolder, setQrisAccountHolder] = useState("");
  const [qrisAccountNumber, setQrisAccountNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  function changeKind(next: UploadKind) {
    setKind(next);
    setFiles([]);
    setReplaceExisting(false);
    setMessage(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function addFiles(picked: FileList | null) {
    if (!picked?.length) return;
    const arr = Array.from(picked);
    if (!arr.length) return;
    setFiles((current) => (kind === "BANK" ? [...current, ...arr] : [arr[0]]));
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  async function upload() {
    if (!files.length || loading) return;
    if (kind === "HISTORICAL" && replaceExisting && !window.confirm("Hapus seluruh transaksi dan riwayat impor saat ini? Master Data tetap dipertahankan.")) return;
    setLoading(true);
    setMessage(null);
    try {
      const data = new FormData();
      data.set("kind", kind);
      files.forEach((item) => data.append("file", item));
      if (kind === "HISTORICAL") {
        data.set("replaceExisting", String(replaceExisting));
        data.set("qrisAccountHolder", qrisAccountHolder);
        data.set("qrisAccountNumber", qrisAccountNumber);
      }
      const response = await fetch("/api/imports", { method: "POST", body: data });
      let payload: { error?: string; batchId?: string } = {};
      try {
        payload = await response.json();
      } catch {
        payload = { error: "Respons server tidak valid." };
      }
      if (!response.ok) setMessage({ type: "error", text: payload.error || "Impor gagal." });
      else if (!payload.batchId) setMessage({ type: "error", text: "Impor gagal: batch tidak ditemukan." });
      else {
        setFiles([]);
        if (inputRef.current) inputRef.current.value = "";
        router.push(`/imports/${payload.batchId}`);
      }
    } catch {
      setMessage({ type: "error", text: "Koneksi gagal. Coba unggah lagi." });
    } finally {
      setLoading(false);
    }
  }

  function onDropZoneDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function onDropZoneDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (loading) return;
    addFiles(event.dataTransfer.files);
  }

  const accept = kind === "QRIS" ? ".xlsx,.xls" : kind === "HISTORICAL" ? ".xlsx" : ".pdf,.jpg,.jpeg,.png,.webp";
  const fileLabel = kind === "QRIS" ? "QRIS" : kind === "BANK" ? "mutasi BCA" : "Data Lama FINAL";
  const fileFormat = kind === "BANK" ? "Format .pdf, .jpg, .png, atau .webp · bisa pilih beberapa sekaligus" : kind === "HISTORICAL" ? "Format .xlsx FINAL" : "Format .xlsx atau .xls";
  const totalSizeMb = files.reduce((sum, item) => sum + item.size, 0) / 1024 / 1024;
  return (
    <section className="upload-section">
      <div className="upload-tabs" role="tablist">
        <button className={kind === "QRIS" ? "selected" : ""} onClick={() => changeKind("QRIS")}><FileSpreadsheet /> <span><b>Data QRIS</b><small>Excel laporan transaksi</small></span></button>
        <button className={kind === "BANK" ? "selected" : ""} onClick={() => changeKind("BANK")}><ImagePlus /> <span><b>Mutasi BCA</b><small>PDF atau screenshot</small></span></button>
        {canImportHistorical && <button className={kind === "HISTORICAL" ? "selected" : ""} onClick={() => changeKind("HISTORICAL")}><ArchiveRestore /> <span><b>Data Lama FINAL</b><small>Mapping historis siap review</small></span></button>}
      </div>
      <div className="drop-zone" onDragOver={onDropZoneDragOver} onDrop={onDropZoneDrop}>
        <input ref={inputRef} type="file" accept={accept} multiple={kind === "BANK"} onChange={(event) => addFiles(event.target.files)} className="drop-zone-file-input" />
        <div className="drop-icon"><UploadCloud /></div>
        {files.length ? (
          kind === "BANK"
            ? <><strong>{files.length} file dipilih</strong><p>{totalSizeMb.toFixed(2)} MB total · klik untuk tambah lagi</p></>
            : <><strong>{files[0].name}</strong><p>{(files[0].size / 1024 / 1024).toFixed(2)} MB · klik untuk mengganti</p></>
        ) : <><strong>Pilih file {fileLabel}</strong><p>{fileFormat} · maksimum 15 MB per file · drag & drop didukung</p></>}
      </div>
      {kind === "BANK" && files.length > 0 && <ul className="upload-file-list">
        {files.map((item, index) => <li key={`${item.name}-${index}`} className="upload-file-item">
          <FilePreview file={item} />
          <div className="upload-file-info">
            <span>{item.name}</span>
            <small>{(item.size / 1024 / 1024).toFixed(2)} MB</small>
          </div>
          <button type="button" className="icon-button" title="Hapus dari daftar" onClick={(event) => { event.stopPropagation(); removeFile(index); }}><X size={14} /></button>
        </li>)}
      </ul>}
      {kind === "BANK" && <div className="info-strip"><b>Catatan cerdas</b><span>Baris "TRF BATCH MYBB - PEMBAYARAN" otomatis dilewati agar QRIS tidak dihitung dua kali. Unggah beberapa screenshot mutasi rekening yang sama sekaligus — jangan campur rekening berbeda dalam satu kali unggah.</span></div>}
      {kind === "HISTORICAL" && <div className="historical-options">
        <div className="historical-copy"><b>Impor aman lewat preview</b><span>Mapping pada workbook FINAL diterapkan langsung. Baris yang belum lengkap tetap masuk ke “Perlu ditinjau”. Sheet APPS_Belum_Terhubung tidak ikut diimpor.</span></div>
        <div className="historical-account-fields">
          <label>Pemilik rekening QRIS (opsional)<input value={qrisAccountHolder} onChange={(event) => setQrisAccountHolder(event.target.value)} placeholder="Khusus saat unggah FINAL QRIS" /></label>
          <label>Nomor rekening QRIS (opsional)<input inputMode="numeric" value={qrisAccountNumber} onChange={(event) => setQrisAccountNumber(event.target.value.replace(/\D/g, ""))} placeholder="Khusus saat unggah FINAL QRIS" /></label>
        </div>
        <label className="historical-replace"><input type="checkbox" checked={replaceExisting} onChange={(event) => setReplaceExisting(event.target.checked)} /><span><b>Bersihkan transaksi lama sebelum upload ini</b><small>Hanya transaksi dan riwayat impor yang dihapus. Kementerian, event, dan master tetap aman. Centang hanya pada file FINAL pertama.</small></span></label>
      </div>}
      {message && <div className={`notice notice-${message.type}`}>{message.text}</div>}
      <button className="button button-primary upload-button" disabled={!files.length || loading} onClick={upload}>{loading ? <><LoaderCircle className="spin" size={18} /> Sedang membaca{files.length > 1 ? ` ${files.length} file...` : "..."}</> : <><UploadCloud size={18} /> {kind === "HISTORICAL" ? "Upload ke preview" : "Impor dan cocokkan"}</>}</button>
    </section>
  );
}
