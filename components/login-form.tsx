"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "Kode akses tidak dapat digunakan.");
      setLoading(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="login-form">
      <label htmlFor="access-code">Kode akses</label>
      <input
        id="access-code"
        type="password"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        placeholder="Masukkan kode"
        autoComplete="current-password"
        autoFocus
        required
      />
      {error && <div className="form-error">{error}</div>}
      <button className="button button-primary button-wide" disabled={loading}>
        {loading ? <LoaderCircle className="spin" size={18} /> : <>Masuk <ArrowRight size={18} /></>}
      </button>
    </form>
  );
}
