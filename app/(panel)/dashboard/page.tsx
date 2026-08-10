import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, CircleAlert, Sparkles, TriangleAlert, FileText, Camera, Trophy } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { QrisResetButton } from "@/components/qris-reset-button";
import { ReconciliationTrigger } from "@/components/reconciliation-trigger";
import { DashboardFilters } from "@/components/dashboard-filters";
import { BANK_SOURCES, TRACKED_ACCOUNTS, excludeOpeningBalanceWhere, holderMatches } from "@/lib/accounts";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { compactRupiah, dateId, periodBounds, rupiah } from "@/lib/format";
import { getBalanceEstimateSummary } from "@/lib/meeting-report";
import { OPENING_BALANCE_PREFIX } from "@/lib/opening-balance";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ start?: string; end?: string }>;

/** Urutan dan label sumber mutasi bank untuk section "Saldo berdasarkan sumber data". */
const SOURCE_META = [
  { key: "BANK_PDF", label: "Mutasi PDF" },
  { key: "BANK_SCREENSHOT", label: "Screenshot" },
] as const;

/**
 * Chip tren "vs bulan lalu".
 *
 * Persentase HANYA sah kalau pembanding bulan lalu positif dan tandanya tidak berbalik.
 * Fungsi ini juga dipakai untuk net per kementerian yang bisa negatif; membagi selisih
 * dengan angka negatif menghasilkan persentase yang menyesatkan (bulan lalu -100 lalu
 * bulan ini +50 pernah tampil "▲ 150%"). Untuk kasus itu tampilkan selisih nominalnya saja.
 */
function renderTrend(current: number, previous: number) {
  if (!current && !previous) return <span className="trend-chip trend-flat">Belum ada data</span>;
  const diff = current - previous;
  if (diff === 0) return <span className="trend-chip trend-flat">= vs bulan lalu</span>;
  const direction = diff > 0 ? "up" : "down";
  const arrow = direction === "up" ? "▲" : "▼";
  const nominal = compactRupiah.format(Math.abs(diff));
  const detail = `Bulan lalu ${rupiah.format(previous)} → bulan ini ${rupiah.format(current)} (selisih ${rupiah.format(diff)})`;
  if (!previous) {
    return <span className={`trend-chip trend-${direction}`} title={detail}>{arrow} {nominal} · baru bulan ini</span>;
  }
  if (previous > 0 && current >= 0) {
    const pct = Math.round(Math.abs(diff / previous) * 100);
    return <span className={`trend-chip trend-${direction}`} title={detail}>{arrow} {pct}% vs bulan lalu</span>;
  }
  return <span className={`trend-chip trend-${direction}`} title={detail}>{arrow} {nominal} vs bulan lalu</span>;
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (session?.role === "MENSOS") redirect("/mensos");
  const params = await searchParams;
  const topExpensePeriod = periodBounds(params.start, params.end);

  const now = new Date();
  // Bulan berjalan dibatasi sampai AKHIR bulan, bukan sampai "sekarang".
  // Dulu endDate = now sehingga transaksi bertanggal di masa depan (mis. mutasi yang
  // diimpor lebih awal) hilang dari "bulan berjalan", padahal pembanding bulan lalu
  // memakai akhir bulan penuh — dua periode itu jadi tidak setara.
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const [
    bankMonthIncome,
    bankMonthExpense,
    bankPrevMonthIncome,
    bankPrevMonthExpense,
    unmatchedByDirection,
    recent,
    byMinistry,
    prevMonthByMinistry,
    allTimeByMinistry,
    balanceSummary,
    openingBalanceRows,
    allMinistries,
    topExpenseGroups,
  ] = await Promise.all([
    db.transaction.aggregate({ where: { isDraft: false, source: { in: BANK_SOURCES }, direction: "IN", transactionDate: { gte: startDate, lte: endDate } }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { isDraft: false, source: { in: BANK_SOURCES }, direction: "OUT", transactionDate: { gte: startDate, lte: endDate } }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { isDraft: false, source: { in: BANK_SOURCES }, direction: "IN", transactionDate: { gte: prevMonthStart, lte: prevMonthEnd } }, _sum: { amount: true } }),
    db.transaction.aggregate({ where: { isDraft: false, source: { in: BANK_SOURCES }, direction: "OUT", transactionDate: { gte: prevMonthStart, lte: prevMonthEnd } }, _sum: { amount: true } }),
    // Transaksi belum di-assign: butuh JUMLAH BARIS sekaligus NILAI RUPIAH-nya (masuk & keluar).
    // Tanpa nilai rupiahnya, selisih antara tabel per-kementerian (hanya MATCHED) dan
    // saldo rekening (semua status) tidak bisa dijelaskan ke siapa pun.
    db.transaction.groupBy({
      by: ["direction"],
      where: { isDraft: false, status: "UNMATCHED", ...excludeOpeningBalanceWhere() },
      _sum: { amount: true },
      _count: true,
    }),
    db.transaction.findMany({
      where: { isDraft: false, source: { in: BANK_SOURCES } },
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
        ...excludeOpeningBalanceWhere(),
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
        ...excludeOpeningBalanceWhere(),
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
        ...excludeOpeningBalanceWhere(),
      },
      _sum: { amount: true },
    }),
    // Satu-satunya sumber angka saldo di halaman ini — termasuk rincian per sumber data
    // (lihat `accountRows[].bySource`). Dulu ada query terpisah dengan filter `status: "MATCHED"`
    // untuk section per sumber, jadi angkanya tidak pernah bisa cocok dengan saldo rekening.
    getBalanceEstimateSummary(endDate),
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
  const unmatchedIncome = Number(unmatchedByDirection.find((row) => row.direction === "IN")?._sum.amount || 0);
  const unmatchedExpense = Number(unmatchedByDirection.find((row) => row.direction === "OUT")?._sum.amount || 0);
  const unmatchedCount = unmatchedByDirection.reduce((total, row) => total + row._count, 0);
  const unmatchedTotal = unmatchedIncome + unmatchedExpense;
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
      // ministryId dipakai sebagai React key: `code` bisa bentrok (dua kementerian yang
      // tidak ketemu sama-sama menghasilkan 0), sedangkan id selalu unik.
      return { ministryId, ministryCode: ministry?.code ?? 0, ministryName: ministry?.name || "—", eventName: event?.name || "—", amount: value.amount };
    })
    .sort((a, b) => b.amount - a.amount);

  // --- Opening balance warning ---
  // Daftar rekening terpantau + aturan pencocokannya diambil dari @/lib/accounts,
  // sumber yang sama dengan yang dipakai getBalanceEstimateSummary().
  const missingOpeningBalance = TRACKED_ACCOUNTS.filter(
    (tracked) => !openingBalanceRows.some((row) => holderMatches(row.accountHolder, tracked.matcher)),
  );
  const unclaimed = balanceSummary.unclaimed;

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
      {unclaimed && (
        <section className="panel dashboard-warning-banner">
          <div className="dashboard-warning-icon"><TriangleAlert size={20} /></div>
          <div>
            <strong>Ada mutasi bank yang belum bisa dikaitkan ke rekening mana pun</strong>
            <small>
              {unclaimed.count} transaksi ({unclaimed.label}) senilai {rupiah.format(unclaimed.income)} masuk dan {rupiah.format(unclaimed.expense)} keluar — neto {rupiah.format(unclaimed.net)}.
              Mutasi ini TIDAK ikut dihitung di kartu saldo rekening di bawah, biasanya karena nama atau nomor pemilik rekening tidak terbaca saat impor.
            </small>
          </div>
          <div className="dashboard-warning-accounts">
            <Link className="warning-account-chip" href="/transactions?account=unknown">Tinjau mutasinya <ArrowRight size={12} style={{ verticalAlign: "-1px" }} /></Link>
          </div>
        </section>
      )}

      <section className="stats-grid">
        <article className="stat-card stat-income"><div className="stat-icon"><ArrowDownLeft /></div><span>Uang masuk rekening</span><strong>{compactRupiah.format(incomeValue)}</strong><small>Bulan berjalan · semua mutasi bank, tanpa pandang status</small>{renderTrend(incomeValue, prevIncomeValue)}</article>
        <article className="stat-card stat-expense"><div className="stat-icon"><ArrowUpRight /></div><span>Uang keluar rekening</span><strong>{compactRupiah.format(expenseValue)}</strong><small>Bulan berjalan · semua mutasi bank, tanpa pandang status</small>{renderTrend(expenseValue, prevExpenseValue)}</article>
        <article className="stat-card stat-balance"><div className="stat-icon">=</div><span>Saldo rekening saat ini</span><strong>{compactRupiah.format(currentBalance)}</strong><small>Saldo awal + seluruh mutasi bank, tanpa pandang status</small></article>
        <Link className={`stat-card stat-alert ${unmatchedCount > 0 ? "stat-alert-active" : ""}`} href="/transactions?status=UNMATCHED"><div className="stat-icon"><CircleAlert /></div><span>Perlu ditinjau</span><strong>{compactRupiah.format(unmatchedTotal)}</strong><small>{unmatchedCount} transaksi belum di-assign · masuk {compactRupiah.format(unmatchedIncome)} · keluar {compactRupiah.format(unmatchedExpense)}</small></Link>
      </section>

      <section className="meeting-metrics-grid dashboard-balance-summary">
        <article className="meeting-metric-card">
          <span>Saldo awal</span>
          <strong>{rupiah.format(balanceSummary.openingTotal)}</strong>
          <small>Posisi awal semua rekening · atur di Master Data</small>
        </article>
        <article className="meeting-metric-card">
          <span>Saldo terkonfirmasi</span>
          <strong>{rupiah.format(balanceSummary.confirmedTotal)}</strong>
          <small>Saldo awal + mutasi bank</small>
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
                <small>Saldo awal</small>
                <strong>{rupiah.format(account.openingBalance)}</strong>
                <small style={{ marginTop: "0.2rem", opacity: 0.85 }}>
                  {account.openingBalanceAt
                    ? `Per ${dateId.format(account.openingBalanceAt)}`
                    : "Belum ditetapkan"}
                </small>
              </div>
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
          {balanceSummary.accountRows.map((account) => (
            <article className="source-summary-card" key={account.label}>
              <h3>{account.label}</h3>
              <div className="source-summary-rows">
                <div className="source-summary-row">
                  <div className="source-summary-label">
                    <span>Saldo awal</span>
                  </div>
                  <div className="source-summary-values">
                    <div>
                      <small>Nominal</small>
                      <strong>{rupiah.format(account.openingBalance)}</strong>
                    </div>
                    <div>
                      <small>Tanggal</small>
                      <strong>{account.openingBalanceAt ? dateId.format(account.openingBalanceAt) : "—"}</strong>
                    </div>
                  </div>
                </div>
                {SOURCE_META.map((meta) => {
                  const data = account.bySource[meta.key];
                  return (
                    <div className="source-summary-row" key={meta.key}>
                      <div className="source-summary-label">
                        {meta.key === "BANK_PDF" ? <FileText size={15} /> : <Camera size={15} />}
                        <span>{meta.label}</span>
                      </div>
                      <div className="source-summary-values">
                        <div><small>Masuk</small><strong className="money-in">+{rupiah.format(data.income)}</strong></div>
                        <div><small>Keluar</small><strong className="money-out">-{rupiah.format(data.expense)}</strong></div>
                        <div><small>Net</small><strong>{rupiah.format(data.net)}</strong></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
        <p className="table-panel-note">Saldo terkonfirmasi = saldo awal + neto mutasi PDF + neto mutasi Screenshot. Saldo awal diisi di Master Data dan bukan mutasi bank.</p>
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
        <p className="table-panel-note" style={unmatchedCount > 0 ? { paddingBottom: ".55rem" } : undefined}>Total masuk/keluar dihitung kumulatif sepanjang waktu (bukan hanya bulan berjalan) dari seluruh transaksi final yang sudah di-assign ke kementerian — termasuk rincian pemasukan QRIS per event, sama seperti basis di halaman Laporan. Angka ini beda dari &quot;Saldo rekening saat ini&quot; di atas: pencairan QRIS gabungan ke rekening tidak dihitung lagi di sini supaya tidak dobel. Sebagian kementerian hanya menyalurkan dana tanpa menerima pemasukan langsung — sisa negatif untuk kementerian jenis ini adalah hal yang wajar.</p>
        {unmatchedCount > 0 && (
          <p className="table-panel-note">
            <strong>Belum termasuk {unmatchedCount} transaksi yang belum di-assign</strong> senilai {rupiah.format(unmatchedIncome)} masuk dan {rupiah.format(unmatchedExpense)} keluar. Selama transaksi itu belum diberi kementerian, angka di tabel ini akan selalu lebih kecil dari saldo rekening. <Link href="/transactions?status=UNMATCHED" style={{ color: "var(--orange)", fontWeight: 800 }}>Tinjau sekarang</Link>.
          </p>
        )}
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
                  <tr key={row.ministryId}>
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
        <p className="table-panel-note">Hanya menghitung pengeluaran yang sudah di-assign ke kementerian sekaligus ke kegiatan. Pengeluaran yang belum di-assign tidak muncul di sini — lihat kartu &quot;Perlu ditinjau&quot; di atas.</p>
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
