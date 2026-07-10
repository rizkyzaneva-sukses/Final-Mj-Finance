import Link from "next/link";
import { ArrowRight, BarChart3, BookOpenText, Building2, CheckCircle2, FileUp, Landmark, QrCode, ReceiptText, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();
  const authenticated = Boolean(session);

  return (
    <>
      <SiteHeader authenticated={authenticated} />

      <main className="landing">
        {/* Hero */}
        <section className="hero">
          <div className="hero-glow" aria-hidden="true" />
          <div className="hero-orbit" aria-hidden="true"><span>01</span><span>MJ</span><span>Rp</span></div>
          <div className="hero-inner">
            <div className="hero-copy">
              <div className="eyebrow">MUDA JUARA COMMUNITY</div>
              <h1>Uang yang tertata,<br />gerakan yang lebih leluasa.</h1>
              <p className="hero-lead">
                Satu ruang untuk membaca mutasi bank, merapikan QRIS, mencatat setiap transaksi, dan
                menjaga seluruh kegiatan komunitas tetap transparan dan mudah dipertanggungjawabkan.
              </p>
              <div className="hero-cta">
                <Link href={authenticated ? "/dashboard" : "/login"} className="button button-primary">
                  {authenticated ? "Buka Dashboard" : "Mulai Catat Sekarang"} <ArrowRight size={18} />
                </Link>
                <Link href="/#fitur" className="button button-dark">Lihat Fitur</Link>
              </div>
              <ul className="hero-trust">
                <li><CheckCircle2 size={16} /> Audit transparan</li>
                <li><CheckCircle2 size={16} /> Data rapi per kementerian</li>
                <li><CheckCircle2 size={16} /> Laporan otomatis</li>
              </ul>
            </div>

            <div className="hero-visual" aria-hidden="true">
              <div className="hero-card hero-card-main">
                <div className="hero-card-head">
                  <span className="stat-icon">MJ</span>
                  <div><strong>Saldo Komunitas</strong><small>Bulan ini</small></div>
                </div>
                <strong className="hero-balance">Rp 128.450.000</strong>
                <div className="hero-chips">
                  <span className="hero-chip hero-chip-in">Masuk Rp 92,1 jt</span>
                  <span className="hero-chip hero-chip-out">Keluar Rp 47,3 jt</span>
                </div>
              </div>
              <div className="hero-card hero-card-mini hero-card-mini-1">
                <span className="dot-in" /> <div><small>QRIS cocok</small><strong>312 transaksi</strong></div>
              </div>
              <div className="hero-card hero-card-mini hero-card-mini-2">
                <span className="dot-out" /> <div><small>Perlu tinjau</small><strong>14 transaksi</strong></div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats band */}
        <section className="statband">
          <div className="statband-inner">
            <div className="statband-item"><strong>1.240+</strong><span>Transaksi tercatat</span></div>
            <div className="statband-item"><strong>9</strong><span>Kementerian terhubung</span></div>
            <div className="statband-item"><strong>100%</strong><span>Rekonsiliasi QRIS</span></div>
            <div className="statband-item"><strong>0</strong><span>Biaya platform</span></div>
          </div>
        </section>

        {/* Features */}
        <section id="fitur" className="section">
          <div className="section-head">
            <div className="eyebrow">FITUR INTI</div>
            <h2>Seluruh alur keuangan, dalam satu dashboard.</h2>
            <p>Dari impor mutasi hingga laporan rapat, setiap langkah dirancang agar pencatatan cepat dan mudah diaudit.</p>
          </div>
          <div className="features">
            <article className="feature-card">
              <span className="feature-icon"><FileUp size={20} /></span>
              <h3>Impor Data</h3>
              <p>Unggah mutasi bank dari PDF atau tangkapan layar, lengkap dengan opsi data historis sekaligus.</p>
            </article>
            <article className="feature-card">
              <span className="feature-icon"><QrCode size={20} /></span>
              <h3>Rekonsiliasi QRIS</h3>
              <p>Cocokkan otomatis pembayaran QRIS dengan mutasi bank dan temukan selisih lebih awal.</p>
            </article>
            <article className="feature-card">
              <span className="feature-icon"><ReceiptText size={20} /></span>
              <h3>Transaksi</h3>
              <p>Catat, filter, dan verifikasi setiap transaksi. Tandai duplikat dan tugaskan ke kementerian.</p>
            </article>
            <article className="feature-card">
              <span className="feature-icon"><Landmark size={20} /></span>
              <h3>Laporan</h3>
              <p>Ringkasan per periode, per sumber, dan per kementerian siap ekspor untuk pertanggungjawaban.</p>
            </article>
            <article className="feature-card">
              <span className="feature-icon"><Building2 size={20} /></span>
              <h3>Master Data</h3>
              <p>Kelola kementerian, event, dan akun secara terpusat agar pelaporan konsisten.</p>
            </article>
            <article className="feature-card">
              <span className="feature-icon"><BookOpenText size={20} /></span>
              <h3>Panduan</h3>
              <p>Langkah demi langkah pencatatan yang benar agar tim baru langsung produktif.</p>
            </article>
          </div>
        </section>

        {/* How it works */}
        <section id="cara-kerja" className="section section-tint">
          <div className="section-head">
            <div className="eyebrow">CARA KERJA</div>
            <h2>Tiga langkah menuju keuangan yang rapi.</h2>
            <p>Alur kerja sederhana yang bisa diikuti siapa saja di komunitas, tanpa perlu keahlian akuntansi.</p>
          </div>
          <div className="steps">
            <article className="step-card">
              <span className="step-num">01</span>
              <span className="step-icon"><FileUp size={20} /></span>
              <h3>Impor mutasi</h3>
              <p>Unggah berkas mutasi bank. Sistem membaca dan menyiapkan data dalam hitungan detik.</p>
            </article>
            <article className="step-card">
              <span className="step-num">02</span>
              <span className="step-icon"><QrCode size={20} /></span>
              <h3>Rekonsiliasi & catat</h3>
              <p>Cocokkan QRIS, verifikasi transaksi, dan tugaskan ke kementerian yang tepat.</p>
            </article>
            <article className="step-card">
              <span className="step-num">03</span>
              <span className="step-icon"><BarChart3 size={20} /></span>
              <h3>Lapor & pertanggungjawab</h3>
              <p>Hasilkan laporan dan lembar rapat yang rapi untuk seluruh anggota komunitas.</p>
            </article>
          </div>
        </section>

        {/* Community / why */}
        <section id="komunitas" className="section">
          <div className="community">
            <div className="community-copy">
              <div className="eyebrow">UNTUK KOMUNITAS</div>
              <h2>Transparansi adalah fondasi kepercayaan.</h2>
              <p>
                MUDA JUARA Finance membantu kementerian dan pengurus menjaga arus kas yang sehat.
                Setiap rupiah tercatat, setiap kegiatan dapat dipertanggungjawabkan.
              </p>
              <ul className="community-list">
                <li><Wallet size={18} /> Pemantauan saldo per akun secara langsung</li>
                <li><ShieldCheck size={18} /> Akses internal dengan kode keamanan</li>
                <li><Sparkles size={18} /> Antarmuka yang ramah di ponsel dan desktop</li>
              </ul>
              <Link href={authenticated ? "/dashboard" : "/login"} className="button button-primary">
                {authenticated ? "Buka Dashboard" : "Masuk ke Finance Hub"} <ArrowRight size={18} />
              </Link>
            </div>
            <div className="community-visual" aria-hidden="true">
              <div className="community-quote">
                <Sparkles size={20} />
                <p>&ldquo;Arus kas sehat dimulai dari data yang rapi.&rdquo;</p>
              </div>
              <div className="community-grid">
                <div className="community-tile"><strong>Pantau</strong><span>Saldo real-time</span></div>
                <div className="community-tile"><strong>Catat</strong><span>Tanpa duplikat</span></div>
                <div className="community-tile"><strong>Lapor</strong><span>Siap audit</span></div>
                <div className="community-tile"><strong>Bagikan</strong><span>Untuk semua</span></div>
              </div>
            </div>
          </div>
        </section>

      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="site-footer-brand">
            <span className="brand-seal">MJ</span>
            <div><strong>MUDA JUARA</strong><small>FINANCE</small></div>
          </div>
          <p className="site-footer-note">Pusat pencatatan dan laporan keuangan komunitas MUDA JUARA.</p>
          <span className="site-footer-copy">© {new Date().getFullYear()} MUDA JUARA Finance</span>
        </div>
      </footer>
    </>
  );
}
