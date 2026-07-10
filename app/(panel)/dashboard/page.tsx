import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, CircleAlert, Sparkles, TriangleAlert, FileText, Camera } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { QrisResetButton } from "@/components/qris-reset-button";
import { ReconciliationTrigger } from "@/components/reconciliation-trigger";
import { db } from "@/lib/db";
import { compactRupiah, dateId, rupiah } from "@/lib/format";
import { getBalanceEstimateSummary } from "@/lib/meeting-report";
import { OPENING_BALANCE_PREFIX } from "@/lib/opening-balance";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = now;

  const [bankMonthIncome, bankMonthExpense, unmatched, recent, byMinistry, balanceSummary, sourceBreakdown, openingBalanceRows] = await Promise.all([
    db.transaction.aggregate({ where: { isDraft: false, source: { in: ["BANK_PDF", "BANK_SCREENSHOT"] }, direction: "IN", transactionDate: { gte: startDate, lte: endDate } }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { isDraft: false, source: { in: ["BANK_PDF", "BANK_SCREENSHOT"] }, direction: "OUT", transactionDate: { gte: startDate, lte: endDate } }, _sum: { amount: true } }),
    db.transaction.count({ where: { isDraft: false, status: "UNMATCHED" } }),
    db.transaction.findMany({
      where: { isDraft: false, source: { in: ["BANK_PDF", "BANK_SCREENSHOT"] } },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      take: 6,
      include: { event: true, ministry: true },
    }),
    db.transaction.groupBy({
      by: ["ministryId", "direction"],
      where: {
        isDraft: false,
        source: { in: ["BANK_PDF", "BANK_SCREENSHOT"] },
        status: "MATCHED",
        transactionDate: { gte: startDate, lte: endDate },
        ministryId: { not: null },
      },
      _sum: { amount: true },
    }),
    getBalanceEstimateSummary(endDate),
    // Per-source breakdown: sum of (IN - OUT) grouped by source + accountHolder
    db.transaction.groupBy({
      by: ["source", "accountHolder", "accountNumber", "direction"],
      where: {
        isDraft: false,
        source: { in: ["BANK_PDF", "BANK_SCREENSHOT"] },
        status: "MATCHED",
      },
      _sum: { amount: true },
    }),
    // Opening balances for tracked accounts
    db.transaction.findMany({
      where: {
        isDraft: false,
        source: "MANUAL",
        sourceReference: { startsWith: OPENING_BALANCE_PREFIX },
      },
      select: { accountHolder: true, accountNumber: true, sourceReference: true },
    }),
  ]);

  const incomeValue = Number(bankMonthIncome._sum.amount || 0);
  const expenseValue = Number(bankMonthExpense._sum.amount || 0);
  const currentBalance = balanceSummary.confirmedTotal;
  const ministryIds = byMinistry.map((row) => row.ministryId).filter(Boolean) as string[];
  const ministries = await db.ministry.findMany({ where: { id: { in: ministryIds } } });
  const chart = ministries.map((ministry) => ({
    name: ministry.name,
    income: Number(byMinistry.find((row) => row.ministryId === ministry.id && row.direction === "IN")?._sum.amount || 0),
    expense: Number(byMinistry.find((row) => row.ministryId === ministry.id && row.direction === "OUT")?._sum.amount || 0),
  })).sort((a, b) => b.income - a.income);
  const max = Math.max(1, ...chart.flatMap((item) => [item.income, item.expense]));

  // --- Per-source balance breakdown ---
  const bankSources = ["BANK_PDF", "BANK_SCREENSHOT"] as const;
  const trackedAccounts = [
    { label: "Muhammad Rizky", matcher: "muhammad rizky" },
    { label: "Sugiarsa", matcher: "sugiarsa" },
  ];
  const sourceSummary = trackedAccounts.map((tracked) => {
    const rows = sourceBreakdown.filter((row) => {
      const holder = (row.accountHolder || "").toLowerCase();
      return holder.includes(tracked.matcher);
    });
    const bySource: Record<string, { income: number; expense: number; net: number }> = {};
    for (const src of bankSources) {
      const inRow = rows.find((r) => r.source === src && r.direction === "IN");
      const outRow = rows.find((r) => r.source === src && r.direction === "OUT");
      const income = Number(inRow?._sum.amount || 0);
      const expense = Number(outRow?._sum.amount || 0);
      bySource[src] = { income, expense, net: income - expense };
    }
    return { label: tracked.label, bySource };
  });

  // --- Opening balance warning ---
  const trackedWithOpeningBalance = trackedAccounts.map((tracked) => {
    const hasOpening = openingBalanceRows.some((row) => {
      const holder = (row.accountHolder || "").toLowerCase();
      return holder.includes(tracked.matcher);
    });
    return { label: tracked.label, hasOpening };
  });
  const missingOpeningBalance = trackedWithOpeningBalance.filter((a) => !a.hasOpening);

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="PUSAT KENDALI"
        title="Arus kas, tanpa kabut."
        icon={<BarChart3 size={26} />}
        description="Saldo rekening dihitung dari mutasi bank. QRIS dipakai sebagai rincian pemasukan, bukan penambah saldo kedua kali."
        action={<div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}><Link className="button button-primary" href="/imports"><Sparkles size={17} /> Impor transaksi</Link><ReconciliationTrigger accounts={balanceSummary.accountRows.map((a) => ({ label: a.label, accountNumber: a.accountNumber, calculatedBalance: a.confirmedBalance }))} /></div>}
      />
      {missingOpeningBalance.length > 0 && (
        <section className="panel dashboard-warning-banner">
          <div className="dashboard-warning-icon"><TriangleAlert size={20} /></div>
          <div>
            <strong>Saldo awal belum ditetapkan</strong>
            <small>Rekening berikut belum memiliki saldo awal (opening balance). Saldo yang ditampilkan mungkin tidak akurat.</small>
          </div>
          <div className="dashboard-warning-accounts">
            {missingOpeningBalance.map((a) => <span key={a.label} className="warning-account-chip">{a.label}</span>)}
          </div>
        </section>
      )}

      <section className="stats-grid">
        <article className="stat-card stat-income"><div className="stat-icon"><ArrowDownLeft /></div><span>Uang masuk rekening</span><strong>{compactRupiah.format(incomeValue)}</strong><small>Bulan berjalan · mutasi bank</small></article>
        <article className="stat-card stat-expense"><div className="stat-icon"><ArrowUpRight /></div><span>Uang keluar rekening</span><strong>{compactRupiah.format(expenseValue)}</strong><small>Bulan berjalan · mutasi bank</small></article>
        <article className="stat-card stat-balance"><div className="stat-icon">=</div><span>Saldo rekening saat ini</span><strong>{compactRupiah.format(currentBalance)}</strong><small>Akumulasi seluruh mutasi bank final</small></article>
        <article className={`stat-card stat-alert ${unmatched > 0 ? "stat-alert-active" : ""}`}><div className="stat-icon"><CircleAlert /></div><span>Perlu ditinjau</span><strong>{unmatched}</strong><small>Transaksi belum di-assign</small></article>
      </section>

      <section className="meeting-metrics-grid dashboard-balance-summary">
        <article className="meeting-metric-card">
          <span>Saldo terkonfirmasi</span>
          <strong>{rupiah.format(balanceSummary.confirmedTotal)}</strong>
          <small>Mutasi bank + saldo awal</small>
        </article>
        <article className="meeting-metric-card">
          <span>Estimasi QRIS belum cair</span>
          <strong className="money-fee">{rupiah.format(balanceSummary.qrisPendingNet)}</strong>
          <small>Netto setelah potongan 0,7%</small>
        </article>
        <article className="meeting-metric-card">
          <span>Saldo estimasi total</span>
          <strong>{rupiah.format(balanceSummary.estimatedTotal)}</strong>
          <small>Dipakai untuk pantauan cepat</small>
        </article>
      </section>

      <section className="meeting-account-grid dashboard-account-grid">
        {balanceSummary.accountRows.map((account) => (
          <article className="panel meeting-account-card" key={account.label}>
            <div className="eyebrow">SALDO REKENING</div>
            <h3>{account.label}</h3>
            <div className="meeting-account-values">
              <div>
                <small>Terkonfirmasi</small>
                <strong>{rupiah.format(account.confirmedBalance)}</strong>
              </div>
              <div>
                <small>Tambah estimasi QRIS</small>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <strong className="money-fee">{rupiah.format(account.qrisEstimateNet)}</strong>
                  {account.usesQrisEstimate && account.qrisEstimateNet > 0 && (
                    <QrisResetButton accountNumber={account.accountNumber} accountHolder={account.label} />
                  )}
                </div>
              </div>
              <div>
                <small>Saldo estimasi</small>
                <strong>{rupiah.format(account.estimatedBalance)}</strong>
              </div>
            </div>
            <p>
              {account.accountNumber ? `Rek. ${account.accountNumber}` : "Nomor rekening belum terbaca di data mutasi."}
              <br />
              {account.lastMutationAt ? `Mutasi terakhir ${dateId.format(account.lastMutationAt)}` : "Belum ada mutasi bank"}
              {account.staleDays !== null ? ` · jeda ${account.staleDays} hari` : ""}
            </p>
          </article>
        ))}
      </section>
      <section className="panel source-summary-section">
        <div className="panel-title"><div><span className="eyebrow">RINGKASAN PER SUMBER</span><h2>Saldo berdasarkan sumber data</h2></div></div>
        <div className="source-summary-grid">
          {sourceSummary.map((account) => (
            <article className="source-summary-card" key={account.label}>
              <h3>{account.label}</h3>
              <div className="source-summary-rows">
                {Object.entries(account.bySource).map(([src, data]) => (
                  <div className="source-summary-row" key={src}>
                    <div className="source-summary-label">
                      {src === "BANK_PDF" ? <FileText size={15} /> : <Camera size={15} />}
                      <span>{src === "BANK_PDF" ? "Mutasi PDF" : "Screenshot"}</span>
                    </div>
                    <div className="source-summary-values">
                      <div><small>Masuk</small><strong className="money-in">+{rupiah.format(data.income)}</strong></div>
                      <div><small>Keluar</small><strong className="money-out">-{rupiah.format(data.expense)}</strong></div>
                      <div><small>Net</small><strong>{rupiah.format(data.net)}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-title"><div><span className="eyebrow">PER KEMENTERIAN</span><h2>Gerak dana bulan ini</h2></div><div className="chart-legend"><span className="legend-in">Masuk</span><span className="legend-out">Keluar</span></div></div>
          {chart.length ? <div className="bar-chart">{chart.map((item) => <div className="bar-row" key={item.name}><div className="bar-label">{item.name}</div><div className="bars"><div className="bar bar-in" style={{ width: `${Math.max(2, item.income / max * 100)}%` }} title={rupiah.format(item.income)} /><div className="bar bar-out" style={{ width: `${Math.max(2, item.expense / max * 100)}%` }} title={rupiah.format(item.expense)} /></div></div>)}</div> : <Empty text="Belum ada mutasi bank ter-assign bulan ini." />}
        </article>
        <article className="panel recent-panel">
          <div className="panel-title"><div><span className="eyebrow">TERBARU</span><h2>Mutasi rekening terakhir</h2></div><Link href="/transactions?source=BANK_PDF">Semua <ArrowRight size={15} /></Link></div>
          {recent.length ? <div className="transaction-list">{recent.map((row) => <div className="transaction-item" key={row.id}><div className={`direction-dot ${row.direction === "IN" ? "dot-in" : "dot-out"}`} /><div className="transaction-main"><strong>{row.event?.name || row.description}</strong><small>{dateId.format(row.transactionDate)} · {row.accountHolder || "Rekening belum terbaca"}{row.ministry ? ` · ${row.ministry.name}` : ""}</small></div><b className={row.direction === "IN" ? "money-in" : "money-out"}>{row.direction === "IN" ? "+" : "-"}{rupiah.format(Number(row.amount))}</b></div>)}</div> : <Empty text="Belum ada mutasi bank. Mulai dari impor data." />}
        </article>
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state"><span>MJ</span><p>{text}</p></div>;
}
