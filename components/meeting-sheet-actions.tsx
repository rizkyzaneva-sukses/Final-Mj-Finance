"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowLeft, Download } from "lucide-react";

export function MeetingSheetActions({ autoPrint, backHref }: { autoPrint: boolean; backHref: string }) {
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  return (
    <div className="meeting-sheet-toolbar">
      <Link className="button button-dark" href={backHref}>
        <ArrowLeft size={16} />
        Kembali ke laporan
      </Link>
      <button className="button button-primary" onClick={() => window.print()} type="button">
        <Download size={16} />
        Simpan PDF F4
      </button>
    </div>
  );
}
