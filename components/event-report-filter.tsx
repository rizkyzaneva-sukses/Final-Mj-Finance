"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function EventReportFilter({ events, current }: { events: { value: string; label: string }[]; current: string }) {
  const router = useRouter();
  const params = useSearchParams();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params.toString());
    if (event.target.value) next.set("event", event.target.value);
    else next.delete("event");
    router.push(`/reports?${next.toString()}`);
  }

  return (
    <div className="report-event-filter">
      <label htmlFor="event-filter">Fokus event</label>
      <select id="event-filter" value={current} onChange={onChange}>
        <option value="">Semua event (per periode)</option>
        {events.map((ev) => (
          <option key={ev.value} value={ev.value}>{ev.label}</option>
        ))}
      </select>
    </div>
  );
}
