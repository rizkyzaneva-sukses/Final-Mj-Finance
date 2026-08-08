"use client";

import { Check, RotateCcw } from "lucide-react";
import { useState } from "react";

export function QrisResetButton({ accountNumber, accountHolder }: { accountNumber: string | null; accountHolder: string | null }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  // Payload harus membawa minimal satu penanda rekening; kunci reset dibentuk dari
  // nomor rekening bila ada, kalau tidak dari nama pemiliknya (lihat qrisResetKey).
  const identifiable = Boolean(String(accountNumber || "").replace(/\D/g, "") || String(accountHolder || "").trim());

  async function handleReset() {
    if (!identifiable || state !== "idle") return;
    if (!confirm("Reset estimasi QRIS ke 0? Estimasi akan terisi lagi saat ada upload QRIS baru.")) return;
    setError(null);
    setState("loading");
    try {
      const res = await fetch("/api/qris-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountNumber, accountHolder }),
      });
      if (res.ok) {
        setState("done");
        window.location.reload();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Gagal reset.");
      setState("idle");
    } catch {
      setError("Gagal koneksi ke server.");
      setState("idle");
    }
  }

  const disabled = !identifiable || state !== "idle";
  const title = !identifiable
    ? "Rekening belum bisa dikenali — reset tidak tersedia."
    : error || "Reset estimasi QRIS ke 0";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <button
        type="button"
        onClick={handleReset}
        disabled={disabled}
        className="qris-reset-btn"
        title={title}
        aria-label="Reset estimasi QRIS ke 0"
        aria-busy={state === "loading"}
        style={{
          background: "none",
          border: `1px solid ${error ? "var(--danger, #dc2626)" : "var(--border-subtle, #e5e7eb)"}`,
          borderRadius: "6px",
          padding: "4px 8px",
          cursor: state === "loading" ? "wait" : disabled ? "not-allowed" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "12px",
          color: error ? "var(--danger, #dc2626)" : "var(--text-secondary, #6b7280)",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {state === "done" ? <Check size={12} /> : <RotateCcw size={12} />}
        {state === "loading" ? "Mereset…" : state === "done" ? "Direset" : "0"}
      </button>
      {error && <small style={{ fontSize: "11px", color: "var(--danger, #dc2626)" }}>{error}</small>}
    </span>
  );
}
