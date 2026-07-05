import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CircleAlert, Sparkles } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { db } from "@/lib/db";
import { compactRupiah, dateId, rupiah } from "@/lib/format";
import { getBalanceEstimateSummary } from "@/lib/meeting-report";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = now;

  const [bankMonthIncome, bankMonthExpense, unmatched, recent, byMinistry, balanceSummary] = await Promise.all([
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

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="PUSAT KENDALI"
        title="Arus kas, tanpa kabut."
        description="Saldo rekening dihitung dari mutasi bank. QRIS dipakai sebagai rincian pemasukan, bukan penambah saldo kedua kali."
        action={<Link className="button button-primary" href="/imports"><Sparkles size={17} /> Impor transaksi</Link>}
      />

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
                <strong className="money-fee">{rupiah.format(account.qrisEstimateNet)}</strong>
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
