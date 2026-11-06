import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CalendarDays, ChevronRight, ClipboardList, ListChecks, type LucideIcon } from "lucide-react";
import { ErrorBanner, Page, PageHeader, PageLoading } from "./components/Page";
import { SectionCard, compactSecondaryButtonClass } from "./components/FormControls";
import { useCalendarSnapshot } from "./hooks/useCalendarSnapshot";
import { api } from "./lib/api";
import { calendarColorsFor, hiddenCalendars, monthKey, type Calendar } from "./lib/calendar";

type DashboardData = {
  connected: boolean;
  listCount: number;
  lists: { id: string; name: string; openItems: number | null; error: boolean }[];
  calendar: { connected: boolean; calendars: Calendar[]; error?: string; failedFeeds: { id: number; name: string }[] };
};

const listPath = (id: string) => "/todo/" + encodeURIComponent(id);

function DashboardStat({ label, value, to, icon: Icon }: { label: string; value: number; to: string; icon: LucideIcon }) {
  return <Link to={to} className="grid min-w-0 content-center justify-items-center gap-0.5 rounded-xl border border-outline-variant/30 bg-background-container px-2 py-2.5 text-center text-on-surface no-underline hover:bg-background-container-high">
    <span className="flex items-center gap-1.5">
      <Icon size={15} aria-hidden="true" />
      <strong className="font-headline text-lg leading-none">{value}</strong>
    </span>
    <span className="text-xs text-on-surface-variant">{label}</span>
  </Link>;
}

function UpcomingEvents({ calendar }: { calendar: DashboardData["calendar"] }) {
  const [hidden] = useState(hiddenCalendars);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const through = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const selected = calendar.calendars.filter(source => !hidden.includes(source.id));
  const visible = new Map(selected.map(source => [source.id, source.name]));
  const colors = calendarColorsFor(calendar.calendars);
  const { snapshot, error } = useCalendarSnapshot(monthKey(now), selected);
  const events = (snapshot?.events ?? []).filter(event => visible.has(event.calendarId)).flatMap(event => {
    const start = new Date(event.allDay ? event.start + "T00:00:00" : event.start);
    const end = new Date(event.allDay ? event.end + "T00:00:00" : event.end);
    if (+start >= +through || +end <= (event.allDay ? +today : +now)) return [];
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    return [{ ...event, startDate: start, date: +date < +today ? today : date }];
  }).sort((a, b) => +a.date - +b.date || Number(b.allDay) - Number(a.allDay) || +a.startDate - +b.startDate).slice(0, 6);
  const groups = new Map<number, typeof events>();
  for (const event of events) {
    const group = groups.get(+event.date) ?? [];
    group.push(event);
    groups.set(+event.date, group);
  }

  return <SectionCard title="Upcoming Events" description="Next 7 days">
    {error && <ErrorBanner message={error} />}
    {!calendar.connected ? <p className="text-sm text-on-surface-variant">Enable calendar access to see upcoming events.</p>
      : !calendar.calendars.length ? <p className="text-sm text-on-surface-variant">No Microsoft calendars found yet.</p>
      : !selected.length ? <p className="text-sm text-on-surface-variant">Choose visible calendars in the Events tab.</p>
      : !events.length && !error ? <p className="text-sm text-on-surface-variant">
        {!snapshot || snapshot.refreshing ? "Loading events…" : snapshot.failed.length ? "Upcoming events could not be loaded." : "No upcoming events."}
      </p> : null}
    {!!events.length && <div className="grid gap-3">
      {[...groups].map(([date, entries]) => <div key={date}>
        <h3 className="mb-1 text-xs font-semibold text-on-surface-variant">
          {date === +today ? "Today" : date === +tomorrow ? "Tomorrow" : new Date(date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
        </h3>
        <ul className="grid gap-1">
          {entries.map(event => <li key={JSON.stringify([event.calendarId, event.id])} className="flex min-w-0 items-start gap-2 py-1 text-sm">
            <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: colors.get(event.calendarId) }} />
            <div className="min-w-0 flex-1">
              <p className="break-words font-medium">{event.title}</p>
              <p className="text-xs text-on-surface-variant">{visible.get(event.calendarId)}</p>
            </div>
            <span className="shrink-0 text-xs text-on-surface-variant">
              {event.allDay ? "All day" : +event.startDate < +now ? "In progress" : event.startDate.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </span>
          </li>)}
        </ul>
      </div>)}
    </div>}
    {!!snapshot?.failed.length && !!events.length && <p className="text-xs text-on-surface-variant">Some calendars could not refresh.</p>}
    <div><Link to={calendar.connected ? "/calendar" : "/settings?tab=microsoft"} className={compactSecondaryButtonClass}>{calendar.connected ? "Open Calendar" : "Microsoft Settings"}</Link></div>
  </SectionCard>;
}

export default function Dashboard() {
  const { state } = useLocation();
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const status = await api<DashboardData>("/dashboard");
        if (active) { setData(status); setError(""); }
      } catch (error) {
        if (active) setError((error as Error).message);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const attention = data ? [
    ...(!data.connected ? [{ label: "Connect Microsoft", path: "/settings?tab=microsoft" }] : []),
    ...data.lists.filter(list => list.error).map(list => ({ label: list.name + " needs attention", path: listPath(list.id) })),
    ...(data.calendar.error ? [{ label: "Microsoft calendars could not refresh", path: "/calendar?tab=feeds" }] : []),
    ...data.calendar.failedFeeds.map(feed => ({ label: feed.name + " could not refresh", path: "/calendar?tab=feeds#feed-" + feed.id })),
  ] : [];
  return <Page className="space-y-4">
    <PageHeader title="Dashboard" />
    {state?.microsoftSetupDeferred && <p role="status" className="text-sm text-on-surface-variant">
      You can connect your account any time in <Link to="/settings?tab=microsoft" className="underline underline-offset-2">Settings → Microsoft</Link>.
    </p>}
    {error && <ErrorBanner message={error} />}
    {!data && !error && <PageLoading label="Loading Dashboard…" />}
    {data && <nav aria-label="Dashboard Stats" className="grid grid-cols-3 gap-2 sm:gap-3">
      <DashboardStat label="Calendars" value={data.calendar.calendars.length} to="/calendar" icon={CalendarDays} />
      <DashboardStat label="To Do Lists" value={data.listCount} to="/todo" icon={ClipboardList} />
      <DashboardStat label="Enrolled Lists" value={data.lists.length} to="/todo" icon={ListChecks} />
    </nav>}
    {!!attention.length && <section className="rounded-xl border border-warning/35 bg-warning/10 px-4 py-3">
      <h2 className="mb-1 text-sm font-semibold text-warning">Needs Attention</h2>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {attention.map((item, index) => <li key={index}><Link to={item.path} className="underline underline-offset-2">{item.label}</Link></li>)}
      </ul>
    </section>}
    {data && <div className="grid items-start gap-4 lg:grid-cols-2">
      <UpcomingEvents calendar={data.calendar} />
      <SectionCard title="To Do Lists" description="Enrolled lists">
        {data.lists.length ? <ul className="grid gap-1.5">
          {data.lists.map(list => <li key={list.id}>
            <Link to={listPath(list.id)} className="flex min-w-0 items-center gap-3 rounded-lg bg-background-container-low px-3 py-2.5 text-sm hover:bg-background-bright">
              <span className="min-w-0 flex-1 break-words font-medium">{list.name}</span>
              <span className="shrink-0 text-xs text-on-surface-variant">{list.openItems === null ? "Awaiting sync" : list.openItems + " open"}</span>
              <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </li>)}
        </ul> : <p className="text-sm text-on-surface-variant">No enrolled lists yet.</p>}
        <div><Link to="/todo" className={compactSecondaryButtonClass}>View All Lists</Link></div>
      </SectionCard>
    </div>}
  </Page>;
}
