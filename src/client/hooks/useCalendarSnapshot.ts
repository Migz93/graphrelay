import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Calendar, CalendarEvent } from "../lib/calendar";

type Snapshot = { events: CalendarEvent[]; refreshing: boolean; failed: string[] };

export function useCalendarSnapshot(month: string, calendars: Calendar[]) {
  const [snapshot, setSnapshot] = useState<{ month: string; value: Snapshot }>();
  const [error, setError] = useState("");
  const query = new URLSearchParams({ month });
  for (const calendar of calendars) query.append("calendar", calendar.id);
  const path = calendars.length ? "/calendar-feeds/view?" + query : null;

  useEffect(() => {
    if (!path) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      let interval = 30_000;
      try {
        const value = await api<Snapshot>(path!);
        if (!active) return;
        setSnapshot({ month, value });
        setError("");
        if (value.refreshing) interval = 1000;
      } catch (error) {
        if (active) setError((error as Error).message);
      }
      if (active) timer = setTimeout(load, interval);
    }
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [path, month]);

  return { snapshot: path && snapshot?.month === month ? snapshot.value : undefined, error: path ? error : "" };
}
