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
});

export function toDateInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function periodBounds(start?: string, end?: string) {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const startDate = start ? new Date(`${start}T00:00:00+07:00`) : defaultStart;
  const endDate = end ? new Date(`${end}T23:59:59.999+07:00`) : new Date(defaultEnd.setHours(23, 59, 59, 999));
  return { startDate, endDate, start: toDateInput(startDate), end: toDateInput(endDate) };
}
