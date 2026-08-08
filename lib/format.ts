/**
 * Formatter & batas periode.
 *
 * SEMUA perhitungan tanggal di file ini dikunci ke WIB (Asia/Jakarta, UTC+7)
 * dan TIDAK bergantung pada timezone proses (`TZ`). Sebelumnya nilai default
 * periode dihitung dengan `new Date(y, m, 1)` yang memakai timezone server —
 * di container (UTC) batas bulan bergeser 7 jam sehingga transaksi pukul
 * 17:00–24:00 WIB pada tanggal terakhir bulan hilang dari laporan bulan itu.
 */

export const JAKARTA_TIME_ZONE = "Asia/Jakarta";

/** Selisih WIB terhadap UTC. Indonesia tidak menerapkan DST, jadi offset ini tetap. */
const WIB_OFFSET_MINUTES = 7 * 60;
const WIB_OFFSET_MS = WIB_OFFSET_MINUTES * 60_000;
const WIB_OFFSET_LABEL = "+07:00";

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const pad = (value: number) => String(value).padStart(2, "0");

export const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export const compactRupiah = new Intl.NumberFormat("id-ID", {
  notation: "compact",
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 1,
});

export const dateId = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: JAKARTA_TIME_ZONE,
});

/** Pecah sebuah instant menjadi komponen tanggal menurut kalender WIB. */
function wibParts(date: Date) {
  const shifted = new Date(date.getTime() + WIB_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** Jumlah hari pada sebuah bulan (month berbasis 1). */
function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Awal hari (00:00:00.000 WIB) untuk tanggal `YYYY-MM-DD`. */
function startOfDayWib(dateInput: string) {
  return new Date(`${dateInput}T00:00:00.000${WIB_OFFSET_LABEL}`);
}

/** Akhir hari (23:59:59.999 WIB) untuk tanggal `YYYY-MM-DD`. */
function endOfDayWib(dateInput: string) {
  return new Date(`${dateInput}T23:59:59.999${WIB_OFFSET_LABEL}`);
}

function isValidDateInput(value: string | undefined): value is string {
  if (!value || !DATE_INPUT_PATTERN.test(value)) return false;
  return !Number.isNaN(startOfDayWib(value).getTime());
}

/** Kembalikan tanggal `YYYY-MM-DD` menurut kalender WIB, apa pun timezone server. */
export function toDateInput(date: Date) {
  if (Number.isNaN(date.getTime())) return toDateInput(new Date());
  const { year, month, day } = wibParts(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Batas periode laporan. Default = bulan berjalan menurut WIB:
 * tanggal 1 pukul 00:00:00.000 WIB s/d tanggal terakhir pukul 23:59:59.999 WIB.
 * Parameter `start`/`end` yang tidak berformat `YYYY-MM-DD` diabaikan (pakai default)
 * agar parameter URL sembarangan tidak membuat Prisma menerima `Invalid Date`.
 */
export function periodBounds(start?: string, end?: string) {
  const { year, month } = wibParts(new Date());
  const firstDay = `${year}-${pad(month)}-01`;
  const lastDay = `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;

  const startDate = isValidDateInput(start) ? startOfDayWib(start) : startOfDayWib(firstDay);
  const endDate = isValidDateInput(end) ? endOfDayWib(end) : endOfDayWib(lastDay);

  return { startDate, endDate, start: toDateInput(startDate), end: toDateInput(endDate) };
}
