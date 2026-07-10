"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";

export function QrisResetButton({ accountNumber, accountHolder }: { accountNumber: string | null; accountHolder: string | null }) {
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    if (!confirm("Reset estimasi QRIS ke 0? Estimasi akan terisi lagi saat ada upload QRIS baru.")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/qris-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountNumber, accountHolder }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error || "Gagal reset.");
      }
    } catch {
      alert("Gagal koneksi ke server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleReset}
      disabled={loading}
      className="qris-reset-btn"
      title="Reset estimasi QRIS ke 0"
      style={{
        background: "none",
        border: "1px solid var(--border-subtle, #e5e7eb)",
        borderRadius: "6px",
        padding: "4px 8px",
        cursor: loading ? "wait" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "12px",
        color: "var(--text-secondary, #6b7280)",
        opacity: loading ? 0.6 : 1,
      }}
    >
      <RotateCcw size={12} />
      0
    </button>
  );
}
