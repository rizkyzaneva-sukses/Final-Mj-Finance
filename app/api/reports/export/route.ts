import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dateId, periodBounds } from "@/lib/format";
import { getReportData } from "@/lib/reports";

export const runtime = "nodejs";

const moneyFormat = '[$Rp-421] #,##0;[Red]-[$Rp-421] #,##0';
const emerald = "123C34";
const lime = "DDE8B2";
const cream = "F7F3E8";
const orange = "E56B3F";

export async function GET(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  const url = new URL(request.url);
  const period = periodBounds(url.searchParams.get("start") || undefined, url.searchParams.get("end") || undefined);
  const { ministryRows, eventRows } = await getReportData(period.startDate, period.endDate);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MUDA JUARA FINANCE";
  workbook.created = new Date();

  const cash = workbook.addWorksheet("Arus Kas Kementerian", { views: [{ state: "frozen", ySplit: 4 }] });
  cash.columns = [{ width: 12 }, { width: 34 }, { width: 22 }, { width: 22 }, { width: 22 }];
  cash.mergeCells("A1:E1"); cash.getCell("A1").value = "LAPORAN ARUS KAS MUDA JUARA";
  cash.mergeCells("A2:E2"); cash.getCell("A2").value = `Periode ${dateId.format(period.startDate)} s/d ${dateId.format(period.endDate)}`;
  cash.addRow([]); cash.addRow(["Kode", "Kementerian", "Pemasukan", "Pengeluaran", "Arus Bersih"]);
  ministryRows.forEach((row) => cash.addRow([row.code, row.ministry, row.income, row.expense, row.net]));
  cash.addRow(["", "TOTAL", ministryRows.reduce((s, r) => s + r.income, 0), ministryRows.reduce((s, r) => s + r.expense, 0), ministryRows.reduce((s, r) => s + r.net, 0)]);
  styleSheet(cash, 5);

  const events = workbook.addWorksheet("Arus Kas Event", { views: [{ state: "frozen", ySplit: 4 }] });
  events.columns = [{ width: 28 }, { width: 30 }, { width: 26 }, { width: 13 }, { width: 22 }, { width: 22 }];
  events.mergeCells("A1:F1"); events.getCell("A1").value = "LAPORAN ARUS KAS PER EVENT";
  events.mergeCells("A2:F2"); events.getCell("A2").value = `Periode ${dateId.format(period.startDate)} s/d ${dateId.format(period.endDate)}`;
  events.addRow([]); events.addRow(["Event", "Kementerian", "Jenis Pemasukan", "Kode", "Pemasukan", "Pengeluaran"]);
  let rowNumber = 5;
  for (const event of eventRows) {
    const firstRow = rowNumber;
    event.incomeRows.forEach((income, index) => {
      events.addRow([index === 0 ? event.event : "", index === 0 ? event.ministry : "", income.type, income.code || "", income.amount, index === 0 ? event.expense : ""]);
      rowNumber++;
    });
    const lastRow = rowNumber - 1;
    if (lastRow > firstRow) {
      events.mergeCells(`A${firstRow}:A${lastRow}`);
      events.mergeCells(`B${firstRow}:B${lastRow}`);
      events.mergeCells(`F${firstRow}:F${lastRow}`);
    }
  }
  styleSheet(events, 6);

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `laporan-muda-juara-${period.start}-sd-${period.end}.xlsx`;
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } });
}

function styleSheet(sheet: ExcelJS.Worksheet, columnCount: number) {
  sheet.getRow(1).height = 32;
  sheet.getCell("A1").font = { name: "Aptos Display", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${emerald}` } };
  sheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };
  sheet.getCell("A2").font = { name: "Aptos", size: 11, italic: true, color: { argb: `FF${emerald}` } };
  const header = sheet.getRow(4);
  header.height = 26;
  header.eachCell((cell) => { cell.font = { bold: true, color: { argb: `FF${emerald}` } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${lime}` } }; cell.alignment = { vertical: "middle" }; });
  for (let row = 5; row <= sheet.rowCount; row++) {
    const current = sheet.getRow(row);
    current.height = 24;
    current.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row % 2 ? `FF${cream}` : "FFFFFFFF" } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFD8D3C6" } } };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (col >= columnCount - 1) cell.numFmt = moneyFormat;
    });
  }
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columnCount } };
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  sheet.getColumn(columnCount).font = { color: { argb: `FF${orange}` } };
}
