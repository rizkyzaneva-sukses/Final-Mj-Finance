import { redirect } from "next/navigation";
import { MeetingSheetActions } from "@/components/meeting-sheet-actions";
import { getSession } from "@/lib/auth";
import { dateId, rupiah } from "@/lib/format";
import { getEventBreakdown } from "@/lib/reports";

export const dynamic = "force-dynamic";
type Params = Promise<{ event?: string; print?: string }>;

const sourceLabel: Record<string, string> = {
  QRIS_XLSX: "QRIS",
  BANK_PDF: "Mutasi PDF",
  BANK_SCREENSHOT: "Screenshot",
  MANUAL: "Manual",
};

export default async function EventSheetPage({ searchParams }: { searchParams: Params }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const eventId = params.event || "";
  const autoPrint = params.print === "1";
  const breakdown = eventId ? await getEventBreakdown(eventId) : null;

  if (!breakdown) {
    return (
      <main className="meeting-sheet-page">
        <MeetingSheetActions autoPrint={false} backHref="/reports" />
        <article className="meeting-sheet-paper">
          <p>Event tidak ditemukan.</p>
        </article>
      </main>
    );
  }

  return (
    <main className="meeting-sheet-page">
      <MeetingSheetActions autoPrint={autoPrint} backHref={`/reports?event=${eventId}`} />

      <article className="meeting-sheet-paper">
        <header className="meeting-sheet-header">
          <div>
            <div className="eyebrow">LAPORAN EVENT</div>
            <h1>{breakdown.eventName}</h1>
            <p>{breakdown.ministryName ? `Kementerian ${breakdown.ministryName}` : "MUDA JUARA Finance"} · Sepanjang waktu</p>
          </div>
          <div className="meeting-sheet-meta">
            <strong>Event basis</strong>
            <span>Pemasukan, potongan & pengeluaran event</span>
          </div>
        </header>

        <section className="meeting-sheet-grid meeting-sheet-grid-four">
          <div className="meeting-sheet-card">
            <span>Pemasukan bruto</span>
            <strong className="money-in">{rupiah.format(breakdown.income)}</strong>
            <small>Event basis</small>
          </div>
          <div className="meeting-sheet-card">
            <span>Potongan QRIS</span>
            <strong className="money-fee">{rupiah.format(breakdown.qrisFee)}</strong>
            <small>Netto setelah potongan 0,7%</small>
          </div>
          <div className="meeting-sheet-card">
            <span>Pengeluaran</span>
            <strong className="money-out">{rupiah.format(breakdown.expense)}</strong>
            <small>Event basis</small>
          </div>
          <div className="meeting-sheet-card">
            <span>Arus bersih</span>
            <strong>{rupiah.format(breakdown.net)}</strong>
            <small>Bruto - fee - pengeluaran</small>
          </div>
        </section>

        <section className="meeting-sheet-two-col">
          <div className="meeting-sheet-box">
            <div className="meeting-sheet-box-title">Rincian pemasukan</div>
            <table className="meeting-sheet-table">
              <thead><tr><th>Jenis pemasukan</th><th>Kode</th><th>Jumlah</th></tr></thead>
              <tbody>
                {breakdown.incomeRows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.type}</td>
                    <td>{row.code ? row.code : "—"}</td>
                    <td className="money-in">{rupiah.format(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="meeting-sheet-box">
            <div className="meeting-sheet-box-title">Rincian pengeluaran</div>
            <table className="meeting-sheet-table">
              <thead><tr><th>Jenis pengeluaran</th><th>Jumlah</th></tr></thead>
              <tbody>
                {breakdown.expenseRows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.type}</td>
                    <td className="money-out">{rupiah.format(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="meeting-sheet-box">
          <div className="meeting-sheet-box-title">Daftar transaksi ({breakdown.transactionCount})</div>
          <table className="meeting-sheet-table">
            <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Sumber</th><th>Masuk</th><th>Keluar</th></tr></thead>
            <tbody>
              {breakdown.transactions.length ? breakdown.transactions.map((row) => (
                <tr key={row.id}>
                  <td>{dateId.format(new Date(row.date))}</td>
                  <td>{row.description}</td>
                  <td>{sourceLabel[row.source] || row.source}</td>
                  <td className="money-in">{row.direction === "IN" ? `+${rupiah.format(row.amount)}` : ""}</td>
                  <td className="money-out">{row.direction === "OUT" ? `-${rupiah.format(row.amount)}` : ""}</td>
                </tr>
              )) : (
                <tr><td colSpan={5}>Belum ada transaksi untuk event ini.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </article>
    </main>
  );
}
