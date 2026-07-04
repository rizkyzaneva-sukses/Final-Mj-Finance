import { z } from "zod";
import type { NormalizedTransaction } from "@/lib/matching";

const parsedSchema = z.object({
  transactions: z.array(
    z.object({
      date: z.string(),
      description: z.string().min(1),
      amount: z.number().positive(),
      direction: z.enum(["IN", "OUT"]),
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
  const pdfParse = (await import("pdf-parse")).default;
  const parsed = await pdfParse(buffer);
  return parsed.text;
}

export async function parseBankFile(buffer: Buffer, mimeType: string): Promise<NormalizedTransaction[]> {
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

  const instruction = `Anda adalah parser mutasi rekening BCA Indonesia. Ekstrak setiap transaksi, jangan masukkan saldo awal/akhir. Kembalikan JSON murni berbentuk {"transactions":[{"date":"YYYY-MM-DD","description":"teks lengkap","amount":100000,"direction":"IN|OUT","reference":null}]}. Tanda (+), CR, atau kredit berarti IN; tanda (-), DB, atau debit berarti OUT. Nominal adalah angka rupiah tanpa pemisah. Pertahankan deskripsi TRF BATCH MYBB - PEMBAYARAN secara utuh.`;
  const content: Array<Record<string, unknown>> = [{ type: "text", text: instruction }];

  if (mimeType === "application/pdf") {
    const text = await pdfText(buffer);
    if (!text.trim()) throw new Error("PDF tidak memiliki teks yang dapat dibaca. Unggah screenshot halaman mutasi.");
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
  const parsed = parsedSchema.parse(JSON.parse(cleanJson(text)));

  return parsed.transactions.map((row) => ({
    transactionDate: new Date(`${row.date}T12:00:00+07:00`),
    description: row.description,
    amount: row.amount,
    direction: row.direction,
    source: mimeType === "application/pdf" ? "BANK_PDF" : "BANK_SCREENSHOT",
    sourceReference: row.reference,
    rawData: JSON.parse(JSON.stringify(row)),
  }));
}
