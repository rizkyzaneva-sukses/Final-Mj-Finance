# MUDA JUARA FINANCE

Aplikasi internal untuk mengimpor mutasi BCA dan QRIS, mencocokkan kode unik pemasukan, melakukan assignment manual, serta membuat laporan arus kas per kementerian dan event.

## Fitur MVP

- Login kode-only untuk Menteri Keuangan dan Kementerian.
- Impor QRIS dari Excel BCA dengan deduplikasi `TRANSACTION_ID`/RRN.
- Impor e-Statement PDF atau screenshot mutasi BCA melalui MiMo V2.5.
- Otomatis melewati `TRF BATCH MYBB - PEMBAYARAN` agar QRIS tidak dihitung ganda.
- Auto-match pemasukan berdasarkan kode unik pada digit akhir nominal.
- Assignment manual untuk transaksi tanpa kode dan semua pengeluaran.
- Laporan periode per kementerian dan event.
- Export Excel dua sheet dengan merge-cell pada rincian event.

## Jalankan lokal

1. Salin `.env.example` menjadi `.env` dan isi seluruh nilainya.
2. Jalankan PostgreSQL lalu `npm install`.
3. Jalankan `npx prisma migrate deploy` dan `npm run db:seed`.
4. Jalankan `npm run dev`, lalu buka `http://localhost:3000`.

Alternatif cepat: sesuaikan environment pada `docker-compose.yml`, lalu jalankan `docker compose up --build`.

## Deploy di EasyPanel

1. Push folder ini ke repository GitHub baru.
2. Tambahkan service PostgreSQL di EasyPanel dan salin connection URL internalnya.
3. Buat App dari repository GitHub dan pilih build memakai `Dockerfile`.
4. Atur port aplikasi ke `3000` dan health path ke `/login`.
5. Isi environment berikut:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public
SESSION_SECRET=random-minimal-32-karakter
FINANCE_LOGIN_CODE=kode-menkeu-yang-disepakati
MENSOS_LOGIN_CODE=kode-kementerian-sosial
MINISTRY_1_LOGIN_CODE=kode-sdm
MINISTRY_3_LOGIN_CODE=kode-pendidikan
MINISTRY_5_LOGIN_CODE=kode-porpar
# dst. MINISTRY_{kode}_LOGIN_CODE untuk setiap kementerian
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
MIMO_API_KEY=sk-api-key-pay-as-you-go
MIMO_MODEL=mimo-v2.5
```

Setiap kementerian memakai `MINISTRY_{kode}_LOGIN_CODE` (contoh kode `1` = SDM). Kementerian Sosial juga menerima `MENSOS_LOGIN_CODE`. Setelah login, portal kementerian menampilkan ringkasan program milik mereka dan dapat mengunggah dokumentasi struk/bon (gambar/PDF) per kegiatan.

Gunakan API key pay-as-you-go (`sk-`), bukan key Token Plan (`tp-`). Token Plan hanya ditujukan untuk alat coding dan tidak boleh digunakan oleh backend aplikasi. Saat container hidup, migration dan seed master data otomatis dijalankan. API key dan kode login tidak boleh dimasukkan ke repository.

## Aturan kode unik

Kode disimpan tanpa nol di depan. Setiap **jenis pemasukan** mempunyai kode global yang unik. Contoh `Sponsor Bukber = 121` akan mencocokkan transaksi `Rp100.121`. Jika event memiliki Pendaftaran, buat jenis pemasukan lain, misalnya `122`.

Kode yang lebih panjang diprioritaskan saat ada suffix yang bertumpuk. Pengeluaran tidak dicocokkan otomatis dan selalu masuk daftar “Perlu ditinjau”.
