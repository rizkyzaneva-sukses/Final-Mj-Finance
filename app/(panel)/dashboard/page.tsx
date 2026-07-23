import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, CircleAlert, Sparkles, TriangleAlert, FileText, Camera, Trophy } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { QrisResetButton } from "@/components/qris-reset-button";
import { ReconciliationTrigger } from "@/components/reconciliation-trigger";
import { DashboardFilters } from "@/components/dashboard-filters";
import { db } from "@/lib/db";
import { compactRupiah, dateId, periodBounds, rupiah } from "@/lib/format";
import { getBalanceEstimateSummary } from "@/lib/meeting-report";
import { OPENING_BALANCE_PREFIX } from "@/lib/opening-balance";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ start?: string; end?: string }>;

function renderTrend(current: number, previous: number) {
  if (!current && !previous) return <span className="trend-chip trend-flat">Belum ada data</span>;
  if (!previous) return <span className="trend-chip trend-up">Baru bulan ini</span>;
  const diff = current - previous;
  const pct = Math.round(Math.abs(diff / previous) * 100);
  if (diff === 0) return <span className="trend-chip trend-flat">= vs bulan lalu</span>;
  const direction = diff > 0 ? "up" : "down";
  const arrow = direction === "up" ? "▲" : "▼";
  return <span className={`trend-chip trend-${direction}`}>{arrow} {pct}% vs bulan lalu</span>;
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const topExpensePeriod = periodBounds(params.start, params.end);

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = now;
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const [
    bankMonthIncome,
    bankMonthExpense,
    bankPrevMonthIncome,
    bankPrevMonthExpense,
    unmatched,
    recent,
    byMinistry,
    prevMonthByMinistry,
    allTimeByMinistry,
    balanceSummary,
    sourceBreakdown,
    openingBalanceRows,
    allMinistries,
    topExpenseGroups,
  ] = await Promise.all([
    db.transaction.aggregate({ where: { isDraft: false, source: { in: ["BANK_PDF", "BANK_SCREENSHOT"] }, direction: "IN", transactionDate: { gte: startDate, lte: endDate } }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { isDraft: false, source: { in: ["BANK_PDF", "BANK_SCREENSHOT"] }, direction: "OUT", transactionDate: { gte: startDate, lte: endDate } }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { isDraft: false, source: { in: ["BANK_PDF", "BANK_SCREENSHOT"] }, direction: "IN", transactionDate: { gte: prevMonthStart, lte: prevMonthEnd } }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { isDraft: false, source: { in: ["BANK_PDF", "BANK_SCREENSHOT"] }, direction: "OUT", transactionDate: { gte: prevMonthStart, lte: prevMonthEnd } }, _sum: { amount: true } }),
    db.transaction.count({ where: { isDraft: false, status: "UNMATCHED" } }),
    db.transaction.findMany({
      where: { isDraft: false, source: { in: ["BANK_PDF", "BANK_SCREENSHOT"] } },
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      take: 6,
      include: { event: true, ministry: true },
    }),
    // Per-kementerian gerak dana: semua sumber (bank + QRIS per event), bukan hanya mutasi bank.
    // Pencairan QRIS gabungan selalu di-skip (lihat TEMPLATE/README.md), jadi filter status MATCHED
    // di sini tidak akan menghitung dobel dengan baris QRIS_XLSX per-event di bawah.
    db.transaction.groupBy({
      by: ["ministryId", "direction"],
      where: {
        isDraft: false,
        status: "MATCHED",
        transactionDate: { gte: startDate, lte: endDate },
        ministryId: { not: null },
        NOT: { source: "MANUAL", sourceReference: { startsWith: OPENING_BALANCE_PREFIX } },
      },
      _sum: { amount: true },
    }),
    // Sama seperti di atas, tapi untuk bulan kalender sebelumnya — dipakai untuk tren "vs bulan lalu" per kementerian.
    db.transaction.groupBy({
      by: ["ministryId", "direction"],
      where: {
        isDraft: false,
        status: "MATCHED",
        transactionDate: { gte: prevMonthStart, lte: prevMonthEnd },
        ministryId: { not: null },
        NOT: { source: "MANUAL", sourceReference: { startsWith: OPENING_BALANCE_PREFIX } },
      },
      _sum: { amount: true },
    }),
    // Total kumulatif sepanjang waktu per kementerian — dipakai untuk Total Masuk / Total Keluar / Sisa.
    db.transaction.groupBy({
      by: ["ministryId", "direction"],
      where: {
        isDraft: false,
        status: "MATCHED",
        ministryId: { not: null },
        NOT: { source: "MANUAL", sourceReference: { startsWith: OPENING_BALANCE_PREFIX } },
      },
      _sum: { amount: true },
    }),
    getBalanceEstimateSummary(endDate),
    // Per-source breakdown: sum of (IN - OUT) grouped by source + accountHolder
    db.transaction.groupBy({
      by: ["source", "accountHolder", "accountNumber", "direction"],
      where: {
        isDraft: false,
        source: { in: ["BANK_PDF", "BANK_SCREENSHOT"] },
        status: "MATCHED",
      },
      _sum: { amount: true },
    }),
    // Opening balances for tracked accounts
    db.transaction.findMany({
      where: {
        isDraft: false,
        source: "MANUAL",
        sourceReference: { startsWith: OPENING_BALANCE_PREFIX },
      },
      select: { accountHolder: true, accountNumber: true, sourceReference: true },
    }),
    db.ministry.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    // Biggest expense event per kementerian, within the selected (or default current-month) range.
    db.transaction.groupBy({
      by: ["ministryId", "eventId"],
      where: {
        isDraft: false,
        status: "MATCHED",
        direction: "OUT",
        ministryId: { not: null },
        eventId: { not: null },
        transactionDate: { gte: topExpensePeriod.startDate, lte: topExpensePeriod.endDate },
      },
      _sum: { amount: true },
    }),
  ]);

  const incomeValue = Number(bankMonthIncome._sum.amount || 0);
  const expenseValue = Number(bankMonthExpense._sum.amount || 0);
  const prevIncomeValue = Number(bankPrevMonthIncome._sum.amount || 0);
  const prevExpenseValue = Number(bankPrevMonthExpense._sum.amount || 0);
  const currentBalance = balanceSummary.confirmedTotal;
  const ministryIds = byMinistry.map((row) => row.ministryId).filter(Boolean) as string[];
  const ministries = allMinistries.filter((ministry) => ministryIds.includes(ministry.id));
  const chart = ministries.map((ministry) => ({
    name: ministry.name,
    income: Number(byMinistry.find((row) => row.ministryId === ministry.id && row.direction === "IN")?._sum.amount || 0),
    expense: Number(byMinistry.find((row) => row.ministryId === ministry.id && row.direction === "OUT")?._sum.amount || 0),
  })).sort((a, b) => b.income - a.income);
  const max = Math.max(1, ...chart.flatMap((item) => [item.income, item.expense]));

  // --- Per-kementerian summary: total masuk / keluar / sisa (all-time) + bulan ini vs bulan lalu ---
  const ministrySummaryRows = allMinistries.map((ministry) => {
    const totalIncome = Number(allTimeByMinistry.find((row) => row.ministryId === ministry.id && row.direction === "IN")?._sum.amount || 0);
    const totalExpense = Number(allTimeByMinistry.find((row) => row.ministryId === ministry.id && row.direction === "OUT")?._sum.amount || 0);
    const monthIncome = Number(byMinistry.find((row) => row.ministryId === ministry.id && row.direction === "IN")?._sum.amount || 0);
    const monthExpense = Number(byMinistry.find((row) => row.ministryId === ministry.id && row.direction === "OUT")?._sum.amount || 0);
    const prevMonthIncome = Number(prevMonthByMinistry.find((row) => row.ministryId === ministry.id && row.direction === "IN")?._sum.amount || 0);
    const prevMonthExpense = Number(prevMonthByMinistry.find((row) => row.ministryId === ministry.id && row.direction === "OUT")?._sum.amount || 0);
    return {
      code: ministry.code,
      name: ministry.name,
      totalIncome,
      totalExpense,
      sisa: totalIncome - totalExpense,
      monthNet: monthIncome - monthExpense,
      prevMonthNet: prevMonthIncome - prevMonthExpense,
    };
  });

  // --- Kegiatan dengan pengeluaran terbesar per kementerian (periode terpilih, default bulan berjalan) ---
  const topExpenseByMinistry = new Map<string, { eventId: string; amount: number }>();
  for (const row of topExpenseGroups) {
    const amount = Number(row._sum.amount || 0);
    const existing = topExpenseByMinistry.get(row.ministryId!);
    if (!existing || amount > existing.amount) topExpenseByMinistry.set(row.ministryId!, { eventId: row.eventId!, amount });
  }
  const topExpenseEvents = topExpenseByMinistry.size
    ? await db.event.findMany({ where: { id: { in: [...topExpenseByMinistry.values()].map((v) => v.eventId) } } })
    : [];
  const topExpenseRows = [...topExpenseByMinistry.entries()]
    .map(([ministryId, value]) => {
      const ministry = allMinistries.find((m) => m.id === ministryId);
      const event = topExpenseEvents.find((e) => e.id === value.eventId);
      return { ministryCode: ministry?.code ?? 0, ministryName: ministry?.name || "—", eventName: event?.name || "—", amount: value.amount };
    })
    .sort((a, b) => b.amount - a.amount);

  // --- Per-source balance breakdown ---
  const bankSources = ["BANK_PDF", "BANK_SCREENSHOT"] as const;
  const trackedAccounts = [
    { label: "Muhammad Rizky", matcher: "muhammad rizky" },
    { label: "Sugiarsa", matcher: "sugiarsa" },
  ];
  const sourceSummary = trackedAccounts.map((tracked) => {
    const rows = sourceBreakdown.filter((row) => {
      const holder = (row.accountHolder || "").toLowerCase();
      return holder.includes(tracked.matcher);
    });
    const bySource: Record<string, { income: number; expense: number; net: number }> = {};
    for (const src of bankSources) {
      const inRow = rows.find((r) => r.source === src && r.direction === "IN");
      const outRow = rows.find((r) => r.source === src && r.direction === "OUT");
      const income = Number(inRow?._sum.amount || 0);
      const expense = Number(outRow?._sum.amount || 0);
      bySource[src] = { income, expense, net: income - expense };
    }
    return { label: tracked.label, bySource };
  });

  // --- Opening balance warning ---
  const trackedWithOpeningBalance = trackedAccounts.map((tracked) => {
    const hasOpening = openingBalanceRows.some((row) => {
      const holder = (row.accountHolder || "").toLowerCase();
      return holder.includes(tracked.matcher);
    });
    return { label: tracked.label, hasOpening };
  });
  const missingOpeningBalance = trackedWithOpeningBalance.filter((a) => !a.hasOpening);

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="PUSAT KENDALI"
        title="Arus kas, tanpa kabut."
        icon={<BarChart3 size={26} />}
        description="Saldo rekening dihitung dari mutasi bank. QRIS dipakai sebagai rincian pemasukan, bukan penambah saldo kedua kali."
        action={<div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}><Link className="button button-primary" href="/imports"><Sparkles size={17} /> Impor transaksi</Link><ReconciliationTrigger accounts={balanceSummary.accountRows.map((a) => ({ label: a.label, accountNumber: a.accountNumber, calculatedBalance: a.confirmedBalance }))} /></div>}
      />
      {missingOpeningBalance.length > 0 && (
        <section className="panel dashboard-warning-banner">
          <div className="dashboard-warning-icon"><TriangleAlert size={20} /></div>
          <div>
            <strong>Saldo awal belum ditetapkan</strong>
            <small>Rekening berikut belum memiliki saldo awal (opening balance). Saldo yang ditampilkan mungkin tidak akurat.</small>
          </div>
          <div className="dashboard-warning-accounts">
            {missingOpeningBalance.map((a) => <span key={a.label} className="warning-account-chip">{a.label}</span>)}
          </div>
        </section>
      )}

      <section className="stats-grid">
        <article className="stat-card stat-income"><div className="stat-icon"><ArrowDownLeft /></div><span>Uang masuk rekening</span><strong>{compactRupiah.format(incomeValue)}</strong><small>Bulan berjalan · mutasi bank</small>{renderTrend(incomeValue, prevIncomeValue)}</article>
        <article className="stat-card stat-expense"><div className="stat-icon"><ArrowUpRight /></div><span>Uang keluar rekening</span><strong>{compactRupiah.format(expenseValue)}</strong><small>Bulan berjalan · mutasi bank</small>{renderTrend(expenseValue, prevExpenseValue)}</article>
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
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <strong className="money-fee">{rupiah.format(account.qrisEstimateNet)}</strong>
                  {account.usesQrisEstimate && account.qrisEstimateNet > 0 && (
                    <QrisResetButton accountNumber={account.accountNumber} accountHolder={account.label} />
                  )}
                </div>
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
      <section className="panel source-summary-section">
        <div className="panel-title"><div><span className="eyebrow">RINGKASAN PER SUMBER</span><h2>Saldo berdasarkan sumber data</h2></div></div>
        <div className="source-summary-grid">
          {sourceSummary.map((account) => (
            <article className="source-summary-card" key={account.label}>
              <h3>{account.label}</h3>
              <div className="source-summary-rows">
                {Object.entries(account.bySource).map(([src, data]) => (
                  <div className="source-summary-row" key={src}>
                    <div className="source-summary-label">
                      {src === "BANK_PDF" ? <FileText size={15} /> : <Camera size={15} />}
                      <span>{src === "BANK_PDF" ? "Mutasi PDF" : "Screenshot"}</span>
                    </div>
                    <div className="source-summary-values">
                      <div><small>Masuk</small><strong className="money-in">+{rupiah.format(data.income)}</strong></div>
                      <div><small>Keluar</small><strong className="money-out">-{rupiah.format(data.expense)}</strong></div>
                      <div><small>Net</small><strong>{rupiah.format(data.net)}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel table-panel">
        <div className="panel-title"><div><span className="eyebrow">RINGKASAN PER KEMENTERIAN</span><h2>Total masuk, keluar, dan sisa dana</h2></div></div>
        {ministrySummaryRows.length ? (
          <div className="responsive-table">
            <table className="report-table responsive-report-table">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Kementerian</th>
                  <th>Total masuk</th>
                  <th>Total keluar</th>
                  <th>Sisa</th>
                  <th>Bulan ini vs lalu</th>
                </tr>
              </thead>
              <tbody>
                {ministrySummaryRows.map((row) => (
                  <tr key={row.code}>
                    <td data-label="Kode"><span className="ministry-code">{row.code}</span></td>
                    <td data-label="Kementerian"><strong>{row.name}</strong></td>
                    <td className="money-in" data-label="Total masuk">{rupiah.format(row.totalIncome)}</td>
                    <td className="money-out" data-label="Total keluar">{rupiah.format(row.totalExpense)}</td>
                    <td data-label="Sisa"><strong className={row.sisa < 0 ? "money-out" : "money-in"}>{rupiah.format(row.sisa)}</strong></td>
                    <td data-label="Bulan ini vs lalu">{renderTrend(row.monthNet, row.prevMonthNet)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty text="Belum ada kementerian aktif." />}
        <p className="table-panel-note">Total masuk/keluar dihitung kumulatif sepanjang waktu (bukan hanya bulan berjalan) dari seluruh transaksi final yang sudah di-assign ke kementerian — termasuk rincian pemasukan QRIS per event, sama seperti basis di halaman Laporan. Angka ini beda dari "Saldo rekening saat ini" di atas: pencairan QRIS gabungan ke rekening tidak dihitung lagi di sini supaya tidak dobel. Sebagian kementerian hanya menyalurkan dana tanpa menerima pemasukan langsung — sisa negatif untuk kementerian jenis ini adalah hal yang wajar.</p>
      </section>

      <section className="panel table-panel">
        <div className="panel-title">
          <div><span className="eyebrow">KEGIATAN TERBOROS</span><h2>Pengeluaran terbesar per kementerian</h2></div>
        </div>
        <DashboardFilters start={topExpensePeriod.start} end={topExpensePeriod.end} />
        {topExpenseRows.length ? (
          <div className="responsive-table">
            <table className="report-table responsive-report-table">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Kementerian</th>
                  <th>Kegiatan</th>
                  <th>Pengeluaran</th>
                </tr>
              </thead>
              <tbody>
                {topExpenseRows.map((row) => (
                  <tr key={row.ministryCode}>
                    <td data-label="Kode"><span className="ministry-code">{row.ministryCode}</span></td>
                    <td data-label="Kementerian"><strong>{row.ministryName}</strong></td>
                    <td data-label="Kegiatan"><Trophy size={14} style={{ marginRight: "0.35rem", verticalAlign: "-2px" }} />{row.eventName}</td>
                    <td className="money-out" data-label="Pengeluaran">{rupiah.format(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty text="Belum ada pengeluaran ter-assign pada periode ini." />}
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
