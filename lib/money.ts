/**
 * Satu sumber kebenaran untuk aritmetika uang.
 * File ini murni (tanpa import server/Prisma) supaya bisa dipakai di client component juga.
 */

export const QRIS_FEE_RATE = 0.007;

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Potongan QRIS untuk SATU transaksi.
 * Bank memotong per transaksi lalu membulatkan per transaksi, jadi fee agregat harus
 * dijumlahkan dari hasil per transaksi — bukan `total * rate` yang dibulatkan sekali.
 */
export const qrisFeeFor = (amount: number) => roundMoney(amount * QRIS_FEE_RATE);

/**
 * Parse input nominal bergaya Indonesia menjadi angka.
 * Menerima: "1.500.000", "1500000", "Rp 1.500.000,50", "1,500,000" (gaya EN), "-25000".
 * Mengembalikan `null` bila kosong atau tidak valid — pemanggil wajib membedakan
 * "kosong" dari "nol", jangan pernah pakai `|| 0`.
 */
export function parseIdrInput(raw: unknown): number | null {
  const text = String(raw ?? "")
    .replace(/\s+/g, "")
    .replace(/^rp\.?/i, "")
    .trim();
  if (!text) return null;

  const negative = text.startsWith("-");
  const digits = negative ? text.slice(1) : text;
  if (!/^[\d.,]+$/.test(digits)) return null;

  const dots = (digits.match(/\./g) || []).length;
  const commas = (digits.match(/,/g) || []).length;

  let normalized: string;
  if (dots && commas) {
    // Pemisah desimal adalah karakter yang muncul paling akhir.
    const decimalSeparator = digits.lastIndexOf(",") > digits.lastIndexOf(".") ? "," : ".";
    const thousandSeparator = decimalSeparator === "," ? "." : ",";
    normalized = digits.split(thousandSeparator).join("").replace(decimalSeparator, ".");
  } else if (commas) {
    // Koma = desimal (gaya Indonesia), kecuali jelas berpola ribuan gaya Inggris.
    normalized = /^\d{1,3}(,\d{3})+$/.test(digits) ? digits.split(",").join("") : digits.replace(",", ".");
  } else if (dots) {
    // Titik = ribuan (gaya Indonesia) bila berpola grup 3 digit, selain itu desimal.
    normalized = /^\d{1,3}(\.\d{3})+$/.test(digits) ? digits.split(".").join("") : digits;
  } else {
    normalized = digits;
  }

  if (!/^\d*(\.\d+)?$/.test(normalized) || normalized === "" || normalized === ".") return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return roundMoney(negative ? -value : value);
}
