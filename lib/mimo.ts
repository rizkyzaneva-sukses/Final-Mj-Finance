import { createRequire } from "node:module";
import { z } from "zod";
import type { NormalizedTransaction } from "@/lib/matching";

const require = createRequire(import.meta.url);

const parsedSchema = z.object({
  accountHolder: z.string().trim().min(1).nullable().optional(),
  accountNumber: z.string().trim().min(1).nullable().optional(),
  transactions: z.array(
    z.object({
      date: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      amount: z.number().nullable().optional(),
      direction: z.enum(["IN", "OUT"]).nullable().optional(),
      reference: z.string().nullable().optional(),
    }),
  ),
});

function cleanJson(text: string) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function envValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.at(-1) === quote) {
    return value.slice(1, -1).trim();
  }
  return value;
}

async function pdfText(buffer: Buffer) {
  const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (input: Buffer) => Promise<{ text: string }>;
  const parsed = await pdfParse(buffer);
  return parsed.text;
}

function cleanAccountNumber(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || null;
}

function extractPdfAccount(text: string) {
  const holder = text.match(/Nama\s*:\s*([^\n\r]+)/i)?.[1]?.trim() || null;
  const number = cleanAccountNumber(text.match(/Nomor Rekening\s*:\s*([^\n\r]+)/i)?.[1]);
  return { accountHolder: holder, accountNumber: number };
}

export async function parseBankFile(buffer: Buffer, mimeType: string): Promise<{ accountHolder: string | null; accountNumber: string | null; transactions: NormalizedTransaction[] }> {
  const apiKey = envValue("MIMO_API_KEY");
  if (!apiKey) throw new Error("MIMO_API_KEY belum diatur di environment.");
  if (apiKey.startsWith("tp-")) {
    throw new Error("MIMO_API_KEY Token Plan (tp-) tidak dapat digunakan untuk backend aplikasi. Gunakan API key pay-as-you-go (sk-) dari Xiaomi MiMo API Open Platform.");
  }

  const baseUrl = (envValue("MIMO_BASE_URL") || "https://api.xiaomimimo.com/v1").replace(/\/$/, "");
  if (baseUrl.includes("token-plan")) {
    throw new Error("MIMO_BASE_URL masih memakai endpoint Token Plan. Gunakan https://api.xiaomimimo.com/v1 untuk backend aplikasi.");
  }
  const model = (envValue("MIMO_MODEL") || "mimo-v2.5").toLowerCase();
  if (mimeType !== "application/pdf" && model !== "mimo-v2.5") {
    throw new Error("Impor screenshot memerlukan model mimo-v2.5 yang mendukung gambar.");
  }

  const instruction = `Anda adalah parser mutasi rekening BCA Indonesia. Ekstrak nama pemilik rekening, nomor rekening, dan setiap transaksi tanpa saldo awal/akhir. Kembalikan JSON murni berbentuk {"accountHolder":"Nama Pemilik atau null","accountNumber":"Nomor rekening atau null","transactions":[{"date":"YYYY-MM-DD","description":"teks lengkap","amount":100000,"direction":"IN|OUT","reference":null}]}. Tanda (+), CR, atau kredit berarti IN; tanda (-), DB, atau debit berarti OUT. Nominal adalah angka rupiah tanpa pemisah. Pertahankan deskripsi TRF BATCH MYBB - PEMBAYARAN secara utuh. Jangan sertakan baris saldo awal, saldo akhir, ringkasan, atau header tabel sebagai transaksi. Jika sebuah baris transaksi tidak bisa dibaca lengkap (tanggal, deskripsi, nominal, dan arah IN/OUT wajib semuanya terisi), lewati baris itu sepenuhnya alih-alih mengisi null.`;
  const content: Array<Record<string, unknown>> = [{ type: "text", text: instruction }];
  let pdfAccount = { accountHolder: null as string | null, accountNumber: null as string | null };

  if (mimeType === "application/pdf") {
    const text = await pdfText(buffer);
    if (!text.trim()) throw new Error("PDF tidak memiliki teks yang dapat dibaca. Unggah screenshot halaman mutasi.");
    pdfAccount = extractPdfAccount(text);
    content.push({ type: "text", text: `\nTEKS E-STATEMENT:\n${text.slice(0, 120_000)}` });
  } else {
    content.push({
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${buffer.toString("base64")}` },
    });
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content }],
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    if (response.status === 401) {
      throw new Error("MiMo menolak API key (401). Buat atau reset API key pay-as-you-go (sk-), lalu perbarui MIMO_API_KEY di EasyPanel.");
    }
    throw new Error(`MiMo gagal (${response.status}): ${detail}`);
  }
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("Respons MiMo tidak berisi hasil parser.");
  const raw = JSON.parse(cleanJson(text));
  if (raw.transactions && Array.isArray(raw.transactions)) {
    raw.transactions = raw.transactions.filter(
      (t: Record<string, unknown>) =>
        typeof t.amount === "number" && t.amount > 0 &&
        (t.direction === "IN" || t.direction === "OUT"),
    );
  }
  const parsed = parsedSchema.parse(raw);
  const accountHolder = pdfAccount.accountHolder || parsed.accountHolder?.trim() || null;
  const accountNumber = pdfAccount.accountNumber || cleanAccountNumber(parsed.accountNumber);

  const validRows = parsed.transactions.filter(
    (row): row is { date: string; description: string; amount: number; direction: "IN" | "OUT"; reference?: string | null } =>
      typeof row.date === "string" && row.date.trim().length > 0 &&
      typeof row.description === "string" && row.description.trim().length > 0 &&
      typeof row.amount === "number" && Number.isFinite(row.amount) && row.amount > 0 &&
      (row.direction === "IN" || row.direction === "OUT"),
  );

  return {
    accountHolder,
    accountNumber,
    transactions: validRows.map((row) => ({
      transactionDate: new Date(`${row.date}T12:00:00+07:00`),
      description: row.description,
      amount: row.amount,
      direction: row.direction,
      source: mimeType === "application/pdf" ? "BANK_PDF" : "BANK_SCREENSHOT",
      accountHolder,
      accountNumber,
      sourceReference: row.reference,
      rawData: JSON.parse(JSON.stringify({ ...row, accountHolder, accountNumber })),
    })),
  };
}
