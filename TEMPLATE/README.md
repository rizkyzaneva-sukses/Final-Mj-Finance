# Template Import Data Lama

Folder ini berisi template untuk menyiapkan migrasi data lama ke aplikasi MUDA JUARA FINANCE.

## Data yang Perlu Diimpor

| File | Wajib | Untuk apa | Catatan |
| --- | --- | --- | --- |
| `01_kementerian.csv` | Ya | Master kementerian | Kalau master lama ingin dipakai apa adanya. |
| `02_event.csv` | Ya | Master event per kementerian | Dibutuhkan kalau laporan mau per event. |
| `03_jenis_pemasukan.csv` | Ya, untuk pemasukan berkode | Auto-match kode unik | Kode unik harus global unik, tanpa nol depan. |
| `04_transaksi_histori.csv` | Ya, kalau mau bawa histori transaksi | Laporan, dashboard, dan review histori | Bisa untuk transaksi masuk dan keluar. |
| `05_rekening_referensi_opsional.csv` | Opsional | Referensi daftar rekening lama | Tidak wajib diimpor ke database, tapi berguna untuk validasi. |

## Skenario Cepat

| Kebutuhan | File yang cukup disiapkan |
| --- | --- |
| Hanya mau pakai struktur master baru | `01`, `02`, `03` |
| Mau bawa histori transaksi lama juga | `01`, `02`, `03`, `04` |
| Mau pisahkan transaksi 2 rekening lama | Isi `account_holder` dan `account_number` di `04`, opsional bantu dengan `05` |

## Aturan Penting

| Field | Aturan |
| --- | --- |
| `ministry_code` | Angka unik, misalnya `0`, `1`, `5`, `96`, `98` |
| `event_name` | Unik di dalam kementerian yang sama |
| `unique_code` | Angka unik global, tanpa nol depan, maksimal 8 digit |
| `transaction_date` | Format `YYYY-MM-DD` |
| `direction` | Hanya `IN` atau `OUT` |
| `source` | Disarankan `MANUAL` untuk migrasi histori lama, atau `BANK_PDF`, `BANK_SCREENSHOT`, `QRIS_XLSX` jika memang tahu sumbernya |
| `status` | `MATCHED`, `UNMATCHED`, atau `SKIPPED` |
| `account_holder` | Sangat disarankan diisi kalau histori berasal dari lebih dari satu rekening |
| `account_number` | Sangat disarankan diisi kalau histori berasal dari lebih dari satu rekening |

## Cara Isi `04_transaksi_histori.csv`

| Kasus | Yang perlu diisi |
| --- | --- |
| Pemasukan sudah tahu masuk ke event dan jenis pemasukan mana | Isi `ministry_code`, `event_name`, `income_type_name`, set `status=MATCHED` |
| Pengeluaran sudah tahu untuk event mana | Isi `ministry_code`, `event_name`, kosongkan `income_type_name`, set `status=MATCHED` |
| Transaksi belum tahu masuk ke mana | Kosongkan kolom assignment, set `status=UNMATCHED` |
| Pencairan QRIS gabungan yang ingin dikecualikan | Set `status=SKIPPED`, isi `skip_reason` |

## Yang Tidak Perlu Disiapkan

Kolom berikut tidak perlu Anda siapkan karena akan dibuat sistem atau skrip migrasi:

- `id`
- `fingerprint`
- `isDraft`
- `createdAt`
- `updatedAt`
- `importBatchId`

## Catatan

Template ini adalah format persiapan data. Kalau Anda mau, langkah berikutnya saya bisa lanjut bikinkan:

1. fitur impor CSV master + histori langsung dari folder ini, atau
2. skrip migrasi sekali jalan untuk data lama Anda.
