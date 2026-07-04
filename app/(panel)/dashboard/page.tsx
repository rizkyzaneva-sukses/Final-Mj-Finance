import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CircleAlert, Sparkles } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { db } from "@/lib/db";
import { compactRupiah, dateId, periodBounds, rupiah } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { startDate, endDate } = periodBounds();
  const [income, expense, unmatched, recent, byMinistry] = await Promise.all([
    db.transaction.aggregate({ where: { isDraft: false, status: "MATCHED", direction: "IN", transactionDate: { gte: startDate, lte: endDate } }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { isDraft: false, status: "MATCHED", direction: "OUT", transactionDate: { gte: startDate, lte: endDate } }, _sum: { amount: true } }),
    db.transaction.count({ where: { isDraft: false, status: "UNMATCHED" } }),
    db.transaction.findMany({ where: { isDraft: false, status: { not: "SKIPPED" } }, orderBy: { transactionDate: "desc" }, take: 6, include: { event: true, ministry: true } }),
    db.transaction.groupBy({ by: ["ministryId", "direction"], where: { isDraft: false, status: "MATCHED", transactionDate: { gte: startDate, lte: endDate }, ministryId: { not: null } }, _sum: { amount: true } }),
  ]);
  const incomeValue = Number(income._sum.amount || 0);
  const expenseValue = Number(expense._sum.amount || 0);
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
      <PageHeading eyebrow="PUSAT KENDALI" title="Arus kas, tanpa kabut." description="Ringkasan bulan berjalan dari transaksi yang sudah terverifikasi." action={<Link className="button button-primary" href="/imports"><Sparkles size={17} /> Impor transaksi</Link>} />
      <section className="stats-grid">
        <article className="stat-card stat-income"><div className="stat-icon"><ArrowDownLeft /></div><span>Pemasukan</span><strong>{compactRupiah.format(incomeValue)}</strong><small>Bulan berjalan</small></article>
        <article className="stat-card stat-expense"><div className="stat-icon"><ArrowUpRight /></div><span>Pengeluaran</span><strong>{compactRupiah.format(expenseValue)}</strong><small>Bulan berjalan</small></article>
        <article className="stat-card stat-balance"><div className="stat-icon">=</div><span>Arus kas bersih</span><strong>{compactRupiah.format(incomeValue - expenseValue)}</strong><small>Pemasukan dikurangi pengeluaran</small></article>
        <article className="stat-card stat-alert"><div className="stat-icon"><CircleAlert /></div><span>Perlu ditinjau</span><strong>{unmatched}</strong><small>Transaksi belum di-assign</small></article>
      </section>
      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-title"><div><span className="eyebrow">PER KEMENTERIAN</span><h2>Gerak dana bulan ini</h2></div><div className="chart-legend"><span className="legend-in">Masuk</span><span className="legend-out">Keluar</span></div></div>
          {chart.length ? <div className="bar-chart">{chart.map((item) => <div className="bar-row" key={item.name}><div className="bar-label">{item.name}</div><div className="bars"><div className="bar bar-in" style={{ width: `${Math.max(2, item.income / max * 100)}%` }} title={rupiah.format(item.income)} /><div className="bar bar-out" style={{ width: `${Math.max(2, item.expense / max * 100)}%` }} title={rupiah.format(item.expense)} /></div></div>)}</div> : <Empty text="Belum ada transaksi terverifikasi bulan ini." />}
        </article>
        <article className="panel recent-panel">
          <div className="panel-title"><div><span className="eyebrow">TERBARU</span><h2>Aktivitas transaksi</h2></div><Link href="/transactions">Semua <ArrowRight size={15} /></Link></div>
          {recent.length ? <div className="transaction-list">{recent.map((row) => <div className="transaction-item" key={row.id}><div className={`direction-dot ${row.direction === "IN" ? "dot-in" : "dot-out"}`} /><div className="transaction-main"><strong>{row.event?.name || row.description}</strong><small>{dateId.format(row.transactionDate)} · {row.ministry?.name || "Belum di-assign"}</small></div><b className={row.direction === "IN" ? "money-in" : "money-out"}>{row.direction === "IN" ? "+" : "-"}{rupiah.format(Number(row.amount))}</b></div>)}</div> : <Empty text="Belum ada aktivitas. Mulai dari impor data." />}
        </article>
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state"><span>MJ</span><p>{text}</p></div>;
}
