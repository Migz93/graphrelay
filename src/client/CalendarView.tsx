import { useId, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import type { DatesSetArg, EventClickArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ErrorBanner } from "./components/Page";
import { SelectInput, compactSecondaryButtonClass } from "./components/FormControls";
import { SettingsDialog } from "./components/SettingsDialog";
import { hiddenCalendars, calendarColorsFor, monthKey, saveHiddenCalendars, type Calendar } from "./lib/calendar";
import { useCalendarSnapshot } from "./hooks/useCalendarSnapshot";
import "./calendar-view.css";

const plugins = [dayGridPlugin, timeGridPlugin, listPlugin];
const views = [
  { id: "dayGridMonth", label: "Month" },
  { id: "timeGridWeek", label: "Week" },
  { id: "timeGridDay", label: "Day" },
  { id: "listWeek", label: "Agenda" },
];
export default function CalendarView({ calendars }: { calendars: Calendar[] }) {
  const ref = useRef<FullCalendar>(null);
  const filtersId = useId();
  const [hidden, setHidden] = useState(hiddenCalendars);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [initialView] = useState(() => window.matchMedia("(max-width: 639px)").matches ? "listWeek" : "dayGridMonth");
  const [view, setView] = useState(initialView);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState<EventClickArg["event"]>();
  const selected = calendars.filter(calendar => !hidden.includes(calendar.id));
  const calendarColors = useMemo(() => calendarColorsFor(calendars), [calendars]);
  const { snapshot: current, error } = useCalendarSnapshot(month, selected);

  function toggle(id: string) {
    const next = hidden.includes(id) ? hidden.filter(value => value !== id) : [...hidden, id];
    setHidden(next);
    saveHiddenCalendars(next);
  }

  function datesSet(info: DatesSetArg) {
    setMonth(monthKey(info.view.calendar.getDate()));
    setTitle(info.view.title);
    setView(info.view.type);
  }

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
    <div role="group" aria-labelledby={filtersId} className="min-w-0 rounded-xl border border-outline-variant/30 bg-background-container p-3">
      <h2 id={filtersId} className="mb-2 text-sm font-semibold">Visible Calendars</h2>
      <div className="flex max-h-32 flex-wrap gap-x-5 gap-y-2 overflow-y-auto">
        {calendars.map(calendar => <label key={calendar.id} className="flex min-w-0 items-center gap-2 text-sm">
          <input type="checkbox" className="accent-primary" checked={!hidden.includes(calendar.id)} onChange={() => toggle(calendar.id)} />
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: calendarColors.get(calendar.id) }} />
          <span className="min-w-0 break-words">{calendar.name}</span>
        </label>)}
      </div>
      {!calendars.length && <p className="text-sm text-on-surface-variant">No calendars found yet.</p>}
    </div>

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
