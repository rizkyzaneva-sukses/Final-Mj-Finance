"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarRange } from "lucide-react";

export function DashboardFilters({ start: initialStart, end: initialEnd }: { start: string; end: string }) {
  const router = useRouter();
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  return <form className="report-filters" onSubmit={(event) => { event.preventDefault(); router.push(`/dashboard?start=${start}&end=${end}`); }}><CalendarRange /><label className="report-filter-field">Dari<input type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></label><span className="report-filter-separator">sampai</span><label className="report-filter-field">Sampai<input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required /></label><button className="button button-dark">Terapkan periode</button></form>;
}
