import { Download, FileText, Landmark, ReceiptText } from "lucide-react";
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

/** Tautan teks di dalam paragraf — globals.css sengaja membuat semua <a> mewarisi warna teks. */
const inlineLinkStyle = { color: "var(--orange)", fontWeight: 800 } as const;

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
          <div className="meeting-metric-card"><span>Pemasukan bruto</span><strong className="money-in">{rupiah.format(breakdown.income)}</strong><small>Basis sama dengan tabel laporan: transaksi terverifikasi saja</small></div>
          <div className="meeting-metric-card"><span>Potongan QRIS</span><strong className="money-fee">{rupiah.format(breakdown.qrisFee)}</strong><small>Akumulasi fee 0,7% per transaksi</small></div>
          <div className="meeting-metric-card"><span>Pengeluaran</span><strong className="money-out">{rupiah.format(breakdown.expense)}</strong><small>Transaksi terverifikasi saja</small></div>
          <div className="meeting-metric-card"><span>Arus bersih</span><strong>{rupiah.format(breakdown.net)}</strong><small>Bruto - fee - pengeluaran</small></div>
        </section>

        {breakdown.pending.total.count > 0 && (
          <article className="guide-callout tone-warn">
            <strong>{breakdown.pending.total.count} transaksi event ini belum masuk hitungan di atas</strong>
            <p>
              Angka event di halaman ini memakai basis yang sama persis dengan tabel laporan, yaitu hanya transaksi
              yang sudah terverifikasi. Yang belum ikut terhitung:{" "}
              <b>{breakdown.pending.unmatched.count} transaksi belum ditinjau</b> (masuk {rupiah.format(breakdown.pending.unmatched.income)}, keluar {rupiah.format(breakdown.pending.unmatched.expense)})
              {breakdown.pending.skipped.count > 0 ? (
                <> dan <b>{breakdown.pending.skipped.count} transaksi dilewati</b> (masuk {rupiah.format(breakdown.pending.skipped.income)}, keluar {rupiah.format(breakdown.pending.skipped.expense)})</>
              ) : null}
              . Neto yang belum terhitung {rupiah.format(breakdown.pending.total.net)}.{" "}
              <Link style={inlineLinkStyle} href={`/transactions?status=UNMATCHED&eventId=${eventId}`}>Tinjau transaksi event ini →</Link>
            </p>
          </article>
        )}

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
          <div className="panel-title"><div><span className="eyebrow">TRANSAKSI</span><h2>Daftar transaksi event ({breakdown.transactionCount}) <small className="report-title-note">Hanya yang sudah terverifikasi</small></h2></div></div>
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
  const totalMinistryQrisFee = data.ministryRows.reduce((sum, row) => sum + row.qrisFee, 0);
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
                  <small>Saldo awal</small>
                  <strong>{rupiah.format(account.openingBalance)}</strong>
                </div>
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
            <span>Uang masuk rekening <em className="report-mini-tag">Semua status</em></span>
            <strong className="money-in">{rupiah.format(data.bankIncome)}</strong>
            <small>Seluruh mutasi bank di periode ini, terverifikasi maupun belum</small>
          </div>
          <div className="meeting-metric-card">
            <span>Uang keluar rekening <em className="report-mini-tag">Semua status</em></span>
            <strong className="money-out">{rupiah.format(data.bankExpense)}</strong>
            <small>Seluruh mutasi bank di periode ini, terverifikasi maupun belum</small>
          </div>
          <div className="meeting-metric-card">
            <span>Arus kas bersih rekening</span>
            <strong>{rupiah.format(data.bankNet)}</strong>
            <small>Masuk dikurangi keluar · wajar berbeda dari total laporan di bawah</small>
          </div>
          <div className="meeting-metric-card">
            <span>Pemasukan event <em className="report-mini-tag">Bruto</em></span>
            <strong className="money-in">{rupiah.format(totalEventIncome)}</strong>
            <small>Hanya transaksi terverifikasi yang sudah punya event</small>
          </div>
          <div className="meeting-metric-card">
            <span>Potongan QRIS</span>
            <strong className="money-fee">{rupiah.format(totalEventQrisFee)}</strong>
            <small>Akumulasi fee 0,7% per transaksi</small>
          </div>
          <div className="meeting-metric-card">
            <span>Arus bersih event <em className="report-mini-tag">Netto</em></span>
            <strong>{rupiah.format(totalEventNet)}</strong>
            <small>Bruto - fee - pengeluaran</small>
          </div>
        </div>

        <div className="meeting-highlight-table">
          <article className="guide-callout">
            <strong>Kenapa angka rekening dan angka laporan tidak sama?</strong>
            <p>
              Kartu <em>rekening</em> di atas memakai basis kas: semua mutasi bank yang masuk di periode ini, tanpa
              memandang statusnya. Tabel laporan di bawah memakai basis pelaporan: hanya transaksi yang sudah
              diverifikasi dan diberi kementerian. Keduanya memang tidak dirancang untuk sama —
              selisihnya dijelaskan pada panel rekonsiliasi.
            </p>
          </article>
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
          <span>Total pemasukan laporan <em className="report-mini-tag">Bruto</em></span>
          <strong className="money-in">{rupiah.format(totalIncome)}</strong>
        </div>
        <div>
          <span>Total pengeluaran laporan</span>
          <strong className="money-out">{rupiah.format(totalExpense)}</strong>
        </div>
        <div>
          <span>Selisih masuk - keluar <em className="report-mini-tag">Bruto</em></span>
          <strong>{rupiah.format(totalIncome - totalExpense)}</strong>
        </div>
        <div>
          <span>Setelah potongan QRIS <em className="report-mini-tag">Netto</em></span>
          <strong>{rupiah.format(totalIncome - totalMinistryQrisFee - totalExpense)}</strong>
        </div>
      </section>

      <section className="panel table-panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">REKONSILIASI</span>
            <h2>Belum masuk laporan <small className="report-title-note">Uangnya bergerak, angkanya belum terhitung</small></h2>
          </div>
          <Link className="button button-dark" href="/transactions?status=UNMATCHED">
            <ReceiptText size={16} />
            Tinjau sekarang
          </Link>
        </div>

        <div className="meeting-metrics-grid">
          <div className="meeting-metric-card">
            <span>Belum ditinjau <em className="report-mini-tag">Unmatched</em></span>
            <strong>{data.unassigned.unmatched.count} transaksi</strong>
            <small>
              Masuk {rupiah.format(data.unassigned.unmatched.income)} · Keluar {rupiah.format(data.unassigned.unmatched.expense)}
              <br />Neto {rupiah.format(data.unassigned.unmatched.net)}
            </small>
          </div>
          <div className="meeting-metric-card">
            <span>Sengaja dilewati <em className="report-mini-tag">Skipped</em></span>
            <strong>{data.unassigned.skipped.count} transaksi</strong>
            <small>
              Masuk {rupiah.format(data.unassigned.skipped.income)} · Keluar {rupiah.format(data.unassigned.skipped.expense)}
              <br />Neto {rupiah.format(data.unassigned.skipped.net)}
            </small>
          </div>
          <div className="meeting-metric-card">
            <span>Terverifikasi tanpa kementerian</span>
            <strong>{data.totals.untagged.count} transaksi</strong>
            <small>
              Neto {rupiah.format(data.totals.untagged.net)}
              <br />Tidak muncul di tabel kementerian maupun tabel event
            </small>
          </div>
          <div className="meeting-metric-card">
            <span>Terverifikasi tanpa event</span>
            <strong>{rupiah.format(data.totals.nonEvent.net)}</strong>
            <small>
              Masuk {rupiah.format(data.totals.nonEvent.income)} · Keluar {rupiah.format(data.totals.nonEvent.expense)}
              <br />Masuk tabel kementerian, tidak masuk tabel event
            </small>
          </div>
        </div>

        <p className="table-panel-note" style={{ paddingTop: "1rem" }}>
          {data.unassigned.total.count > 0 ? (
            <>
              <b>Total laporan di bawah BELUM mencakup {data.unassigned.total.count} transaksi ini</b> (neto {rupiah.format(data.unassigned.total.net)}).
              Selama masih ada baris di sini, total laporan memang tidak akan sama dengan mutasi rekening — dan itu bukan berarti laporannya salah.{" "}
              <Link style={inlineLinkStyle} href="/transactions?status=UNMATCHED">Buka daftar transaksi belum ditinjau →</Link>
            </>
          ) : (
            <>Semua transaksi periode ini sudah ditinjau. Sisa selisih terhadap mutasi rekening hanya berasal dari transaksi terverifikasi yang belum diberi kementerian atau event (dua kartu terakhir di atas).</>
          )}
          <br />
          Catatan basis: tabel <em>per kementerian</em> menghitung semua transaksi terverifikasi yang punya kementerian, termasuk yang belum diberi event;
          tabel <em>per event</em> hanya menghitung yang sudah punya event. Karena itu total kedua tabel memang berbeda, tepat sebesar angka pada dua kartu terakhir di atas.
          Bandingkan kolom &ldquo;Netto&rdquo; di kedua tabel — kolom &ldquo;Bruto&rdquo; belum dikurangi potongan QRIS.
        </p>
      </section>

      <section className="panel table-panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">REKAP UTAMA</span>
            <h2>Arus kas per kementerian <small className="report-title-note">Termasuk transaksi tanpa event</small></h2>
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
                  <th>Potongan QRIS</th>
                  <th>Arus bersih<br /><small>Bruto</small></th>
                  <th>Arus bersih<br /><small>Netto</small></th>
                </tr>
              </thead>
              <tbody>
                {data.ministryRows.map((row) => (
                  <tr key={row.code}>
                    <td data-label="Kode"><span className="ministry-code">{row.code}</span></td>
                    <td data-label="Kementerian"><strong>{row.ministry}</strong></td>
                    <td className="money-in" data-label="Pemasukan">{rupiah.format(row.income)}</td>
                    <td className="money-out" data-label="Pengeluaran">{rupiah.format(row.expense)}</td>
                    <td className="money-fee" data-label="Potongan QRIS">{rupiah.format(row.qrisFee)}</td>
                    <td data-label="Arus bersih bruto">{rupiah.format(row.net)}</td>
                    <td data-label="Arus bersih netto"><strong>{rupiah.format(row.netAfterFee)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty />}
        <p className="table-panel-note">
          Kolom <em>Bruto</em> belum dikurangi potongan QRIS, kolom <em>Netto</em> sudah — angka Netto inilah yang sebanding dengan
          &ldquo;Arus bersih&rdquo; pada tabel event di bawah. Ekspor Excel masih memakai kolom Bruto.
        </p>
      </section>

      <section className="panel table-panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">RINCIAN KEGIATAN</span>
            <h2>Arus kas per event <small className="report-title-note">Bruto → Potongan → Netto · hanya transaksi yang punya event</small></h2>
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
        <p className="table-panel-note">
          Tabel ini hanya memuat transaksi terverifikasi yang sudah diberi event, sehingga totalnya lebih kecil dari tabel per kementerian.
          Baris jenis pemasukan bertanda &ldquo;—&rdquo; bernilai nol dan hanya penanda bahwa event tersebut belum punya pemasukan.
        </p>
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
