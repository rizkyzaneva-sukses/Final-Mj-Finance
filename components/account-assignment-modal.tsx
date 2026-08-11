"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, LoaderCircle, X } from "lucide-react";
import { TRACKED_ACCOUNTS } from "@/lib/accounts";

export type AccountTarget = {
  ids: string[];
  currentHolder?: string | null;
  currentNumber?: string | null;
};

export function AccountAssignmentModal({
  target,
  onClose,
  onSuccess,
}: {
  target: AccountTarget;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => {
    const match = TRACKED_ACCOUNTS.find(
      (a) =>
        a.label === target.currentHolder ||
        (target.currentNumber && a.accountNumbers?.includes(target.currentNumber.replace(/\D/g, ""))),
    );
    return match?.label || TRACKED_ACCOUNTS[0]?.label || "";
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const account = TRACKED_ACCOUNTS.find((a) => a.label === selected);
    if (!account) {
      setError("Pilih rekening yang valid.");
      return;
    }
    setLoading(true);
    setError("");
    const payload = {
      action: "setAccount" as const,
      accountHolder: account.label,
      accountNumber: account.accountNumbers?.[0] || null,
    };
    const isBulk = target.ids.length > 1;
    const response = await fetch(
      isBulk ? "/api/transactions/bulk" : `/api/transactions/${target.ids[0]}`,
      {
        method: isBulk ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isBulk ? { ids: target.ids, ...payload } : payload),
      },
    );
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(data.error || "Gagal menyimpan rekening.");
      return;
    }
    onSuccess?.();
    onClose();
    router.refresh();
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} type="button"><X /></button>
        <div className="eyebrow">REKENING</div>
        <h2>Set rekening sumber</h2>
        <p className="modal-description">
          {target.ids.length > 1
            ? `${target.ids.length} transaksi akan ditautkan ke rekening yang sama.`
            : "Tautkan transaksi ini ke rekening terpantau."}
        </p>

        <div className="account-assign-list">
          {TRACKED_ACCOUNTS.map((account) => {
            const number = account.accountNumbers?.[0] || "—";
            const active = selected === account.label;
            return (
              <button
                key={account.label}
                type="button"
                className={`account-assign-option ${active ? "selected" : ""}`}
                onClick={() => setSelected(account.label)}
              >
                <Landmark size={18} />
                <div>
                  <strong>{account.label}</strong>
                  <small>Rek. {number}</small>
                </div>
              </button>
            );
          })}
        </div>

        {error && <div className="form-error">{error}</div>}

        <div style={{ display: "flex", gap: ".65rem", justifyContent: "flex-end" }}>
          <button className="button" type="button" onClick={onClose}>Batal</button>
          <button className="button button-primary" type="button" disabled={loading || !selected} onClick={save}>
            {loading ? <LoaderCircle className="spin" size={18} /> : "Simpan rekening"}
          </button>
        </div>
      </div>
    </div>
  );
}
