import { Download } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { ReportFilters } from "@/components/report-filters";
import { periodBounds, rupiah } from "@/lib/format";
import { getReportData } from "@/lib/reports";

export const dynamic = "force-dynamic";
type Params = Promise<{ start?: string; end?: string }>;

export default async function ReportsPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const period = periodBounds(params.start, params.end);
  const { ministryRows, eventRows } = await getReportData(period.startDate, period.endDate);
  const query = new URLSearchParams({ start: period.start, end: period.end }).toString();
  const totalIncome = ministryRows.reduce((sum, row) => sum + row.income, 0);
  const totalExpense = ministryRows.reduce((sum, row) => sum + row.expense, 0);

  return <div className="page-stack">
    <PageHeading eyebrow="LAPORAN ARUS KAS" title="Angka yang siap diceritakan." description="Tinjau per kementerian dan event, lalu unduh Excel dengan merge-cell yang sudah rapi." action={<a className="button button-primary" href={`/api/reports/export?${query}`}><Download size={17} /> Unduh Excel</a>} />
    <ReportFilters start={period.start} end={period.end} />
    <section className="report-summary"><div><span>Total pemasukan</span><strong className="money-in">{rupiah.format(totalIncome)}</strong></div><div><span>Total pengeluaran</span><strong className="money-out">{rupiah.format(totalExpense)}</strong></div><div><span>Arus kas bersih</span><strong>{rupiah.format(totalIncome - totalExpense)}</strong></div></section>
    <section className="panel table-panel"><div className="panel-title"><div><span className="eyebrow">REKAP UTAMA</span><h2>Arus kas per kementerian</h2></div></div>{ministryRows.length ? <div className="responsive-table"><table className="report-table"><thead><tr><th>Kode</th><th>Kementerian</th><th>Pemasukan</th><th>Pengeluaran</th><th>Arus bersih</th></tr></thead><tbody>{ministryRows.map((row) => <tr key={row.code}><td><span className="ministry-code">{row.code}</span></td><td><strong>{row.ministry}</strong></td><td className="money-in">{rupiah.format(row.income)}</td><td className="money-out">{rupiah.format(row.expense)}</td><td><strong>{rupiah.format(row.net)}</strong></td></tr>)}</tbody></table></div> : <Empty />}</section>
    <section className="panel table-panel"><div className="panel-title"><div><span className="eyebrow">RINCIAN KEGIATAN</span><h2>Arus kas per event</h2></div></div>{eventRows.length ? <div className="responsive-table"><table className="report-table event-report"><thead><tr><th>Event</th><th>Kementerian</th><th>Jenis pemasukan</th><th>Kode</th><th>Pemasukan</th><th>Pengeluaran</th></tr></thead><tbody>{eventRows.flatMap((event) => event.incomeRows.map((income, index) => <tr key={`${event.event}-${income.type}`}>{index === 0 && <td rowSpan={event.incomeRows.length}><strong>{event.event}</strong></td>}{index === 0 && <td rowSpan={event.incomeRows.length}>{event.ministry}</td>}<td>{income.type}</td><td>{income.code ? <span className="code-chip">{income.code}</span> : "—"}</td><td className="money-in">{rupiah.format(income.amount)}</td>{index === 0 && <td rowSpan={event.incomeRows.length} className="money-out">{rupiah.format(event.expense)}</td>}</tr>))}</tbody></table></div> : <Empty />}</section>
  </div>;
}

function Empty() { return <div className="empty-state"><span>∅</span><p>Belum ada transaksi terverifikasi pada periode ini.</p></div>; }
