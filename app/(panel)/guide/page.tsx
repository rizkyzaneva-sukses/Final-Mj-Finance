import { PageHeading } from "@/components/page-heading";

export const dynamic = "force-dynamic";

const workflowSteps = [
  {
    title: "1. Siapkan master data",
    body: "Pastikan kementerian, event, mapping pemasukan, jenis pengeluaran, dan saldo awal rekening sudah benar. Bagian ini menentukan hasil auto-match dan saldo dashboard.",
  },
  {
    title: "2. Upload QRIS untuk rincian pemasukan",
    body: "QRIS dipakai untuk membaca transaksi satu per satu per event. Ini sumber utama detail pemasukan, terutama saat pencairan ke rekening masuk dalam bentuk batch.",
  },
  {
    title: "3. Upload mutasi bank untuk uang nyata di rekening",
    body: "Mutasi bank dipakai untuk melihat uang masuk dan keluar rekening. Pencairan QRIS batch tetap dihitung sebagai uang masuk rekening, walau mapping event-nya dilewati.",
  },
  {
    title: "4. Review lalu terapkan",
    body: "Cek halaman preview. Assign yang belum cocok, lewati yang memang batch QRIS, lalu terapkan ke buku transaksi kalau semua aman.",
  },
];

const reportingModes = [
  {
    title: "Cash basis",
    bullets: [
      "Dipakai untuk tahu sisa uang saat ini di rekening.",
      "Sumber utama: mutasi bank + saldo awal rekening.",
      "QRIS detail tidak dihitung lagi ke saldo supaya tidak dobel.",
    ],
  },
  {
    title: "Event basis",
    bullets: [
      "Dipakai untuk tahu performa pemasukan per event.",
      "Sumber utama: QRIS detail dan pemasukan non-QRIS yang memang bisa di-assign ke event.",
      "Pencairan batch QRIS di mutasi jangan dihitung lagi sebagai pemasukan event.",
    ],
  },
];

export default function GuidePage() {
  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="PANDUAN APLIKASI"
        title="Cara pakai app ini dari awal sampai laporan."
        description="Panduan ini mengikuti cara kerja app yang sekarang: QRIS untuk rincian pemasukan, mutasi bank untuk arus kas rekening, dan saldo awal untuk posisi uang sebelum pencatatan dimulai."
      />

      <section className="guide-grid">
        <article className="panel guide-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">GAMBARAN BESAR</span>
              <h2>Dua sumber, dua fungsi</h2>
            </div>
          </div>
          <div className="guide-content">
            <div className="guide-callout">
              <strong>QRIS = rincian pemasukan</strong>
              <p>Dipakai untuk tahu siapa bayar apa, kapan, dan masuk ke event mana.</p>
            </div>
            <div className="guide-callout">
              <strong>Mutasi Bank = uang nyata di rekening</strong>
              <p>Dipakai untuk tahu uang masuk, uang keluar, dan sisa saldo rekening saat ini.</p>
            </div>
            <div className="guide-callout tone-warn">
              <strong>Pencairan QRIS sering H+1 atau H+2</strong>
              <p>Jadi tanggal transaksi QRIS dan tanggal uang cair ke rekening memang bisa berbeda. Itu normal.</p>
            </div>
          </div>
        </article>

        <article className="panel guide-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">URUTAN KERJA</span>
              <h2>Alur yang disarankan</h2>
            </div>
          </div>
          <div className="guide-content">
            {workflowSteps.map((step) => (
              <div className="guide-step" key={step.title}>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="guide-grid">
        <article className="panel guide-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">MASTER DATA</span>
              <h2>Apa saja yang perlu diisi</h2>
            </div>
          </div>
          <div className="guide-content">
            <div className="guide-step">
              <strong>Kementerian</strong>
              <p>Unit besar pemilik event. Contoh: Kementerian SDM, Kementerian Sosial, KemenPorPar.</p>
            </div>
            <div className="guide-step">
              <strong>Event</strong>
              <p>Kegiatan di dalam kementerian. Contoh: Bukber 2026, Ngopbis, Mabit Juara.</p>
            </div>
            <div className="guide-step">
              <strong>Mapping pemasukan</strong>
              <p>Hubungan event dengan master pemasukan serta kode unik akhir nominal. Ini dipakai untuk auto-match transfer masuk non-QRIS.</p>
            </div>
            <div className="guide-step">
              <strong>Master pengeluaran</strong>
              <p>Daftar baku pengeluaran seperti Akomodasi, Biaya transfer, Konsumsi, Santunan, dan lain-lain.</p>
            </div>
            <div className="guide-step">
              <strong>Saldo awal rekening</strong>
              <p>Dipakai kalau rekening sudah punya uang sebelum pencatatan di app dimulai. Sangat penting untuk hitung sisa uang saat ini.</p>
            </div>
          </div>
        </article>

        <article className="panel guide-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">IMPORT</span>
              <h2>Kapan pakai tiap menu upload</h2>
            </div>
          </div>
          <div className="guide-content">
            <div className="guide-step">
              <strong>Data QRIS</strong>
              <p>Pakai file export QRIS untuk detail pemasukan satu per satu. Hasilnya cocok untuk laporan per event.</p>
            </div>
            <div className="guide-step">
              <strong>Mutasi BCA</strong>
              <p>Pakai PDF atau screenshot mutasi untuk arus uang rekening. Ini acuan utama uang masuk dan keluar rekening.</p>
            </div>
            <div className="guide-step">
              <strong>Data Lama FINAL</strong>
              <p>Pakai workbook historis yang sudah dibersihkan dan dipetakan. Cocok untuk migrasi data lama ke sistem baru.</p>
            </div>
            <div className="guide-callout tone-soft">
              <strong>Catatan penting</strong>
              <p>Sheet batch QRIS di mutasi bisa muncul sebagai skip. Itu bukan error. Tujuannya supaya uang cair tetap terbaca di rekening, tapi pemasukan event tetap dibaca dari file QRIS detail.</p>
            </div>
          </div>
        </article>
      </section>

      <section className="guide-grid">
        <article className="panel guide-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">DASHBOARD</span>
              <h2>Cara baca angka utama</h2>
            </div>
          </div>
          <div className="guide-content">
            <div className="guide-step">
              <strong>Uang masuk rekening</strong>
              <p>Hanya dari mutasi bank bulan berjalan. QRIS detail tidak ikut di sini.</p>
            </div>
            <div className="guide-step">
              <strong>Uang keluar rekening</strong>
              <p>Hanya dari mutasi bank bulan berjalan.</p>
            </div>
            <div className="guide-step">
              <strong>Saldo rekening saat ini</strong>
              <p>Akumulasi semua mutasi bank final ditambah saldo awal rekening yang kamu input manual.</p>
            </div>
            <div className="guide-step">
              <strong>Perlu ditinjau</strong>
              <p>Jumlah transaksi yang belum punya assignment final. Biasanya perlu dicek manual atau di-skip kalau memang tidak relevan.</p>
            </div>
          </div>
        </article>

        <article className="panel guide-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">REPORTING</span>
              <h2>Cara pikir laporan yang benar</h2>
            </div>
          </div>
          <div className="guide-content">
            {reportingModes.map((mode) => (
              <div className="guide-report-mode" key={mode.title}>
                <strong>{mode.title}</strong>
                <ul>
                  {mode.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              </div>
            ))}
            <div className="guide-callout tone-warn">
              <strong>Soal potongan QRIS 0,7%</strong>
              <p>Nominal QRIS adalah bruto transaksi customer. Dana yang cair ke rekening bisa lebih kecil karena potongan. Jadi untuk laporan event sebaiknya QRIS dipakai sebagai omzet pemasukan, sedangkan untuk saldo rekening tetap pakai mutasi bank.</p>
            </div>
          </div>
        </article>
      </section>

      <section className="guide-grid">
        <article className="panel guide-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">TRANSAKSI & REVIEW</span>
              <h2>Kapan assign, kapan skip</h2>
            </div>
          </div>
          <div className="guide-content">
            <div className="guide-step">
              <strong>Assign</strong>
              <p>Pakai saat transaksi memang milik event atau pengeluaran tertentu, tapi sistem belum yakin atau belum punya mapping.</p>
            </div>
            <div className="guide-step">
              <strong>Skip</strong>
              <p>Pakai untuk item yang tidak perlu dihitung ke sisi event, misalnya pencairan batch QRIS yang sudah punya detail sendiri di file QRIS.</p>
            </div>
            <div className="guide-step">
              <strong>Bulk assign</strong>
              <p>Pakai saat beberapa transaksi jelas punya tujuan yang sama. Ini mempercepat review data lama atau mutasi yang berulang.</p>
            </div>
          </div>
        </article>

        <article className="panel guide-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">PRAKTIK BAIK</span>
              <h2>Biar data tetap rapi</h2>
            </div>
          </div>
          <div className="guide-content">
            <div className="guide-step">
              <strong>Jangan ubah nama event atau master sembarangan</strong>
              <p>Perbedaan ejaan kecil bisa bikin file FINAL atau review lama tidak match lagi.</p>
            </div>
            <div className="guide-step">
              <strong>Isi saldo awal sekali per rekening</strong>
              <p>Kalau salah nominal, edit saldo awal yang lama. Jangan bikin dobel untuk rekening yang sama.</p>
            </div>
            <div className="guide-step">
              <strong>Pakai QRIS untuk laporan event, mutasi untuk saldo</strong>
              <p>Ini aturan paling aman supaya tidak dobel hitung antara transaksi detail dan pencairan batch.</p>
            </div>
            <div className="guide-step">
              <strong>Simpan file sensitif di folder TEMPLATE lokal saja</strong>
              <p>Jangan ikut push ke GitHub kalau berisi data rekening, transaksi real, atau file review pribadi.</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
