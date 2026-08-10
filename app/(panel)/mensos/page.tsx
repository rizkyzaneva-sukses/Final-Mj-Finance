import { redirect } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, BarChart3, Wallet } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { MensosFilters } from "@/components/mensos-filters";
import { MensosTransactionTable } from "@/components/mensos-transaction-table";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { compactRupiah, periodBounds, rupiah } from "@/lib/format";
import { excludeOpeningBalanceWhere } from "@/lib/accounts";
import { qrisFeeFor, roundMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ start?: string; end?: string }>;

const MENSOS_CODE = 4;

export default async function MensosDashboard({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "MENSOS") redirect("/dashboard");

  const params = await searchParams;
  const { startDate, endDate, start, end } = periodBounds(params.start, params.end);

  const mensos = await db.ministry.findUnique({ where: { code: MENSOS_CODE } });

  if (!mensos) {
    return (
      <div className="page-stack">
        <PageHeading
          eyebrow="KEMENSOS 26 SEJAHTERA"
          title="Data belum tersedia"
          icon={<BarChart3 size={26} />}
          description="Kementerian Sosial belum terdaftar di master data."
        />
      </div>
    );
  }

  const [
    allTimeTransactions,
    periodTransactions,
    periodTxDetail,
    events,
  ] = await Promise.all([
    db.transaction.findMany({
      where: {
        isDraft: false,
        status: "MATCHED",
        ministryId: mensos.id,
        ...excludeOpeningBalanceWhere(),
      },
      select: { direction: true, amount: true, source: true, eventId: true },
    }),
    db.transaction.findMany({
      where: {
        isDraft: false,
        status: "MATCHED",
        ministryId: mensos.id,
        transactionDate: { gte: startDate, lte: endDate },
        ...excludeOpeningBalanceWhere(),
      },
      include: { incomeType: true, expenseType: true },
    }),
    db.transaction.findMany({
      where: {
        isDraft: false,
        status: "MATCHED",
        ministryId: mensos.id,
        transactionDate: { gte: startDate, lte: endDate },
        ...excludeOpeningBalanceWhere(),
      },
      include: { incomeType: true, expenseType: true, event: true },
      orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
    }),
    db.event.findMany({
      where: { ministryId: mensos.id, active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const allTimeIncome = roundMoney(allTimeTransactions.filter((t) => t.direction === "IN").reduce((sum, t) => sum + Number(t.amount), 0));
  const allTimeExpense = roundMoney(allTimeTransactions.filter((t) => t.direction === "OUT").reduce((sum, t) => sum + Number(t.amount), 0));
  const allTimeQrisFee = roundMoney(allTimeTransactions.filter((t) => t.direction === "IN" && t.source === "QRIS_XLSX").reduce((sum, t) => sum + qrisFeeFor(Number(t.amount)), 0));

  const saldoTerkini = roundMoney(allTimeIncome - allTimeQrisFee - allTimeExpense);
  const saldoMasuk = allTimeIncome;

  const periodIncome = roundMoney(periodTransactions.filter((t) => t.direction === "IN").reduce((sum, t) => sum + Number(t.amount), 0));
  const periodExpense = roundMoney(periodTransactions.filter((t) => t.direction === "OUT").reduce((sum, t) => sum + Number(t.amount), 0));
  const periodQrisFee = roundMoney(periodTransactions.filter((t) => t.direction === "IN" && t.source === "QRIS_XLSX").reduce((sum, t) => sum + qrisFeeFor(Number(t.amount)), 0));
  const saldoDialokasikan = periodExpense;

  const eventRows = events.map((event) => {
    const eventTx = periodTransactions.filter((t) => t.eventId === event.id);
    const income = roundMoney(eventTx.filter((t) => t.direction === "IN").reduce((sum, t) => sum + Number(t.amount), 0));
    const expense = roundMoney(eventTx.filter((t) => t.direction === "OUT").reduce((sum, t) => sum + Number(t.amount), 0));
    const qrisFee = roundMoney(eventTx.filter((t) => t.direction === "IN" && t.source === "QRIS_XLSX").reduce((sum, t) => sum + qrisFeeFor(Number(t.amount)), 0));
    const net = roundMoney(income - qrisFee - expense);

    const incomeByType = new Map<string, { name: string; code: string | null; amount: number }>();
    const expenseByType = new Map<string, { name: string; amount: number }>();

    for (const t of eventTx) {
      if (t.direction === "IN") {
        const key = t.incomeTypeId || "other";
        const existing = incomeByType.get(key) || { name: t.incomeType?.name || "Pemasukan lainnya", code: t.incomeType?.uniqueCode || null, amount: 0 };
        existing.amount += Number(t.amount);
        incomeByType.set(key, existing);
      } else {
        const key = t.expenseTypeId || "other";
        const existing = expenseByType.get(key) || { name: t.expenseType?.name || "Pengeluaran lainnya", amount: 0 };
        existing.amount += Number(t.amount);
        expenseByType.set(key, existing);
      }
    }

    const detailTx = periodTxDetail.filter((t) => t.eventId === event.id);

    return {
      id: event.id,
      name: event.name,
      category: event.category,
      income,
      expense,
      qrisFee,
      net,
      incomeRows: [...incomeByType.values()].map((r) => ({ ...r, amount: roundMoney(r.amount) })).sort((a, b) => b.amount - a.amount),
      expenseRows: [...expenseByType.values()].map((r) => ({ ...r, amount: roundMoney(r.amount) })).sort((a, b) => b.amount - a.amount),
      transactionCount: eventTx.length,
      transactions: detailTx.map((t) => ({
        id: t.id,
        date: t.transactionDate.toISOString(),
        description: t.description,
        direction: t.direction as "IN" | "OUT",
        amount: Number(t.amount),
        source: t.source,
        incomeTypeName: t.incomeType?.name || null,
        expenseTypeName: t.expenseType?.name || null,
      })),
    };
  }).filter((row) => row.income || row.expense || row.transactionCount > 0);

  const eventAllTimeRows = events.map((event) => {
    const eventTx = allTimeTransactions.filter((t) => t.eventId === event.id);
    const income = roundMoney(eventTx.filter((t) => t.direction === "IN").reduce((sum, t) => sum + Number(t.amount), 0));
    const expense = roundMoney(eventTx.filter((t) => t.direction === "OUT").reduce((sum, t) => sum + Number(t.amount), 0));
    const qrisFee = roundMoney(eventTx.filter((t) => t.direction === "IN" && t.source === "QRIS_XLSX").reduce((sum, t) => sum + qrisFeeFor(Number(t.amount)), 0));
    return { id: event.id, name: event.name, income, expense, qrisFee, net: roundMoney(income - qrisFee - expense) };
  }).filter((row) => row.income || row.expense);

  const nonEventPeriod = periodTransactions.filter((t) => !t.eventId);
  const nonEventIncome = roundMoney(nonEventPeriod.filter((t) => t.direction === "IN").reduce((sum, t) => sum + Number(t.amount), 0));
  const nonEventExpense = roundMoney(nonEventPeriod.filter((t) => t.direction === "OUT").reduce((sum, t) => sum + Number(t.amount), 0));
  const nonEventQrisFee = roundMoney(nonEventPeriod.filter((t) => t.direction === "IN" && t.source === "QRIS_XLSX").reduce((sum, t) => sum + qrisFeeFor(Number(t.amount)), 0));
  const hasNonEvent = nonEventIncome || nonEventExpense;

  const nonEventDetailTx = periodTxDetail.filter((t) => !t.eventId);

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="KEMENSOS 26 SEJAHTERA"
        title="Ringkasan Kementerian Sosial"
        icon={<BarChart3 size={26} />}
        description="Dashboard khusus data Kementerian Sosial. Filter rentang tanggal untuk melihat periode tertentu."
      />

      <MensosFilters start={start} end={end} />

      <section className="stats-grid">
        <article className="stat-card stat-balance">
          <div className="stat-icon"><Wallet /></div>
          <span>Saldo Terkini</span>
          <strong>{compactRupiah.format(saldoTerkini)}</strong>
          <small>Akumulasi seluruh waktu · pemasukan dikurangi fee QRIS & pengeluaran</small>
        </article>
        <article className="stat-card" style={{ background: "var(--mint, #d4f5e9)" }}>
          <div className="stat-icon"><ArrowDownLeft /></div>
          <span>Saldo Masuk</span>
          <strong>{compactRupiah.format(saldoMasuk)}</strong>
          <small>Total pemasukan kumulatif Kementerian Sosial</small>
        </article>
        <article className="stat-card stat-expense">
          <div className="stat-icon"><ArrowUpRight /></div>
          <span>Saldo Dialokasikan</span>
          <strong>{compactRupiah.format(saldoDialokasikan)}</strong>
          <small>Total pengeluaran periode terpilih</small>
        </article>
      </section>

      <section className="meeting-metrics-grid" style={{ padding: 0 }}>
        <article className="meeting-metric-card">
          <span>Pemasukan periode</span>
          <strong className="money-in">{rupiah.format(periodIncome)}</strong>
          <small>Seluruh sumber · termasuk QRIS</small>
        </article>
        <article className="meeting-metric-card">
          <span>Pengeluaran periode</span>
          <strong className="money-out">{rupiah.format(periodExpense)}</strong>
          <small>Seluruh kegiatan</small>
        </article>
        <article className="meeting-metric-card">
          <span>Potongan QRIS 0,7%</span>
          <strong className="money-fee">{rupiah.format(periodQrisFee)}</strong>
          <small>Akumulasi per transaksi QRIS</small>
        </article>
        <article className="meeting-metric-card">
          <span>Arus bersih periode</span>
          <strong className={roundMoney(periodIncome - periodQrisFee - periodExpense) < 0 ? "money-out" : "money-in"}>{rupiah.format(roundMoney(periodIncome - periodQrisFee - periodExpense))}</strong>
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
        {eventRows.length ? (
          <div className="responsive-table">
            <table className="report-table responsive-report-table">
              <thead>
                <tr>
                  <th>Kegiatan</th>
                  <th>Kategori</th>
                  <th>Pemasukan</th>
                  <th>Fee QRIS</th>
                  <th>Pengeluaran</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {eventRows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Kegiatan"><strong>{row.name}</strong></td>
                    <td data-label="Kategori">{row.category || "—"}</td>
                    <td className="money-in" data-label="Pemasukan">{rupiah.format(row.income)}</td>
                    <td className="money-fee" data-label="Fee QRIS">{row.qrisFee ? rupiah.format(row.qrisFee) : "—"}</td>
                    <td className="money-out" data-label="Pengeluaran">{rupiah.format(row.expense)}</td>
                    <td data-label="Net"><strong className={row.net < 0 ? "money-out" : "money-in"}>{rupiah.format(row.net)}</strong></td>
                  </tr>
                ))}
                {hasNonEvent && (
                  <tr>
                    <td data-label="Kegiatan"><em>Tanpa kegiatan</em></td>
                    <td data-label="Kategori">—</td>
                    <td className="money-in" data-label="Pemasukan">{rupiah.format(nonEventIncome)}</td>
                    <td className="money-fee" data-label="Fee QRIS">{nonEventQrisFee ? rupiah.format(nonEventQrisFee) : "—"}</td>
                    <td className="money-out" data-label="Pengeluaran">{rupiah.format(nonEventExpense)}</td>
                    <td data-label="Net"><strong className={nonEventIncome - nonEventQrisFee - nonEventExpense < 0 ? "money-out" : "money-in"}>{rupiah.format(roundMoney(nonEventIncome - nonEventQrisFee - nonEventExpense))}</strong></td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}><strong>Total periode</strong></td>
                  <td className="money-in"><strong>{rupiah.format(periodIncome)}</strong></td>
                  <td className="money-fee"><strong>{rupiah.format(periodQrisFee)}</strong></td>
                  <td className="money-out"><strong>{rupiah.format(periodExpense)}</strong></td>
                  <td><strong className={roundMoney(periodIncome - periodQrisFee - periodExpense) < 0 ? "money-out" : "money-in"}>{rupiah.format(roundMoney(periodIncome - periodQrisFee - periodExpense))}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="empty-state"><span>MJ</span><p>Belum ada transaksi Kementerian Sosial pada periode ini.</p></div>
        )}
        <p className="table-panel-note">Hanya menampilkan transaksi MATCHED. Fee QRIS 0,7% dipotong per transaksi.</p>
      </section>

      {eventRows.map((event) => (
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
                {event.incomeRows.map((row, i) => (
                  <tr key={i}>
                    <td data-label="Jenis">{row.name}</td>
                    <td data-label="Kode">{row.code || "—"}</td>
                    <td className="money-in" data-label="Jumlah">{rupiah.format(row.amount)}</td>
                  </tr>
                ))}
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
        </section>
      ))}

      {hasNonEvent && nonEventDetailTx.length > 0 && (
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">RINCIAN</span>
              <h2>Transaksi tanpa kegiatan</h2>
            </div>
            <span className={`ministry-code ${roundMoney(nonEventIncome - nonEventQrisFee - nonEventExpense) < 0 ? "money-out" : "money-in"}`}>
              Net: {rupiah.format(roundMoney(nonEventIncome - nonEventQrisFee - nonEventExpense))}
            </span>
          </div>
          <MensosTransactionTable
            transactions={nonEventDetailTx.map((t) => ({
              id: t.id,
              date: t.transactionDate.toISOString(),
              description: t.description,
              direction: t.direction as "IN" | "OUT",
              amount: Number(t.amount),
              source: t.source,
              incomeTypeName: t.incomeType?.name || null,
              expenseTypeName: t.expenseType?.name || null,
            }))}
          />
        </section>
      )}

      {eventAllTimeRows.length > 0 && (
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
                {eventAllTimeRows.map((row) => (
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
                  <td className="money-in"><strong>{rupiah.format(allTimeIncome)}</strong></td>
                  <td className="money-fee"><strong>{rupiah.format(allTimeQrisFee)}</strong></td>
                  <td className="money-out"><strong>{rupiah.format(allTimeExpense)}</strong></td>
                  <td><strong className={saldoTerkini < 0 ? "money-out" : "money-in"}>{rupiah.format(saldoTerkini)}</strong></td>
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
