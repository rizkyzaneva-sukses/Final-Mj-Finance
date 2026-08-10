"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, LoaderCircle, X, Scale, AlertTriangle, CheckCircle2 } from "lucide-react";
import { rupiah } from "@/lib/format";
import { parseIdrInput } from "@/lib/money";

type AccountInfo = {
  label: string;
  accountNumber: string | null;
  calculatedBalance: number;
};

type ReconciliationUnclaimed = {
  count: number;
  netAmount: number;
  samples: { id: string; date: string; description: string; amount: number; direction: string; accountHolder: string | null; accountNumber: string | null }[];
};

type ReconciliationResult = {
  accountNumber: string | null;
  label?: string;
  matchedByHolderOnlyCount?: number;
  actualBalance: number;
  calculatedBalance: number;
  discrepancy: number;
  transactionCount: number;
  match: boolean;
  transactions: {
    id: string;
    date: string;
    description: string;
    amount: number;
    direction: string;
    status: string;
    accountHolder: string | null;
    reason: string;
  }[];
};

export function ReconciliationModal({
  accounts,
  onClose,
}: {
  accounts: AccountInfo[];
  onClose: () => void;
}) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<ReconciliationResult[] | null>(null);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [skippedLabels, setSkippedLabels] = useState<string[]>([]);
  const [unclaimed, setUnclaimed] = useState<ReconciliationUnclaimed | null>(null);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function runReconciliation() {
    setError("");

    if (!accounts.length) {
      setError("Tidak ada rekening yang bisa diperiksa.");
      return;
    }

    const items: { accountNumber: string | null; label: string; actualBalance: number }[] = [];
    const invalidLabels: string[] = [];
    const skipped: string[] = [];

    for (const account of accounts) {
      const raw = inputs[account.label] ?? "";
      if (!raw.trim()) {
        skipped.push(account.label);
        continue;
      }
      const parsed = parseIdrInput(raw);
      if (parsed === null) {
        invalidLabels.push(account.label);
        continue;
      }
      items.push({ accountNumber: account.accountNumber, label: account.label, actualBalance: parsed });
    }

    if (invalidLabels.length) {
      setError(`Nominal tidak valid untuk ${invalidLabels.join(", ")}. Gunakan format angka seperti 1.500.000.`);
      return;
    }

    if (!items.length) {
      setError("Isi saldo aktual minimal satu rekening sebelum rekonsiliasi.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error || "Gagal melakukan rekonsiliasi.");
        setLoading(false);
        return;
      }
      setSkippedLabels(skipped);
      setUnclaimed(body.unclaimed ?? null);
      setResults(body.results);
    } catch {
      setError("Gagal menghubungi server.");
    } finally {
      setLoading(false);
    }
  }

  function formatDiscrepancy(value: number): string {
    if (Math.abs(value) < 0.01) return "Rp 0";
    const prefix = value > 0 ? "+" : "";
    return `${prefix}${rupiah.format(value)}`;
  }

  function toggleExpand(accountNumber: string) {
    setExpandedAccount(expandedAccount === accountNumber ? null : accountNumber);
  }

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="modal-backdrop modal-backdrop-reconcile" onMouseDown={onClose}>
      <div className="modal-card modal-card-reconcile" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} type="button">
          <X />
        </button>

        <header className="recon-header">
          <div className="eyebrow">REKONSILIASI</div>
          <h2>Rekonsiliasi Saldo Rekening</h2>
          <p>Isi saldo aktual dari mutasi bank. Kosongkan rekening yang tidak diperiksa.</p>
        </header>

        <div className="recon-body">
          {!results ? (
            <div className="recon-form-grid">
              {accounts.map((account) => {
                const key = account.label;
                const raw = inputs[key] ?? "";
                const parsed = parseIdrInput(raw);
                const invalid = raw.trim() !== "" && parsed === null;
                return (
                  <div className="recon-account-field" key={account.label}>
                    <label>
                      <strong>{account.label}</strong>
                      <small>
                        {account.accountNumber
                          ? `Rek. ${account.accountNumber}`
                          : "Nomor belum terbaca · lewat nama"}
                      </small>
                    </label>
                    <div className="recon-input-row">
                      <span>Rp</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="1.500.000"
                        value={raw}
                        onChange={(e) => {
                          const next = e.target.value.replace(/[^0-9.,\- ]/g, "");
                          setInputs((prev) => ({ ...prev, [key]: next }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void runReconciliation();
                        }}
                      />
                    </div>
                    <div className="recon-field-meta">
                      {invalid ? (
                        <small className="recon-meta-error">Format nominal tidak valid</small>
                      ) : parsed !== null ? (
                        <small>Terbaca: <b>{rupiah.format(parsed)}</b></small>
                      ) : (
                        <small>Opsional</small>
                      )}
                      <small>Sistem: {rupiah.format(account.calculatedBalance)}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="recon-results">
              {skippedLabels.length > 0 && (
                <div className="recon-skipped-note">
                  Dilewati (belum diisi): {skippedLabels.join(", ")}.
                </div>
              )}

              {results.map((result) => {
                const resultKey = result.accountNumber || result.label || "";
                return (
                  <article
                    key={resultKey}
                    className={`recon-result-card ${result.match ? "is-match" : "is-mismatch"}`}
                  >
                    <div className="recon-result-head">
                      <div>
                        <strong>{result.label || result.accountNumber}</strong>
                        <small>
                          {result.accountNumber ? `Rek. ${result.accountNumber} · ` : ""}
                          {result.transactionCount} transaksi
                          {result.matchedByHolderOnlyCount
                            ? ` · ${result.matchedByHolderOnlyCount} lewat nama`
                            : ""}
                        </small>
                      </div>
                      <div className={`recon-result-status ${result.match ? "ok" : "bad"}`}>
                        {result.match ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                        {result.match ? "Cocok" : "Selisih"}
                      </div>
                    </div>

                    <div className="recon-result-metrics">
                      <div>
                        <small>Aktual</small>
                        <strong>{rupiah.format(result.actualBalance)}</strong>
                      </div>
                      <div>
                        <small>Sistem</small>
                        <strong>{rupiah.format(result.calculatedBalance)}</strong>
                      </div>
                      <div>
                        <small>Selisih</small>
                        <strong className={result.match ? "ok" : "bad"}>
                          {formatDiscrepancy(result.discrepancy)}
                        </strong>
                      </div>
                    </div>

                    {!result.match && result.transactions.length > 0 && (
                      <div className="recon-problem-block">
                        <button type="button" className="recon-expand-btn" onClick={() => toggleExpand(resultKey)}>
                          <AlertTriangle size={13} />
                          {expandedAccount === resultKey
                            ? "Sembunyikan transaksi bermasalah"
                            : `Lihat ${result.transactions.length} transaksi bermasalah`}
                        </button>

                        {expandedAccount === resultKey && (
                          <div className="recon-problem-list">
                            {result.transactions.map((txn) => (
                              <div className="recon-problem-item" key={txn.id}>
                                <div className="recon-problem-top">
                                  <span>
                                    {new Date(txn.date).toLocaleDateString("id-ID", {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </span>
                                  <strong className={txn.direction === "IN" ? "money-in" : "money-out"}>
                                    {txn.direction === "IN" ? "+" : "-"}
                                    {rupiah.format(txn.amount)}
                                  </strong>
                                </div>
                                <div className="recon-problem-desc">{txn.description}</div>
                                <div className="recon-problem-foot">
                                  <span className="recon-reason-chip">{txn.reason}</span>
                                  <span>{txn.status}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}

              {unclaimed && unclaimed.count > 0 && (
                <article className="recon-unclaimed-card">
                  <div className="recon-unclaimed-head">
                    <AlertTriangle size={16} />
                    {unclaimed.count} transaksi tidak terkait rekening mana pun
                  </div>
                  <p>
                    Neto {rupiah.format(unclaimed.netAmount)}. Sering jadi penyebab selisih yang sulit dijelaskan.
                  </p>
                  {unclaimed.samples.length > 0 && (
                    <div className="recon-unclaimed-list">
                      {unclaimed.samples.map((txn) => (
                        <div className="recon-unclaimed-item" key={txn.id}>
                          <span>{txn.accountHolder || "Nama belum terbaca"} · {txn.description}</span>
                          <strong className={txn.direction === "IN" ? "money-in" : "money-out"}>
                            {txn.direction === "IN" ? "+" : "-"}{rupiah.format(txn.amount)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )}
            </div>
          )}
        </div>

        <footer className="recon-footer">
          {error && <div className="form-error">{error}</div>}
          {!results ? (
            <button
              className="button button-primary button-wide"
              disabled={loading || accounts.length === 0}
              onClick={() => void runReconciliation()}
              type="button"
            >
              {loading ? <LoaderCircle className="spin" /> : <Scale />}
              {loading ? " Mengecek..." : " Rekonsiliasi Sekarang"}
            </button>
          ) : (
            <div className="recon-footer-actions">
              <button
                className="button"
                type="button"
                onClick={() => {
                  setResults(null);
                  setExpandedAccount(null);
                  setSkippedLabels([]);
                  setUnclaimed(null);
                }}
              >
                Cek ulang
              </button>
              <button className="button button-primary" type="button" onClick={onClose}>
                <Check /> Tutup
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
