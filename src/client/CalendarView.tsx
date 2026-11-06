import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import type { DatesSetArg, EventClickArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ErrorBanner } from "./components/Page";
import { SelectInput, compactSecondaryButtonClass } from "./components/FormControls";
import { SettingsDialog } from "./components/SettingsDialog";
import { api } from "./lib/api";
import "./calendar-view.css";

type Calendar = { id: string; name: string };
type Event = { id: string; title: string; start: string; end: string; allDay: boolean; calendarId: string; location?: string };
type Snapshot = { events: Event[]; refreshing: boolean; failed: string[] };
const plugins = [dayGridPlugin, timeGridPlugin, listPlugin];
const views = [
  { id: "dayGridMonth", label: "Month" },
  { id: "timeGridWeek", label: "Week" },
  { id: "timeGridDay", label: "Day" },
  { id: "listWeek", label: "Agenda" },
];
const colors = ["#ad2937", "#285aab", "#356c55", "#70419d", "#92581e", "#156b78"];
const storageKey = "graphrelay:hidden-calendars";

function hiddenCalendars() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (Array.isArray(value)) return value.filter((id): id is string => typeof id === "string");
  } catch {
    // Calendar filters still work if browser storage is unavailable.
  }
  return [];
}

function monthKey(date: Date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}

export default function CalendarView({ calendars }: { calendars: Calendar[] }) {
  const ref = useRef<FullCalendar>(null);
  const [hidden, setHidden] = useState(hiddenCalendars);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [initialView] = useState(() => window.matchMedia("(max-width: 639px)").matches ? "listWeek" : "dayGridMonth");
  const [view, setView] = useState(initialView);
  const [title, setTitle] = useState("");
  const [snapshot, setSnapshot] = useState<{ month: string; value: Snapshot }>();
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<EventClickArg["event"]>();
  const selected = calendars.filter(calendar => !hidden.includes(calendar.id));
  const calendarColors = useMemo(() => new Map(calendars.map((calendar, index) => [calendar.id, colors[index % colors.length]])), [calendars]);
  const query = new URLSearchParams({ month });
  for (const calendar of selected) query.append("calendar", calendar.id);
  const path = selected.length ? "/calendar-feeds/view?" + query : null;

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

  function toggle(id: string) {
    const next = hidden.includes(id) ? hidden.filter(value => value !== id) : [...hidden, id];
    setHidden(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Optional browser preference. */ }
  }

  function datesSet(info: DatesSetArg) {
    setMonth(monthKey(info.view.calendar.getDate()));
    setTitle(info.view.title);
    setView(info.view.type);
  }

  const current = snapshot?.month === month ? snapshot.value : undefined;
  const events = (current?.events ?? []).filter(event => !hidden.includes(event.calendarId)).map(event => ({
    ...event,
    id: JSON.stringify([event.calendarId, event.id]),
    backgroundColor: calendarColors.get(event.calendarId),
    borderColor: calendarColors.get(event.calendarId),
    extendedProps: { calendarId: event.calendarId, location: event.location },
  }));
  const dateFormat = detail?.allDay
    ? { dateStyle: "medium" } as const
    : { dateStyle: "medium", timeStyle: "short" } as const;

  return <div className="grid min-w-0 gap-4">
    <fieldset className="min-w-0 self-start rounded-xl border border-outline-variant/30 bg-background-container p-3">
      <legend className="px-1 text-sm font-semibold">Visible Calendars</legend>
      <div className="flex max-h-32 flex-wrap gap-x-5 gap-y-2 overflow-y-auto">
        {calendars.map(calendar => <label key={calendar.id} className="flex min-w-0 items-center gap-2 text-sm">
          <input type="checkbox" className="accent-primary" checked={!hidden.includes(calendar.id)} onChange={() => toggle(calendar.id)} />
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: calendarColors.get(calendar.id) }} />
          <span className="min-w-0 break-words">{calendar.name}</span>
        </label>)}
      </div>
      {!calendars.length && <p className="text-sm text-on-surface-variant">No calendars found yet.</p>}
    </fieldset>

    <section aria-label="Calendar Events" className="graphrelay-calendar min-w-0 rounded-xl border border-outline-variant/30 bg-background-container p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          <button className={compactSecondaryButtonClass} aria-label="Previous Period" onClick={() => ref.current?.getApi().prev()}><ChevronLeft size={16} /></button>
          <button className={compactSecondaryButtonClass} aria-label="Next Period" onClick={() => ref.current?.getApi().next()}><ChevronRight size={16} /></button>
          <button className={compactSecondaryButtonClass} onClick={() => ref.current?.getApi().today()}>Today</button>
        </div>
        <h2 className="order-last w-full text-base font-semibold sm:order-none sm:w-auto">{title}</h2>
        <SelectInput aria-label="Calendar View" className="!w-auto !py-1.5 text-sm" value={view} onChange={value => ref.current?.getApi().changeView(value)}>
          {views.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </SelectInput>
      </div>
      {error && <ErrorBanner message={error} />}
      {!!current?.failed.length && !!selected.length && <ErrorBanner message={"Could not refresh " + current.failed.join(", ") + ". Cached events are shown when available."} />}
      {!selected.length && <p className="mb-3 text-sm text-on-surface-variant">Choose calendars to show their events.</p>}
      {!!selected.length && (!current || current.refreshing) && <p role="status" className="mb-3 text-sm text-on-surface-variant">Refreshing calendar events…</p>}
      <FullCalendar ref={ref} plugins={plugins} initialView={initialView} headerToolbar={false} firstDay={1} height="auto"
        datesSet={datesSet} dayMaxEvents={3} nowIndicator events={events} eventClick={info => setDetail(info.event)}
        eventDidMount={({ el, event }) => {
          el.tabIndex = 0;
          el.setAttribute("role", "button");
          el.onkeydown = key => { if (key.key === "Enter" || key.key === " ") { key.preventDefault(); setDetail(event); } };
        }} />
    </section>
    {detail && <SettingsDialog title={detail.title} tabs={[]} selected="" select={() => undefined} close={() => setDetail(undefined)}>
      <div className="grid gap-2 text-sm">
        <p>{calendars.find(calendar => calendar.id === detail.extendedProps.calendarId)?.name}</p>
        <p>{detail.start?.toLocaleString(undefined, dateFormat)}{detail.allDay ? " · All Day" : detail.end ? " – " + detail.end.toLocaleString(undefined, dateFormat) : ""}</p>
        {detail.allDay && detail.start && detail.end && detail.end.getTime() - detail.start.getTime() > 25 * 3600_000
          && <p>Through {new Date(detail.end.getFullYear(), detail.end.getMonth(), detail.end.getDate() - 1).toLocaleDateString(undefined, dateFormat)}</p>}
        {detail.extendedProps.location && <p>{detail.extendedProps.location}</p>}
      </div>
    </SettingsDialog>}
  </div>;
}
