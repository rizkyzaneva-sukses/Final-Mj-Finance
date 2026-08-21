import { ArrowDownLeft, ArrowUpRight, BarChart3, Wallet } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { MensosFilters } from "@/components/mensos-filters";
import { MensosTransactionTable } from "@/components/mensos-transaction-table";
import { EventDocumentManager } from "@/components/event-document-manager";
import { compactRupiah, rupiah } from "@/lib/format";
import { roundMoney } from "@/lib/money";
import { loadMinistryPortal } from "@/lib/ministry-portal";

export async function MinistryPortalView({
  ministry,
  basePath,
  eyebrow,
  startParam,
  endParam,
}: {
  ministry: { id: string; code: number; name: string };
  basePath: string;
  eyebrow?: string;
  startParam?: string;
  endParam?: string;
}) {
  const data = await loadMinistryPortal(ministry.id, startParam, endParam);
  const title = `Ringkasan ${ministry.name}`;
  const headingEyebrow = eyebrow || `KEMENTERIAN · KODE ${ministry.code}`;

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow={headingEyebrow}
        title={title}
        icon={<BarChart3 size={26} />}
        description={`Dashboard khusus data ${ministry.name}. Filter rentang tanggal dan unggah dokumentasi struk/bon per program.`}
      />

      <MensosFilters start={data.start} end={data.end} basePath={basePath} />

      <section className="stats-grid">
        <article className="stat-card stat-balance">
          <div className="stat-icon"><Wallet /></div>
          <span>Saldo Terkini</span>
          <strong>{compactRupiah.format(data.saldoTerkini)}</strong>
          <small>Akumulasi seluruh waktu · pemasukan dikurangi fee QRIS & pengeluaran</small>
        </article>
        <article className="stat-card" style={{ background: "var(--mint, #d4f5e9)" }}>
          <div className="stat-icon"><ArrowDownLeft /></div>
          <span>Saldo Masuk</span>
          <strong>{compactRupiah.format(data.saldoMasuk)}</strong>
          <small>Total pemasukan kumulatif {ministry.name}</small>
        </article>
        <article className="stat-card stat-expense">
          <div className="stat-icon"><ArrowUpRight /></div>
          <span>Saldo Dialokasikan</span>
          <strong>{compactRupiah.format(data.saldoDialokasikan)}</strong>
          <small>Total pengeluaran periode terpilih</small>
        </article>
      </section>

      <section className="meeting-metrics-grid" style={{ padding: 0 }}>
        <article className="meeting-metric-card">
          <span>Pemasukan periode</span>
          <strong className="money-in">{rupiah.format(data.periodIncome)}</strong>
          <small>Seluruh sumber · termasuk QRIS</small>
        </article>
        <article className="meeting-metric-card">
          <span>Pengeluaran periode</span>
          <strong className="money-out">{rupiah.format(data.periodExpense)}</strong>
          <small>Seluruh kegiatan</small>
        </article>
        <article className="meeting-metric-card">
          <span>Potongan QRIS 0,7%</span>
          <strong className="money-fee">{rupiah.format(data.periodQrisFee)}</strong>
          <small>Akumulasi per transaksi QRIS</small>
        </article>
        <article className="meeting-metric-card">
          <span>Arus bersih periode</span>
          <strong className={roundMoney(data.periodIncome - data.periodQrisFee - data.periodExpense) < 0 ? "money-out" : "money-in"}>
            {rupiah.format(roundMoney(data.periodIncome - data.periodQrisFee - data.periodExpense))}
          </strong>
          <small>Pemasukan - fee - pengeluaran</small>
        </article>
      </section>

      <section className="panel table-panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">RINGKASAN PER PROGRAM</span>
            <h2>Pemasukan & pengeluaran per kegiatan</h2>
          </div>
        </div>
        {data.eventRows.some((row) => row.income || row.expense || row.transactionCount > 0) ? (
          <div className="responsive-table">
            <table className="report-table responsive-report-table">
              <thead>
                <tr>
                  <th>Kegiatan</th>
                  <th>Kategori</th>
                  <th>Dokumen</th>
                  <th>Pemasukan</th>
                  <th>Fee QRIS</th>
                  <th>Pengeluaran</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {data.eventRows.filter((row) => row.income || row.expense || row.transactionCount > 0).map((row) => (
                  <tr key={row.id}>
                    <td data-label="Kegiatan"><strong>{row.name}</strong></td>
                    <td data-label="Kategori">{row.category || "—"}</td>
                    <td data-label="Dokumen">{row.documentCount || "—"}</td>
                    <td className="money-in" data-label="Pemasukan">{rupiah.format(row.income)}</td>
                    <td className="money-fee" data-label="Fee QRIS">{row.qrisFee ? rupiah.format(row.qrisFee) : "—"}</td>
                    <td className="money-out" data-label="Pengeluaran">{rupiah.format(row.expense)}</td>
                    <td data-label="Net"><strong className={row.net < 0 ? "money-out" : "money-in"}>{rupiah.format(row.net)}</strong></td>
                  </tr>
                ))}
                {data.hasNonEvent && (
                  <tr>
                    <td data-label="Kegiatan"><em>Tanpa kegiatan</em></td>
                    <td data-label="Kategori">—</td>
                    <td data-label="Dokumen">—</td>
                    <td className="money-in" data-label="Pemasukan">{rupiah.format(data.nonEventIncome)}</td>
                    <td className="money-fee" data-label="Fee QRIS">{data.nonEventQrisFee ? rupiah.format(data.nonEventQrisFee) : "—"}</td>
                    <td className="money-out" data-label="Pengeluaran">{rupiah.format(data.nonEventExpense)}</td>
                    <td data-label="Net">
                      <strong className={data.nonEventIncome - data.nonEventQrisFee - data.nonEventExpense < 0 ? "money-out" : "money-in"}>
                        {rupiah.format(roundMoney(data.nonEventIncome - data.nonEventQrisFee - data.nonEventExpense))}
                      </strong>
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}><strong>Total periode</strong></td>
                  <td className="money-in"><strong>{rupiah.format(data.periodIncome)}</strong></td>
                  <td className="money-fee"><strong>{rupiah.format(data.periodQrisFee)}</strong></td>
                  <td className="money-out"><strong>{rupiah.format(data.periodExpense)}</strong></td>
                  <td>
                    <strong className={roundMoney(data.periodIncome - data.periodQrisFee - data.periodExpense) < 0 ? "money-out" : "money-in"}>
                      {rupiah.format(roundMoney(data.periodIncome - data.periodQrisFee - data.periodExpense))}
                    </strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="empty-state"><span>MJ</span><p>Belum ada transaksi {ministry.name} pada periode ini.</p></div>
        )}
        <p className="table-panel-note">Hanya menampilkan transaksi MATCHED. Fee QRIS 0,7% dipotong per transaksi.</p>
      </section>

      {data.eventRows.map((event) => (
        <section className="panel table-panel" key={event.id}>
          <div className="panel-title">
            <div>
              <span className="eyebrow">RINCIAN KEGIATAN</span>
              <h2>{event.name}</h2>
            </div>
            <span className={`ministry-code ${event.net < 0 ? "money-out" : "money-in"}`}>
              Net: {rupiah.format(event.net)}
            </span>
          </div>
          <div className="responsive-table" style={{ marginBottom: "1rem" }}>
            <table className="report-table responsive-report-table">
              <thead>
                <tr>
                  <th>Jenis Pemasukan</th>
                  <th>Kode</th>
                  <th>Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {event.incomeRows.length ? event.incomeRows.map((row, i) => (
                  <tr key={i}>
                    <td data-label="Jenis">{row.name}</td>
                    <td data-label="Kode">{row.code || "—"}</td>
                    <td className="money-in" data-label="Jumlah">{rupiah.format(row.amount)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={3} style={{ opacity: 0.6 }}>Belum ada pemasukan pada periode ini.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {event.expenseRows.length > 0 && (
            <div className="responsive-table" style={{ marginBottom: "1rem" }}>
              <table className="report-table responsive-report-table">
                <thead>
                  <tr>
                    <th>Jenis Pengeluaran</th>
                    <th>Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {event.expenseRows.map((row, i) => (
                    <tr key={i}>
                      <td data-label="Jenis">{row.name}</td>
                      <td className="money-out" data-label="Jumlah">{rupiah.format(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <MensosTransactionTable transactions={event.transactions} />
          <div style={{ marginTop: "1rem" }}>
            <EventDocumentManager eventId={event.id} eventName={event.name} initialCount={event.documentCount} />
          </div>
        </section>
      ))}

      {data.hasNonEvent && data.nonEventDetailTx.length > 0 && (
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">RINCIAN</span>
              <h2>Transaksi tanpa kegiatan</h2>
            </div>
            <span className={`ministry-code ${roundMoney(data.nonEventIncome - data.nonEventQrisFee - data.nonEventExpense) < 0 ? "money-out" : "money-in"}`}>
              Net: {rupiah.format(roundMoney(data.nonEventIncome - data.nonEventQrisFee - data.nonEventExpense))}
            </span>
          </div>
          <MensosTransactionTable transactions={data.nonEventDetailTx} />
        </section>
      )}

      {data.eventAllTimeRows.length > 0 && (
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">AKUMULASI SELURUH WAKTU</span>
              <h2>Total per program sepanjang sejarah</h2>
            </div>
          </div>
          <div className="responsive-table">
            <table className="report-table responsive-report-table">
              <thead>
                <tr>
                  <th>Program</th>
                  <th>Total Masuk</th>
                  <th>Fee QRIS</th>
                  <th>Total Keluar</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {data.eventAllTimeRows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Program"><strong>{row.name}</strong></td>
                    <td className="money-in" data-label="Total Masuk">{rupiah.format(row.income)}</td>
                    <td className="money-fee" data-label="Fee QRIS">{row.qrisFee ? rupiah.format(row.qrisFee) : "—"}</td>
                    <td className="money-out" data-label="Total Keluar">{rupiah.format(row.expense)}</td>
                    <td data-label="Net"><strong className={row.net < 0 ? "money-out" : "money-in"}>{rupiah.format(row.net)}</strong></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>Total</strong></td>
                  <td className="money-in"><strong>{rupiah.format(data.allTimeIncome)}</strong></td>
                  <td className="money-fee"><strong>{rupiah.format(data.allTimeQrisFee)}</strong></td>
                  <td className="money-out"><strong>{rupiah.format(data.allTimeExpense)}</strong></td>
                  <td><strong className={data.saldoTerkini < 0 ? "money-out" : "money-in"}>{rupiah.format(data.saldoTerkini)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="table-panel-note">Basis sama dengan kartu Saldo Terkini di atas. Hanya transaksi MATCHED yang dihitung.</p>
        </section>
      )}
    </div>
  );
}
