import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="eyebrow">MUDA JUARA COMMUNITY</div>
        <h1>Uang yang tertata,<br />gerakan yang lebih leluasa.</h1>
        <p>Satu ruang untuk membaca mutasi, merapikan QRIS, dan menjaga setiap kegiatan tetap transparan.</p>
        <div className="login-orbit" aria-hidden="true"><span>01</span><span>MJ</span><span>Rp</span></div>
      </section>
      <section className="login-card-wrap">
        <div className="login-card">
          <div className="brand-mark"><ShieldCheck size={24} /></div>
          <div>
            <div className="eyebrow">AKSES INTERNAL</div>
            <h2>Masuk ke Finance Hub</h2>
            <p>Cukup gunakan kode akses. Tidak perlu username.</p>
          </div>
          <LoginForm />
          <small>Kode akses tersimpan aman di environment server.</small>
        </div>
      </section>
    </main>
  );
}
