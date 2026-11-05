import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorBanner, Page, PageHeader, PageLoading } from "./components/Page";
import { SectionCard, dangerButtonClass, primaryButtonClass, secondaryButtonClass } from "./components/FormControls";
import { api } from "./lib/api";

type Feed = { id: number; calendarId: string; name: string; path: string; syncedAt: string | null; error: string | null; refreshing: boolean };
type CalendarStatus = {
  connected: boolean;
  refreshing: boolean;
  error?: string;
  calendars: { id: string; name: string }[];
  feeds: Feed[];
};

function FeedLink({ feed, busy, onRemove }: { feed: Feed; busy: boolean; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const url = new URL(feed.path, window.location.origin).href;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Feed link copied.");
    } catch {
      input.current?.focus();
      input.current?.select();
      setNotice("Feed link selected. Copy it to subscribe.");
    }
  }
  return <article className="grid min-w-0 gap-3 rounded-lg border border-outline-variant/30 p-4">
    <h3 className="break-words font-semibold">{feed.name}</h3>
    <p className="text-sm text-on-surface-variant">
      {feed.refreshing ? "Refreshing feed…" : feed.syncedAt ? "Last synced · " + new Date(feed.syncedAt).toLocaleString() : "Waiting for the first calendar sync."}
    </p>
    {feed.error && <ErrorBanner message={feed.error} />}
    <label className="grid min-w-0 gap-2 text-sm">Subscription URL
      <input ref={input} className="w-full min-w-0 rounded-lg border border-outline-variant/30 bg-background px-3 py-2.5 text-on-surface" readOnly value={url} onFocus={event => event.currentTarget.select()} />
    </label>
    <div className="flex flex-wrap gap-2">
      <button className={secondaryButtonClass} onClick={() => void copy()}>Copy Link</button>
      <button className={dangerButtonClass} disabled={busy} onClick={() => confirm ? onRemove() : setConfirm(true)}>
        {confirm ? "Confirm Revoke Link" : "Revoke Link"}
      </button>
      {confirm && <button className={secondaryButtonClass} disabled={busy} onClick={() => setConfirm(false)}>Cancel</button>}
    </div>
    {notice && <p role="status" className="text-sm text-on-surface-variant">{notice}</p>}
  </article>;
}

export default function CalendarFeeds() {
  const [status, setStatus] = useState<CalendarStatus>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
  async function change(path: string, method: string, body?: object) {
    setError("");
    setBusy(true);
    try {
      await api("/calendar-feeds" + path, method, body);
      setStatus(await api<CalendarStatus>("/calendar-feeds"));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const available = status?.calendars.filter(calendar => !status.feeds.some(feed => feed.calendarId === calendar.id)) ?? [];
  return <Page className="space-y-5">
    <PageHeader title="Calendar Feeds">
      {status?.connected && <button className={secondaryButtonClass} disabled={busy || status.refreshing} onClick={() => void change("/refresh", "POST")}>
        {status.refreshing ? "Refreshing…" : "Refresh Calendars"}
      </button>}
    </PageHeader>
    {(error || status?.error) && <ErrorBanner message={error || status!.error!} />}
    {!status && !error && <PageLoading label="Loading Calendar Feeds…" />}
    {status && !status.connected && <SectionCard title="Microsoft Calendar Access" description="Enable read access for your existing Microsoft connection to discover calendars.">
      <div><Link to="/settings" className={primaryButtonClass}>Open Microsoft Settings</Link></div>
    </SectionCard>}
    {status?.connected && <>
      <SectionCard title="Subscription Feeds" description="Subscribe to a link from your calendar app. Anyone who has the link can read its events.">
        {status.feeds.length ? status.feeds.map(feed => <FeedLink key={feed.id} feed={feed} busy={busy} onRemove={() => void change("/" + feed.id, "DELETE")} />)
          : <p>No subscription feeds yet.</p>}
      </SectionCard>
      <SectionCard title="Microsoft Calendars" description="Create a feed for a calendar. GraphRelay caches the last 30 days and the next year of events and refreshes every 15 minutes.">
        {available.length ? <ul className="grid gap-2">
          {available.map(calendar => <li key={calendar.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background-container-low px-4 py-3">
            <span className="min-w-0 break-words font-medium">{calendar.name}</span>
            <button className={primaryButtonClass} disabled={busy} aria-label={"Create Feed for " + calendar.name} onClick={() => void change("", "POST", { calendarId: calendar.id })}>Create Feed</button>
          </li>)}
        </ul> : <p>{status.refreshing ? "Discovering calendars…" : status.calendars.length ? "Every available calendar has a feed." : "No calendars found. Refresh calendars to check Microsoft."}</p>}
      </SectionCard>
    </>}
  </Page>;
}
