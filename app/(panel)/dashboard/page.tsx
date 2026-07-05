import Link from "next/link";
import type { TransactionSource } from "@prisma/client";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CircleAlert, Sparkles } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { db } from "@/lib/db";
import { compactRupiah, dateId, periodBounds, rupiah } from "@/lib/format";

export const dynamic = "force-dynamic";
const bankSources: TransactionSource[] = ["BANK_PDF", "BANK_SCREENSHOT"];
const trackedAccounts = [
  { label: "Muhammad Rizky", matcher: "muhammad rizky" },
  { label: "Sugiarsa", matcher: "sugiarsa" },
] as const;

export default async function DashboardPage() {
  const { startDate, endDate } = periodBounds();
  const [bankMonthIncome, bankMonthExpense, unmatched, recent, byMinistry, bankBalances] = await Promise.all([
    db.transaction.aggregate({ where: { isDraft: false, source: { in: bankSources }, direction: "IN", transactionDate: { gte: startDate, lte: endDate } }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { isDraft: false, source: { in: bankSources }, direction: "OUT", transactionDate: { gte: startDate, lte: endDate } }, _sum: { amount: true } }),
    db.transaction.count({ where: { isDraft: false, status: "UNMATCHED" } }),
    db.transaction.findMany({
      where: { isDraft: false, source: { in: bankSources } },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      take: 6,
      include: { event: true, ministry: true },
    }),
    db.transaction.groupBy({
      by: ["ministryId", "direction"],
      where: {
        isDraft: false,
        source: { in: bankSources },
        status: "MATCHED",
        transactionDate: { gte: startDate, lte: endDate },
        ministryId: { not: null },
      },
      _sum: { amount: true },
    }),
    db.transaction.groupBy({
      by: ["accountHolder", "accountNumber", "direction"],
      where: { isDraft: false, source: { in: bankSources } },
      _sum: { amount: true },
    }),
  ]);
  const incomeValue = Number(bankMonthIncome._sum.amount || 0);
  const expenseValue = Number(bankMonthExpense._sum.amount || 0);
  const normalizedBalances = bankBalances.map((row) => ({
    holder: String(row.accountHolder || "").trim(),
    number: String(row.accountNumber || "").trim(),
    direction: row.direction,
    amount: Number(row._sum.amount || 0),
  }));
  const currentBalance = normalizedBalances.reduce((sum, row) => sum + (row.direction === "IN" ? row.amount : -row.amount), 0);
  const accountBalances = trackedAccounts.map((account) => {
    const relevant = normalizedBalances.filter((row) => row.holder.toLocaleLowerCase("id-ID").includes(account.matcher));
    const balance = relevant.reduce((sum, row) => sum + (row.direction === "IN" ? row.amount : -row.amount), 0);
    const accountNumber = relevant.find((row) => row.number)?.number || null;
    return { ...account, balance, accountNumber };
  });
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
      <PageHeading eyebrow="PUSAT KENDALI" title="Arus kas, tanpa kabut." description="Saldo rekening dihitung dari mutasi bank. QRIS dipakai sebagai rincian pemasukan, bukan penambah saldo kedua kali." action={<Link className="button button-primary" href="/imports"><Sparkles size={17} /> Impor transaksi</Link>} />
      <section className="stats-grid">
        <article className="stat-card stat-income"><div className="stat-icon"><ArrowDownLeft /></div><span>Uang masuk rekening</span><strong>{compactRupiah.format(incomeValue)}</strong><small>Bulan berjalan · mutasi bank</small></article>
        <article className="stat-card stat-expense"><div className="stat-icon"><ArrowUpRight /></div><span>Uang keluar rekening</span><strong>{compactRupiah.format(expenseValue)}</strong><small>Bulan berjalan · mutasi bank</small></article>
        <article className="stat-card stat-balance"><div className="stat-icon">=</div><span>Saldo rekening saat ini</span><strong>{compactRupiah.format(currentBalance)}</strong><small>Akumulasi seluruh mutasi bank final</small></article>
        <article className={`stat-card stat-alert ${unmatched > 0 ? "stat-alert-active" : ""}`}><div className="stat-icon"><CircleAlert /></div><span>Perlu ditinjau</span><strong>{unmatched}</strong><small>Transaksi belum di-assign</small></article>
      </section>
      <section className="account-balance-grid">
        {accountBalances.map((account) => (
          <article className="panel account-balance-card" key={account.label}>
            <div className="eyebrow">SALDO REKENING</div>
            <h2>{account.label}</h2>
            <strong>{rupiah.format(account.balance)}</strong>
            <small>{account.accountNumber ? `Rekening ${account.accountNumber}` : "Nomor rekening belum terbaca di data mutasi."}</small>
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
