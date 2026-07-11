import { Download, FileText, Landmark } from "lucide-react";
import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { ReportFilters } from "@/components/report-filters";
import { EventReportFilter } from "@/components/event-report-filter";
import { dateId, periodBounds, rupiah } from "@/lib/format";
import { getMeetingReportData } from "@/lib/meeting-report";
import { getEventBreakdown } from "@/lib/reports";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
type Params = Promise<{ start?: string; end?: string; event?: string }>;

const sourceLabel: Record<string, string> = {
  QRIS_XLSX: "QRIS",
  BANK_PDF: "Mutasi PDF",
  BANK_SCREENSHOT: "Screenshot",
  MANUAL: "Manual",
};

export default async function ReportsPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const period = periodBounds(params.start, params.end);
  const eventId = params.event || "";

  const events = await db.event.findMany({
    where: { active: true },
    orderBy: [{ ministry: { code: "asc" } }, { name: "asc" }],
    include: { ministry: true },
  });
  const eventOptions = events.map((e) => ({
    value: e.id,
    label: `${e.ministry?.code ? `${e.ministry.code} · ` : ""}${e.ministry?.name || "Tanpa kementerian"} / ${e.name}`,
  }));

  const breakdown = eventId ? await getEventBreakdown(eventId) : null;
  if (breakdown) {
    return (
      <div className="page-stack">
        <PageHeading
          eyebrow="LAPORAN EVENT"
          title={breakdown.eventName}
          icon={<Landmark size={26} />}
          description={breakdown.ministryName ? `Kementerian ${breakdown.ministryName} · fokus ke satu event tanpa batas periode.` : "Fokus ke satu event tanpa batas periode."}
          action={(
            <div className="page-heading-actions">
              <a className="button button-primary" href={`/event-sheet?event=${eventId}&print=1`} target="_blank" rel="noreferrer">
                <Download size={16} />
                Unduh F4
              </a>
              <Link className="button button-dark" href={`/reports?start=${period.start}&end=${period.end}`}><FileText size={16} /> Semua event</Link>
            </div>
          )}
        />
        <EventReportFilter events={eventOptions} current={eventId} />

        <section className="meeting-metrics-grid">
          <div className="meeting-metric-card"><span>Pemasukan bruto</span><strong className="money-in">{rupiah.format(breakdown.income)}</strong><small>Event basis</small></div>
          <div className="meeting-metric-card"><span>Potongan QRIS</span><strong className="money-fee">{rupiah.format(breakdown.qrisFee)}</strong><small>Akumulasi fee</small></div>
          <div className="meeting-metric-card"><span>Pengeluaran</span><strong className="money-out">{rupiah.format(breakdown.expense)}</strong><small>Event basis</small></div>
          <div className="meeting-metric-card"><span>Arus bersih</span><strong>{rupiah.format(breakdown.net)}</strong><small>Bruto - fee - pengeluaran</small></div>
        </section>

        <section className="guide-grid">
          <article className="panel guide-panel">
            <div className="panel-title"><div><span className="eyebrow">RINCIAN PEMASUKAN</span><h2>Per jenis pemasukan</h2></div></div>
            <div className="responsive-table">
              <table className="report-table responsive-report-table">
                <thead><tr><th>Jenis pemasukan</th><th>Kode</th><th>Jumlah</th></tr></thead>
                <tbody>
                  {breakdown.incomeRows.map((row, i) => (
                    <tr key={i}>
                      <td data-label="Jenis pemasukan"><strong>{row.type}</strong></td>
                      <td data-label="Kode">{row.code ? <span className="code-chip">{row.code}</span> : "—"}</td>
                      <td className="money-in" data-label="Jumlah">{rupiah.format(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel guide-panel">
            <div className="panel-title"><div><span className="eyebrow">RINCIAN PENGELUARAN</span><h2>Per jenis pengeluaran</h2></div></div>
            <div className="responsive-table">
              <table className="report-table responsive-report-table">
                <thead><tr><th>Jenis pengeluaran</th><th>Jumlah</th></tr></thead>
                <tbody>
                  {breakdown.expenseRows.map((row, i) => (
                    <tr key={i}>
                      <td data-label="Jenis pengeluaran"><strong>{row.type}</strong></td>
                      <td className="money-out" data-label="Jumlah">{rupiah.format(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section className="panel table-panel">
          <div className="panel-title"><div><span className="eyebrow">TRANSAKSI</span><h2>Daftar transaksi event ({breakdown.transactionCount})</h2></div></div>
          {breakdown.transactions.length ? (
            <div className="responsive-table">
              <table className="report-table responsive-report-table">
                <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Sumber</th><th>Masuk</th><th>Keluar</th></tr></thead>
                <tbody>
                  {breakdown.transactions.map((row) => (
                    <tr key={row.id}>
                      <td data-label="Tanggal">{dateId.format(new Date(row.date))}</td>
                      <td data-label="Keterangan" className="description-cell">{row.description}</td>
                      <td data-label="Sumber">{sourceLabel[row.source] || row.source}</td>
                      <td className="money-in" data-label="Masuk">{row.direction === "IN" ? `+${rupiah.format(row.amount)}` : ""}</td>
                      <td className="money-out" data-label="Keluar">{row.direction === "OUT" ? `-${rupiah.format(row.amount)}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty />}
        </section>
      </div>
    );
  }

  const data = await getMeetingReportData(period.startDate, period.endDate);
  const query = new URLSearchParams({ start: period.start, end: period.end }).toString();

  const totalIncome = data.ministryRows.reduce((sum, row) => sum + row.income, 0);
  const totalExpense = data.ministryRows.reduce((sum, row) => sum + row.expense, 0);
  const totalEventIncome = data.eventRows.reduce((sum, row) => sum + row.income, 0);
  const totalEventQrisFee = data.eventRows.reduce((sum, row) => sum + row.qrisFee, 0);
  const totalEventExpense = data.eventRows.reduce((sum, row) => sum + row.expense, 0);
  const totalEventNet = data.eventRows.reduce((sum, row) => sum + row.net, 0);

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="LAPORAN ARUS KAS"
        title="Angka yang siap diceritakan."
        icon={<Landmark size={26} />}
        description="Tinjau per kementerian dan event, siapkan ringkasan rapat mingguan, lalu unduh Excel atau lembar F4 siap simpan PDF."
        action={(
          <div className="page-heading-actions">
            <a className="button button-primary" href={`/api/reports/export?${query}`}>
              <Download size={17} />
              Unduh Excel
            </a>
            <a className="button button-dark" href={`/meeting-sheet?${query}&print=1`} target="_blank" rel="noreferrer">
              <FileText size={17} />
              Unduh F4
            </a>
          </div>
        )}
      />

      <ReportFilters start={period.start} end={period.end} />
      <EventReportFilter events={eventOptions} current="" />

      <section className="panel meeting-summary-panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">RINGKASAN RAPAT</span>
            <h2>Materi meeting periode {dateId.format(period.startDate)} – {dateId.format(period.endDate)}</h2>
          </div>
          <a className="button button-dark" href={`/meeting-sheet?${query}`} target="_blank" rel="noreferrer">
            <FileText size={16} />
            Buka lembar F4
          </a>
        </div>

        <div className="meeting-metrics-grid">
          <div className="meeting-metric-card">
            <span>Saldo terkonfirmasi</span>
            <strong>{rupiah.format(data.confirmedTotal)}</strong>
            <small>Mutasi bank + saldo awal</small>
          </div>
          <div className="meeting-metric-card">
            <span>Estimasi QRIS belum cair</span>
            <strong className="money-fee">{rupiah.format(data.qrisPendingNet)}</strong>
            <small>Netto setelah potongan 0,7%</small>
          </div>
          <div className="meeting-metric-card">
            <span>Saldo estimasi total</span>
            <strong>{rupiah.format(data.estimatedTotal)}</strong>
            <small>Dipakai untuk rapat mingguan</small>
          </div>
          <div className="meeting-metric-card">
            <span>Perlu ditinjau</span>
            <strong>{data.unmatchedCount}</strong>
            <small>Belum final di periode ini</small>
          </div>
        </div>

        <div className="meeting-account-grid">
          {data.accountRows.map((account) => (
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
                {account.accountNumber ? `Rek. ${account.accountNumber}` : "Nomor rekening belum terbaca"}
                <br />
                {account.lastMutationAt ? `Mutasi terakhir ${dateId.format(account.lastMutationAt)}` : "Belum ada mutasi bank"}
                {account.staleDays !== null ? ` · jeda ${account.staleDays} hari` : ""}
              </p>
            </article>
          ))}
        </div>

        <div className="meeting-metrics-grid meeting-metrics-grid-secondary">
          <div className="meeting-metric-card">
            <span>Uang masuk rekening</span>
            <strong className="money-in">{rupiah.format(data.bankIncome)}</strong>
            <small>Cash basis · mutasi bank</small>
          </div>
          <div className="meeting-metric-card">
            <span>Uang keluar rekening</span>
            <strong className="money-out">{rupiah.format(data.bankExpense)}</strong>
            <small>Cash basis · mutasi bank</small>
          </div>
          <div className="meeting-metric-card">
            <span>Arus kas bersih</span>
            <strong>{rupiah.format(data.bankNet)}</strong>
            <small>Masuk dikurangi keluar</small>
          </div>
          <div className="meeting-metric-card">
            <span>Pemasukan event <em className="report-mini-tag">Bruto</em></span>
            <strong className="money-in">{rupiah.format(totalEventIncome)}</strong>
            <small>Event basis</small>
          </div>
          <div className="meeting-metric-card">
            <span>Potongan QRIS</span>
            <strong className="money-fee">{rupiah.format(totalEventQrisFee)}</strong>
            <small>Akumulasi fee event</small>
          </div>
          <div className="meeting-metric-card">
            <span>Arus bersih event <em className="report-mini-tag">Netto</em></span>
            <strong>{rupiah.format(totalEventNet)}</strong>
            <small>Bruto - fee - pengeluaran</small>
          </div>
        </div>

        <div className="meeting-highlight-table responsive-table">
          <table className="report-table responsive-report-table">
            <thead>
              <tr>
                <th>Event utama</th>
                <th>Kementerian</th>
                <th>Bruto</th>
                <th>Pot. QRIS</th>
                <th>Keluar</th>
                <th>Netto</th>
              </tr>
            </thead>
            <tbody>
              {data.eventHighlights.length ? data.eventHighlights.map((event) => (
                <tr key={`${event.ministry}-${event.event}`}>
                  <td data-label="Event utama"><strong>{event.event}</strong></td>
                  <td data-label="Kementerian">{event.ministry}</td>
                  <td className="money-in" data-label="Bruto">{rupiah.format(event.income)}</td>
                  <td className="money-fee" data-label="Pot. QRIS">{rupiah.format(event.qrisFee)}</td>
                  <td className="money-out" data-label="Keluar">{rupiah.format(event.expense)}</td>
                  <td data-label="Netto"><strong>{rupiah.format(event.net)}</strong></td>
                </tr>
              )) : (
                <tr>
                  <td data-label="Event utama" colSpan={6}>Belum ada event terverifikasi pada periode ini.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-summary">
        <div>
          <span>Total pemasukan <em className="report-mini-tag">Bruto</em></span>
          <strong className="money-in">{rupiah.format(totalIncome)}</strong>
        </div>
        <div>
          <span>Total pengeluaran</span>
          <strong className="money-out">{rupiah.format(totalExpense)}</strong>
        </div>
        <div>
          <span>Arus kas bersih <em className="report-mini-tag">Netto</em></span>
          <strong>{rupiah.format(totalIncome - totalExpense)}</strong>
        </div>
      </section>

      <section className="panel table-panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">REKAP UTAMA</span>
            <h2>Arus kas per kementerian</h2>
          </div>
        </div>
        {data.ministryRows.length ? (
          <div className="responsive-table">
            <table className="report-table responsive-report-table">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Kementerian</th>
                  <th>Pemasukan</th>
                  <th>Pengeluaran</th>
                  <th>Arus bersih</th>
                </tr>
              </thead>
              <tbody>
                {data.ministryRows.map((row) => (
                  <tr key={row.code}>
                    <td data-label="Kode"><span className="ministry-code">{row.code}</span></td>
                    <td data-label="Kementerian"><strong>{row.ministry}</strong></td>
                    <td className="money-in" data-label="Pemasukan">{rupiah.format(row.income)}</td>
                    <td className="money-out" data-label="Pengeluaran">{rupiah.format(row.expense)}</td>
                    <td data-label="Arus bersih"><strong>{rupiah.format(row.net)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty />}
      </section>

      <section className="panel table-panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">RINCIAN KEGIATAN</span>
            <h2>Arus kas per event <small className="report-title-note">Bruto → Potongan → Netto</small></h2>
          </div>
        </div>

        <div className="report-summary panel-report-summary">
          <div>
            <span>Pemasukan event <em className="report-mini-tag">Bruto</em></span>
            <strong className="money-in">{rupiah.format(totalEventIncome)}</strong>
          </div>
          <div>
            <span>Akumulasi potongan QRIS</span>
            <strong className="money-fee">{rupiah.format(totalEventQrisFee)}</strong>
          </div>
          <div>
            <span>Pengeluaran event</span>
            <strong className="money-out">{rupiah.format(totalEventExpense)}</strong>
          </div>
          <div>
            <span>Arus bersih event <em className="report-mini-tag">Netto</em></span>
            <strong>{rupiah.format(totalEventNet)}</strong>
          </div>
        </div>

        {data.eventRows.length ? (
          <div className="responsive-table">
            <table className="report-table event-report">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Kementerian</th>
                  <th>Jenis pemasukan</th>
                  <th>Kode</th>
                  <th>Pemasukan<br /><small>Bruto</small></th>
                  <th>Potongan QRIS</th>
                  <th>Pengeluaran</th>
                  <th>Arus bersih<br /><small>Netto</small></th>
                </tr>
              </thead>
              <tbody>
                {data.eventRows.flatMap((event) =>
                  event.incomeRows.map((income, index) => (
                    <tr key={`${event.event}-${income.type}-${index}`}>
                      {index === 0 && <td rowSpan={event.incomeRows.length} data-label="Event"><strong>{event.event}</strong></td>}
                      {index === 0 && <td rowSpan={event.incomeRows.length} data-label="Kementerian">{event.ministry}</td>}
                      <td data-label="Jenis pemasukan">{income.type}</td>
                      <td data-label="Kode">{income.code ? <span className="code-chip">{income.code}</span> : "—"}</td>
                      <td className="money-in" data-label="Pemasukan">{rupiah.format(income.amount)}</td>
                      {index === 0 && <td rowSpan={event.incomeRows.length} className="money-fee" data-label="Potongan QRIS">{rupiah.format(event.qrisFee)}</td>}
                      {index === 0 && <td rowSpan={event.incomeRows.length} className="money-out" data-label="Pengeluaran">{rupiah.format(event.expense)}</td>}
                      {index === 0 && <td rowSpan={event.incomeRows.length} data-label="Arus bersih"><strong>{rupiah.format(event.net)}</strong></td>}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        ) : <Empty />}
      </section>
    </div>
  );
}

function Empty() {
  return (
    <div className="empty-state">
      <span>∅</span>
      <p>Belum ada transaksi terverifikasi pada periode ini.</p>
    </div>
  );
}
