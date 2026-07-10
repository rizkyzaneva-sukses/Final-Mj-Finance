"use client";

import { useState } from "react";
import { Check, LoaderCircle, X, Scale, AlertTriangle, CheckCircle2 } from "lucide-react";
import { rupiah } from "@/lib/format";

type AccountInfo = {
  label: string;
  accountNumber: string | null;
  calculatedBalance: number;
};

type ReconciliationResult = {
  accountNumber: string;
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

  async function runReconciliation() {
    setLoading(true);
    setError("");

    const items = accounts
      .filter((account) => account.accountNumber)
      .map((account) => ({
        accountNumber: account.accountNumber!,
        actualBalance: parseFloat(inputs[account.accountNumber!] || "0"),
      }));

    if (!items.length) {
      setError("Tidak ada rekening yang bisa diperiksa.");
      setLoading(false);
      return;
    }

    // Validate non-zero inputs
    const hasEmpty = items.some((item) => isNaN(item.actualBalance));
    if (hasEmpty) {
      setError("Isi semua saldo aktual dengan angka yang valid.");
      setLoading(false);
      return;
    }

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

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: "640px" }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose}>
          <X />
        </button>

        <div className="eyebrow">REKONSILIASI</div>
        <h2>Rekonsiliasi Saldo Rekening</h2>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: ".85rem" }}>
          Masukkan saldo aktual dari mutasi bank untuk setiap rekening.
          Sistem akan membandingkan dengan saldo yang dihitung dari data transaksi.
        </p>

        {!results ? (
          <>
            <div style={{ display: "grid", gap: "1rem", marginTop: "0.5rem" }}>
              {accounts.map((account) => (
                <div key={account.label} style={{ display: "grid", gap: "0.4rem" }}>
                  <label style={{ fontWeight: 800, fontSize: ".82rem" }}>
                    {account.label}
                    {account.accountNumber && (
                      <span style={{ fontWeight: 400, color: "var(--muted)", marginLeft: "0.5rem" }}>
                        Rek. {account.accountNumber}
                      </span>
                    )}
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ color: "var(--muted)", fontSize: ".85rem" }}>Rp</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Masukkan saldo aktual..."
                      value={inputs[account.accountNumber || ""] || ""}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9.-]/g, "");
                        setInputs((prev) => ({ ...prev, [account.accountNumber || ""]: raw }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") runReconciliation();
                      }}
                      style={{ flex: 1 }}
                    />
                  </div>
                  <small style={{ color: "var(--muted)", fontSize: ".75rem" }}>
                    Saldo dihitung dari sistem: {rupiah.format(account.calculatedBalance)}
                  </small>
                </div>
              ))}
            </div>

            {error && <div className="form-error">{error}</div>}

            <button
              className="button button-primary button-wide"
              disabled={loading || accounts.length === 0}
              onClick={runReconciliation}
            >
              {loading ? <LoaderCircle className="spin" /> : <Scale />}
              {loading ? " Mengecek..." : " Rekonsiliasi Sekarang"}
            </button>
          </>
        ) : (
          <>
            {/* Summary */}
            <div
              style={{
                display: "grid",
                gap: "0.75rem",
                marginTop: "0.5rem",
              }}
            >
              {results.map((result) => (
                <div
                  key={result.accountNumber}
                  style={{
                    border: `2px solid ${result.match ? "#22c55e" : "#ef4444"}`,
                    borderRadius: "16px",
                    padding: "1rem 1.2rem",
                    background: result.match
                      ? "rgba(34,197,94,.06)"
                      : "rgba(239,68,68,.06)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.6rem",
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: ".95rem" }}>
                        {result.accountNumber}
                      </strong>
                      <small
                        style={{
                          display: "block",
                          color: "var(--muted)",
                          fontSize: ".75rem",
                        }}
                      >
                        {result.transactionCount} transaksi tercatat
                      </small>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        color: result.match ? "#22c55e" : "#ef4444",
                        fontWeight: 700,
                        fontSize: ".9rem",
                      }}
                    >
                      {result.match ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                      {result.match ? "Cocok" : "Selisih"}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "0.75rem",
                      fontSize: ".82rem",
                    }}
                  >
                    <div>
                      <small style={{ color: "var(--muted)" }}>Saldo Aktual</small>
                      <strong>{rupiah.format(result.actualBalance)}</strong>
                    </div>
                    <div>
                      <small style={{ color: "var(--muted)" }}>Saldo Sistem</small>
                      <strong>{rupiah.format(result.calculatedBalance)}</strong>
                    </div>
                    <div>
                      <small style={{ color: "var(--muted)" }}>Selisih</small>
                      <strong
                        style={{
                          color: result.match ? "#22c55e" : "#ef4444",
                        }}
                      >
                        {formatDiscrepancy(result.discrepancy)}
                      </strong>
                    </div>
                  </div>

                  {/* Show problematic transactions if mismatch */}
                  {!result.match && result.transactions.length > 0 && (
                    <div style={{ marginTop: "0.75rem" }}>
                      <button
                        onClick={() => toggleExpand(result.accountNumber)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#ef4444",
                          fontWeight: 700,
                          fontSize: ".82rem",
                          cursor: "pointer",
                          padding: 0,
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <AlertTriangle size={14} />
                        {expandedAccount === result.accountNumber
                          ? "Sembunyikan transaksi bermasalah"
                          : `Lihat ${result.transactions.length} transaksi bermasalah`}
                      </button>

                      {expandedAccount === result.accountNumber && (
                        <div
                          style={{
                            marginTop: "0.5rem",
                            display: "grid",
                            gap: "0.4rem",
                          }}
                        >
                          {result.transactions.map((txn) => (
                            <div
                              key={txn.id}
                              style={{
                                padding: "0.6rem 0.8rem",
                                border: "1px solid var(--line)",
                                borderRadius: "12px",
                                background: "rgba(239,68,68,.03)",
                                fontSize: ".78rem",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <span>
                                  {new Date(txn.date).toLocaleDateString("id-ID", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </span>
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color:
                                      txn.direction === "IN"
                                        ? "#22c55e"
                                        : "#ef4444",
                                  }}
                                >
                                  {txn.direction === "IN" ? "+" : "-"}
                                  {rupiah.format(txn.amount)}
                                </span>
                              </div>
                              <div
                                style={{
                                  color: "var(--muted)",
                                  marginTop: "0.2rem",
                                }}
                              >
                                {txn.description}
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  marginTop: "0.2rem",
                                  fontSize: ".72rem",
                                }}
                              >
                                <span
                                  style={{
                                    background: "rgba(239,68,68,.1)",
                                    color: "#ef4444",
                                    padding: "0.1rem 0.4rem",
                                    borderRadius: "6px",
                                    fontWeight: 600,
                                  }}
                                >
                                  {txn.reason}
                                </span>
                                <span style={{ color: "var(--muted)" }}>
                                  {txn.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              className="button button-wide"
              onClick={() => {
                setResults(null);
                setExpandedAccount(null);
              }}
            >
              Cek Ulang
            </button>

            <button className="button button-primary button-wide" onClick={onClose}>
              <Check /> Tutup
            </button>
          </>
        )}
      </div>
    </div>
  );
}
