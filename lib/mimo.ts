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

async function pdfText(buffer: Buffer) {
  const pdfParse = (await import("pdf-parse")).default;
  const parsed = await pdfParse(buffer);
  return parsed.text;
}

export async function parseBankFile(buffer: Buffer, mimeType: string): Promise<NormalizedTransaction[]> {
  const baseUrl = (process.env.MIMO_BASE_URL || "https://token-plan-cn.xiaomimimo.com/v1").replace(/\/$/, "");
  const apiKey = process.env.MIMO_API_KEY;
  const model = process.env.MIMO_MODEL || "MiMo-V2.5";
  if (!apiKey) throw new Error("MIMO_API_KEY belum diatur di environment.");

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
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
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
