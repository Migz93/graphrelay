import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ErrorBanner, Page, PageHeader, PageLoading } from "./components/Page";
import { SectionCard, SelectInput, TextInput, compactSecondaryButtonClass, dangerButtonClass, primaryButtonClass, secondaryButtonClass, successButtonClass } from "./components/FormControls";
import { SettingsDialog } from "./components/SettingsDialog";
import { api } from "./lib/api";
import { cn } from "./lib/utils";
import { useActionFeedback } from "./lib/useActionFeedback";

const CalendarView = lazy(() => import("./CalendarView"));

type Defaults = { intervalMinutes: number; pastDays: number; futureDays: number; intervals: number[]; maxDays: number };
type Calendar = { id: string; name: string };
type Feed = {
  id: number;
  name: string;
  sources: Calendar[];
  path: string;
  syncedAt: string | null;
  error: string | null;
  refreshing: boolean;
  intervalMinutes: number | null;
  pastDays: number | null;
  futureDays: number | null;
};
type CalendarStatus = { connected: boolean; refreshing: boolean; error?: string; settings: Defaults; calendars: Calendar[]; feeds: Feed[] };

const intervalLabel = (minutes: number) => minutes < 60 ? minutes + " minutes" : minutes / 60 + (minutes === 60 ? " hour" : " hours");

function RefreshInterval({ value, change, settings, inherit = false }: {
  value: string; change: (value: string) => void; settings: Defaults; inherit?: boolean;
}) {
  return <label className="grid gap-2 text-sm">Refresh Interval
    <SelectInput value={value} onChange={change}>
      {inherit && <option value="">Use Global Default ({intervalLabel(settings.intervalMinutes)})</option>}
      {settings.intervals.map(minutes => <option key={minutes} value={minutes}>{intervalLabel(minutes)}</option>)}
    </SelectInput>
  </label>;
}

function FeedWindow({ past, future, setPast, setFuture, settings, inherit = false }: {
  past: string; future: string; setPast: (value: string) => void; setFuture: (value: string) => void; settings: Defaults; inherit?: boolean;
}) {
  return <div className="grid gap-4 sm:grid-cols-2">
    <label className="grid gap-2 text-sm">Previous Days
      <TextInput type="number" min={0} max={settings.maxDays} step={1} required={!inherit} value={past} onChange={setPast}
        placeholder={inherit ? "Global default (" + settings.pastDays + ")" : undefined} />
    </label>
    <label className="grid gap-2 text-sm">Days Ahead
      <TextInput type="number" min={0} max={settings.maxDays} step={1} required={!inherit} value={future} onChange={setFuture}
        placeholder={inherit ? "Global default (" + settings.futureDays + ")" : undefined} />
    </label>
  </div>;
}

export function CalendarSettings({ section }: { section: "general" | "feeds" }) {
  const [settings, setSettings] = useState<Defaults>();
  const [interval, setIntervalValue] = useState("");
  const [past, setPast] = useState("");
  const [future, setFuture] = useState("");
  const [busy, setBusy] = useState(false);
  const { feedback: saved, showFeedback, clearFeedback } = useActionFeedback();
  const [error, setError] = useState("");
  function apply(value: Defaults) {
    setSettings(value);
    setIntervalValue(String(value.intervalMinutes));
    setPast(String(value.pastDays));
    setFuture(String(value.futureDays));
  }
  useEffect(() => {
    void api<Defaults>("/calendar-feeds/settings").then(apply).catch(error => setError(error.message));
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    clearFeedback();
    setError("");
    try {
      const body = section === "general" ? { intervalMinutes: Number(interval) } : { pastDays: Number(past), futureDays: Number(future) };
      apply(await api<Defaults>("/calendar-feeds/settings", "PUT", body));
      showFeedback(true);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <SectionCard title={section === "general" ? "Calendar Refresh" : "Feed Date Range"}
    description={section === "general" ? "How often GraphRelay checks for calendars and refreshes feeds that use the global interval." : "Set how many days before and after today each feed includes by default."}>
    {error && <ErrorBanner message={error} />}
    {settings && <form className="grid gap-4" onSubmit={save} onChange={clearFeedback}>
      {section === "general" ? <RefreshInterval value={interval} change={setIntervalValue} settings={settings} />
        : <FeedWindow past={past} future={future} setPast={setPast} setFuture={setFuture} settings={settings} />}
      <div><button className={cn(primaryButtonClass, "min-w-32", saved && successButtonClass)} aria-live="polite" disabled={busy}>
        {busy ? "Saving…" : saved ? "Saved" : "Save Changes"}
      </button></div>
    </form>}
  </SectionCard>;
}

function FeedEditor({ feed, selectUrl, calendars, settings, close, saved }: {
  feed?: Feed; selectUrl?: boolean; calendars: Calendar[]; settings: Defaults; close: () => void; saved: () => Promise<void>;
}) {
  const [name, setName] = useState(feed?.name ?? "");
  const [selected, setSelected] = useState(feed?.sources.map(source => source.id) ?? []);
  const [interval, setIntervalValue] = useState(String(feed?.intervalMinutes ?? ""));
  const [past, setPast] = useState(String(feed?.pastDays ?? ""));
  const [future, setFuture] = useState(String(feed?.futureDays ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [startingRefresh, setStartingRefresh] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const link = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectUrl) {
      link.current?.focus();
      link.current?.select();
    }
  }, [selectUrl]);
  async function refreshNow() {
    if (!feed) return;
    setStartingRefresh(true);
    setError("");
    try {
      await api("/calendar-feeds/" + feed.id + "/refresh", "POST");
      await saved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setStartingRefresh(false);
    }
  }
  async function revoke() {
    if (!feed) return;
    setBusy(true);
    setError("");
    try {
      await api("/calendar-feeds/" + feed.id, "DELETE");
      close();
      await saved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const known = new Set(calendars.map(calendar => calendar.id));
  const choices = [...calendars, ...(feed?.sources.filter(source => !known.has(source.id)) ?? [])];
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/calendar-feeds" + (feed ? "/" + feed.id : ""), feed ? "PUT" : "POST", {
        name, calendarIds: selected, intervalMinutes: interval === "" ? null : Number(interval),
        pastDays: past === "" ? null : Number(past), futureDays: future === "" ? null : Number(future),
      });
      close();
      await saved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <SettingsDialog title={feed ? "Feed Settings" : "Create Calendar Feed"} tabs={[]} selected="" select={() => undefined} close={() => { if (!busy) close(); }}>
    {error && <ErrorBanner message={error} />}
    <form className="grid gap-4" onSubmit={save}>
      <label className="grid gap-2 text-sm">Feed Name
        <TextInput value={name} onChange={setName} required maxLength={100} />
      </label>
      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-2 text-sm">Source Calendars</legend>
        <div className="grid max-h-48 gap-2 overflow-y-auto">
          {choices.map(calendar => <label key={calendar.id} className="flex min-w-0 items-center gap-2 rounded-lg bg-background-container-low p-2 text-sm">
            <input type="checkbox" className="accent-primary" checked={selected.includes(calendar.id)}
              onChange={event => setSelected(current => event.target.checked ? [...current, calendar.id] : current.filter(id => id !== calendar.id))} />
            <span className="min-w-0 break-words">{calendar.name}{!known.has(calendar.id) && " (unavailable)"}</span>
          </label>)}
        </div>
      </fieldset>
      <RefreshInterval value={interval} change={setIntervalValue} settings={settings} inherit />
      <FeedWindow past={past} future={future} setPast={setPast} setFuture={setFuture} settings={settings} inherit />
      <p className="text-sm text-on-surface-variant">Leave day counts empty to use the global defaults.</p>
      <div className="flex flex-wrap gap-2">
        <button className={primaryButtonClass} disabled={busy || !name.trim() || !selected.length}>
          {busy ? "Saving…" : feed ? "Save Feed Settings" : "Create Feed"}
        </button>
        <button type="button" className={secondaryButtonClass} disabled={busy} onClick={close}>Cancel</button>
      </div>
    </form>
    {feed && <section className="mt-5 grid min-w-0 gap-3 border-t border-outline-variant/30 pt-4">
      <label className="grid min-w-0 gap-1 text-sm">Subscription URL
        <input ref={link} className="w-full min-w-0 rounded-lg border border-outline-variant/30 bg-background px-3 py-2 text-on-surface"
          readOnly value={feedUrl(feed)} onFocus={event => event.currentTarget.select()} />
      </label>
      {selectUrl && <p className="text-xs text-on-surface-variant">Copy the selected URL to subscribe.</p>}
      <p role="status" className="text-xs text-on-surface-variant">
        {startingRefresh || feed.refreshing ? "Refreshing feed…" : feed.syncedAt ? "Last synced · " + new Date(feed.syncedAt).toLocaleString() : "Waiting for a calendar sync."}
      </p>
      {feed.error && !startingRefresh && !feed.refreshing && <ErrorBanner className="!mb-0 py-2 text-sm" message={feed.error} />}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButtonClass} disabled={busy || startingRefresh || feed.refreshing} onClick={() => void refreshNow()}>
          {startingRefresh || feed.refreshing ? "Refreshing…" : "Refresh Now"}
        </button>
        <button type="button" className={dangerButtonClass} disabled={busy} onClick={() => confirmRevoke ? void revoke() : setConfirmRevoke(true)}>
          {confirmRevoke ? "Confirm Revoke Link" : "Revoke Link"}
        </button>
        {confirmRevoke && <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => setConfirmRevoke(false)}>Keep Link</button>}
      </div>
    </section>}
  </SettingsDialog>;
}

function feedUrl(feed: Feed) {
  return new URL(feed.path, window.location.origin).href;
}

function FeedLink({ feed, settings, busy, onEdit }: {
  feed: Feed; settings: Defaults; busy: boolean; onEdit: (selectUrl?: boolean) => void;
}) {
  const [copiedAt, setCopiedAt] = useState(0);
  useEffect(() => {
    if (!copiedAt) return;
    const timer = setTimeout(() => setCopiedAt(0), 2500);
    return () => clearTimeout(timer);
  }, [copiedAt]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(feedUrl(feed));
      setCopiedAt(Date.now());
    } catch {
      onEdit(true);
    }
  }
  return <article id={"feed-" + feed.id} className="grid min-w-0 gap-2 rounded-lg border border-outline-variant/30 px-3 py-2.5 sm:px-4 target:border-primary/60">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-64">
        <h3 className="break-words text-sm font-semibold">{feed.name}</h3>
        <p className="break-words text-xs text-on-surface-variant">{feed.sources.map(source => source.name).join(", ")}
          {" · "}Every {intervalLabel(feed.intervalMinutes ?? settings.intervalMinutes)}
          {" · "}{feed.pastDays ?? settings.pastDays} days back · {feed.futureDays ?? settings.futureDays} days ahead
        </p>
        <p className="text-xs text-on-surface-variant">
          {feed.refreshing ? "Refreshing…" : feed.syncedAt ? "Last synced · " + new Date(feed.syncedAt).toLocaleString() : "Waiting for a calendar sync."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={cn(compactSecondaryButtonClass, "min-w-20", copiedAt !== 0 && successButtonClass)}
          aria-live="polite" onClick={() => void copy()}>{copiedAt ? "Copied" : "Copy Link"}</button>
        <button className={compactSecondaryButtonClass} disabled={busy} onClick={() => onEdit()}>Settings</button>
      </div>
    </div>
    {feed.error && <ErrorBanner className="!mb-0 py-2 text-sm" message={feed.error} />}
  </article>;
}

export default function CalendarFeeds() {
  const [params, setParams] = useSearchParams();
  const { hash } = useLocation();
  const feedsTab = params.get("tab") === "feeds";
  const [status, setStatus] = useState<CalendarStatus>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ feed?: Feed; selectUrl?: boolean }>();
  const showLinkedFeed = feedsTab && status?.feeds.some(feed => hash === "#feed-" + feed.id);
  useEffect(() => {
    if (showLinkedFeed) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "nearest" });
  }, [hash, showLinkedFeed]);
  useEffect(() => {
    let active = true;
    const load = () => api<CalendarStatus>("/calendar-feeds").then(value => {
      if (active) setStatus(value);
    }).catch(error => {
      if (active) setError(error.message);
    });
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  async function load() {
    try {
      setStatus(await api<CalendarStatus>("/calendar-feeds"));
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function change(path: string, method: string) {
    setError("");
    setBusy(true);
    try {
      await api("/calendar-feeds" + path, method);
      await load();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <Page className="space-y-5">
    <PageHeader title="Calendar">
      {status?.connected && <>
        {feedsTab && <button className={primaryButtonClass} disabled={busy || !status.calendars.length} onClick={() => setEditor({})}>Create Feed</button>}
        {(feedsTab || !status.calendars.length) && <button className={secondaryButtonClass} disabled={busy || status.refreshing} onClick={() => void change("/refresh", "POST")}>
          {status.refreshing ? "Refreshing…" : "Refresh Calendars"}
        </button>}
      </>}
    </PageHeader>
    {(error || status?.error) && <ErrorBanner message={error || status!.error!} />}
    {!status && !error && <PageLoading label="Loading Calendars…" />}
    {status && !status.connected && <SectionCard title="Microsoft Calendar Access" description="Enable read access for your existing Microsoft connection to discover calendars.">
      <div><Link to="/settings" className={primaryButtonClass}>Open Microsoft Settings</Link></div>
    </SectionCard>}
    {status?.connected && <>
      <nav aria-label="Calendar Sections" className="flex w-fit gap-1 rounded-xl bg-background-container-high p-1">
        <button type="button" aria-pressed={!feedsTab} className={!feedsTab ? compactSecondaryButtonClass : "px-3 text-sm text-on-surface-variant"} onClick={() => setParams({})}>Events</button>
        <button type="button" aria-pressed={feedsTab} className={feedsTab ? compactSecondaryButtonClass : "px-3 text-sm text-on-surface-variant"} onClick={() => setParams({ tab: "feeds" })}>Feeds</button>
      </nav>
      {!feedsTab && <Suspense fallback={<PageLoading label="Loading Calendar…" />}><CalendarView calendars={status.calendars} /></Suspense>}
      {feedsTab && <SectionCard title="Subscription Feeds" description="Create a subscription link for one or more calendars. Anyone who has the link can read its events.">
        {status.feeds.length ? status.feeds.map(feed => <FeedLink key={feed.id} feed={feed} settings={status.settings} busy={busy}
          onEdit={selectUrl => setEditor({ feed, selectUrl })} />)
          : <p>{status.refreshing && !status.calendars.length ? "Discovering calendars…" : "No subscription feeds yet."}</p>}
      </SectionCard>}
      {feedsTab && editor && <FeedEditor feed={status.feeds.find(feed => feed.id === editor.feed?.id) ?? editor.feed} selectUrl={editor.selectUrl} calendars={status.calendars} settings={status.settings}
        close={() => setEditor(undefined)} saved={load} />}
    </>}
  </Page>;
}
