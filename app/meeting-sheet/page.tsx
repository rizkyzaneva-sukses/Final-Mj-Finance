import { redirect } from "next/navigation";
import { MeetingSheetActions } from "@/components/meeting-sheet-actions";
import { MeetingSheetScaler } from "@/components/meeting-sheet-scaler";
import { getSession } from "@/lib/auth";
import { dateId, periodBounds, rupiah } from "@/lib/format";
import { getMeetingReportData } from "@/lib/meeting-report";

export const dynamic = "force-dynamic";
type Params = Promise<{ start?: string; end?: string; print?: string }>;

export default async function MeetingSheetPage({ searchParams }: { searchParams: Params }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const period = periodBounds(params.start, params.end);
  const data = await getMeetingReportData(period.startDate, period.endDate);
  const backHref = `/reports?${new URLSearchParams({ start: period.start, end: period.end }).toString()}`;
  const autoPrint = params.print === "1";
  const totalEventIncome = data.eventRows.reduce((sum, row) => sum + row.income, 0);
  const totalEventQrisFee = data.eventRows.reduce((sum, row) => sum + row.qrisFee, 0);
  const totalEventNet = data.eventRows.reduce((sum, row) => sum + row.net, 0);

  return (
    <main className="meeting-sheet-page">
      <MeetingSheetScaler />
      <MeetingSheetActions autoPrint={autoPrint} backHref={backHref} />

      <article className="meeting-sheet-paper">
        <header className="meeting-sheet-header">
          <div>
            <div className="eyebrow">RINGKASAN RAPAT MINGGUAN</div>
            <h1>MUDA JUARA Finance</h1>
            <p>Periode {dateId.format(period.startDate)} s/d {dateId.format(period.endDate)}</p>
          </div>
          <div className="meeting-sheet-meta">
            <strong>Cash basis</strong>
            <span>Mutasi bank + saldo awal</span>
            <strong>Event basis</strong>
            <span>QRIS detail & transaksi ter-assign event</span>
          </div>
        </header>

        <section className="meeting-sheet-grid meeting-sheet-grid-four">
          <div className="meeting-sheet-card">
            <span>Saldo terkonfirmasi</span>
            <strong>{rupiah.format(data.confirmedTotal)}</strong>
            <small>Gabungan semua rekening</small>
          </div>
          <div className="meeting-sheet-card">
            <span>Estimasi QRIS belum cair</span>
            <strong className="money-fee">{rupiah.format(data.qrisPendingNet)}</strong>
            <small>Netto setelah potongan 0,7%</small>
          </div>
          <div className="meeting-sheet-card">
            <span>Saldo estimasi total</span>
            <strong>{rupiah.format(data.estimatedTotal)}</strong>
            <small>Saldo konfirmasi + estimasi QRIS</small>
          </div>
          <div className="meeting-sheet-card">
            <span>Perlu ditinjau</span>
            <strong>{data.unmatchedCount}</strong>
            <small>Transaksi belum final pada periode ini</small>
          </div>
        </section>

        <section className="meeting-sheet-two-col">
          <div className="meeting-sheet-box">
            <div className="meeting-sheet-box-title">Posisi rekening</div>
            <div className="meeting-sheet-account-list">
              {data.accountRows.map((account) => (
                <div className="meeting-sheet-account" key={account.label}>
                  <div className="meeting-sheet-account-head">
                    <strong>{account.label}</strong>
                    <span>{account.accountNumber ? `Rek. ${account.accountNumber}` : "Nomor rekening belum terbaca"}</span>
                  </div>
                  <div className="meeting-sheet-account-values">
                    <div>
                      <small>Saldo terkonfirmasi</small>
                      <b>{rupiah.format(account.confirmedBalance)}</b>
                    </div>
                    <div>
                      <small>Tambah estimasi QRIS</small>
                      <b className="money-fee">{rupiah.format(account.qrisEstimateNet)}</b>
                    </div>
                    <div>
                      <small>Saldo estimasi</small>
                      <b>{rupiah.format(account.estimatedBalance)}</b>
                    </div>
                  </div>
                  <small className="meeting-sheet-note">
                    {account.lastMutationAt ? `Mutasi terakhir ${dateId.format(account.lastMutationAt)}` : "Belum ada mutasi bank"}
                    {account.staleDays !== null ? ` · jeda ${account.staleDays} hari` : ""}
                  </small>
                </div>
              ))}
            </div>
          </div>

          <div className="meeting-sheet-box">
            <div className="meeting-sheet-box-title">Arus minggu ini</div>
            <div className="meeting-sheet-stat-list">
              <div>
                <span>Uang masuk rekening</span>
                <strong className="money-in">{rupiah.format(data.bankIncome)}</strong>
              </div>
              <div>
                <span>Uang keluar rekening</span>
                <strong className="money-out">{rupiah.format(data.bankExpense)}</strong>
              </div>
              <div>
                <span>Arus kas bersih</span>
                <strong>{rupiah.format(data.bankNet)}</strong>
              </div>
              <div>
                <span>Pemasukan event bruto</span>
                <strong className="money-in">{rupiah.format(totalEventIncome)}</strong>
              </div>
              <div>
                <span>Potongan QRIS</span>
                <strong className="money-fee">{rupiah.format(totalEventQrisFee)}</strong>
              </div>
              <div>
                <span>Arus bersih event</span>
                <strong>{rupiah.format(totalEventNet)}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="meeting-sheet-box">
          <div className="meeting-sheet-box-title">Event yang paling menonjol</div>
          <table className="meeting-sheet-table">
            <thead>
              <tr>
                <th>Event</th>
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
                  <td>{event.event}</td>
                  <td>{event.ministry}</td>
                  <td className="money-in">{rupiah.format(event.income)}</td>
                  <td className="money-fee">{rupiah.format(event.qrisFee)}</td>
                  <td className="money-out">{rupiah.format(event.expense)}</td>
                  <td>{rupiah.format(event.net)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6}>Belum ada event terverifikasi pada periode ini.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="meeting-sheet-footer">
          <div className="meeting-sheet-box">
            <div className="meeting-sheet-box-title">Catatan baca angka</div>
            <ul>
              <li>Saldo terkonfirmasi hanya memakai mutasi bank dan saldo awal.</li>
              <li>Estimasi QRIS dipakai khusus untuk Sugiarsa, dengan asumsi rekening ini tidak punya transaksi lain di luar pencairan QRIS.</li>
              <li>Estimasi QRIS dihitung dari transaksi QRIS setelah mutasi terakhir, lalu dipotong admin 0,7%.</li>
            </ul>
          </div>
        </section>
      </article>
    </main>
  );
}
