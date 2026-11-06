import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, rectIntersection, useDraggable, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "./lib/utils";
import { useActionFeedback } from "./lib/useActionFeedback";
import { compactMatches, groupingDraft, matchKey, moveMatch, removeGroup, type GroupDraft, type MatchGroup } from "./lib/groupingDraft";
import { ChevronRight, GripVertical, Minus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Layout, { type BuildInfo } from "./components/Layout";
import { ErrorBanner, Page, PageHeader, PageLoading } from "./components/Page";
import { dangerButtonClass, SectionCard, SelectInput, SettingRow, SettingToggle, TextInput, primaryButtonClass, secondaryButtonClass, successButtonClass } from "./components/FormControls";

import { api, sessionExpiredEvent, SessionExpiredError } from "./lib/api";
import CalendarFeeds, { CalendarSettings } from "./CalendarFeeds";
import Dashboard from "./Dashboard";
import { SettingsDialog } from "./components/SettingsDialog";

type Session = { configured: boolean } & ({ signedIn: false } | { signedIn: true; build: BuildInfo });
type Connection = { account: string | null; calendarAccess: boolean; redirectUri: string; clientId: string | null; editable: boolean };
type List = {
  id: string; displayName: string; isShared: boolean; isOwner: boolean;
  enrolled: boolean; mode: string; order: string[]; lastRun?: string; error?: string;
  unenrollPending?: boolean; autoCleanup: boolean; capitalizeItems: boolean; profileId: string; syncMinutes: number | null;
};
type Activity = { created: string; message: string };

function Login({ onLogin, firstRun = false }: { onLogin: () => void; firstRun?: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (firstRun) await api("/setup", "POST", { password });
      await api("/login", "POST", { password });
      onLogin();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(229,9,20,0.18),transparent_32rem),linear-gradient(135deg,rgba(36,37,43,0.65),transparent_42rem)]" />
    <form onSubmit={submit} className="relative w-full max-w-md rounded-3xl border border-outline-variant/30 bg-background-container-low/90 p-8 shadow-2xl backdrop-blur">
      <div className="mb-8 flex items-center gap-3">
        <img src="/graphrelay-logo.svg" alt="" aria-hidden="true" className="size-11 object-contain" />
        <div>
          <h1 className="font-headline text-2xl font-bold text-on-surface">GraphRelay</h1>
          <p className="text-sm text-on-surface-variant">{firstRun ? "Create the admin password" : "Sign in to continue"}</p>
        </div>
      </div>
      <label htmlFor="password" className="mb-2 block text-sm font-semibold text-on-surface">Password</label>
      <input id="password" type="password" autoComplete={firstRun ? "new-password" : "current-password"}
        value={password} onChange={event => setPassword(event.target.value)} required
        className="w-full rounded-xl border border-outline-variant/40 bg-background-container px-4 py-3 text-on-surface outline-none focus:border-primary" />
      {error && <div role="alert" className="mt-5 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
      <button type="submit" disabled={busy} className="mt-7 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-surface transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60">
        {busy ? "Please wait…" : firstRun ? "Create Admin Password" : "Sign In"}
      </button>
    </form>
  </main>;
}

function PollingSettings() {
  const [options, setOptions] = useState<number[]>([]);
  const [minutes, setMinutes] = useState("");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<{ minutes: number; options: number[] }>("/polling").then(value => {
      setOptions(value.options);
      setMinutes(String(value.minutes));
      setSaved(String(value.minutes));
    }).catch(error => setError(error.message));
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/polling", "PUT", { minutes: Number(minutes) });
      setSaved(minutes);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <SectionCard title="To Do Polling" description="Choose how often GraphRelay caches all Microsoft To Do lists. Enrolled lists can override this interval.">
    {error && <ErrorBanner message={error} />}
    {!!options.length && <form className="grid gap-3" onSubmit={save}>
      <label className="grid gap-2 text-sm">Polling Interval
        <SelectInput value={minutes} onChange={setMinutes} disabled={busy}>
          {options.map(option => <option key={option} value={option}>{option} {option === 1 ? "minute" : "minutes"}</option>)}
        </SelectInput>
      </label>
      <div><button className={secondaryButtonClass} disabled={busy || minutes === saved}>Save Polling Interval</button></div>
    </form>}
  </SectionCard>;
}

type Network = { publicUrl: string; trustProxy: boolean; redirectUri: string };

function NetworkSettings({ onSaved }: { onSaved: () => void }) {
  const [settings, setSettings] = useState<Network>();
  const [busy, setBusy] = useState(false);
  const { feedback: saved, showFeedback, clearFeedback } = useActionFeedback();
  const [error, setError] = useState("");
  useEffect(() => {
    void api<Network>("/network").then(setSettings).catch(error => setError(error.message));
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    clearFeedback();
    setError("");
    try {
      setSettings(await api<Network>("/network", "PUT", { publicUrl: settings.publicUrl, trustProxy: settings.trustProxy }));
      showFeedback(true);
      onSaved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <SectionCard title="Network" description="Set the address you use to open GraphRelay and configure reverse proxy support.">
    {error && <ErrorBanner message={error} />}
    {settings && <form className="grid gap-4" onSubmit={save}>
      <SettingToggle label="Trust Proxy" hint="Use forwarded HTTPS and client address information from one trusted reverse proxy." checked={settings.trustProxy}
        onChange={trustProxy => { clearFeedback(); setSettings({ ...settings, trustProxy }); }} />
      <label className="grid gap-2 text-sm">Public URL
        <TextInput type="url" value={settings.publicUrl} placeholder="https://graphrelay.example.com" disabled={busy} required
          onChange={publicUrl => { clearFeedback(); setSettings({ ...settings, publicUrl }); }} />
      </label>
      <label className="grid gap-2 text-sm">Microsoft Redirect URI
        <TextInput readOnly value={settings.redirectUri} onChange={() => undefined} onFocus={event => event.currentTarget.select()} />
        <span className="text-on-surface-variant">Add this exact URL as a Web redirect URI in Microsoft Entra.</span>
      </label>
      <div><button className={cn(primaryButtonClass, "min-w-32", saved && successButtonClass)} aria-live="polite" disabled={busy}>
        {busy ? "Saving…" : saved ? "Saved" : "Save Network"}
      </button></div>
    </form>}
  </SectionCard>;
}

function MicrosoftSettings() {
  const [connection, setConnection] = useState<Connection>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [savedSecret, setSavedSecret] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const { feedback: credentialsSaved, showFeedback, clearFeedback } = useActionFeedback();
  async function saveSecret(event: FormEvent) {
    event.preventDefault();
    setError("");
    clearFeedback();
    setSavedSecret(false);
    setSavingSecret(true);
    try {
      await api("/microsoft", "PUT", { clientId, clientSecret: secret });
      setConnection(await api<Connection>("/microsoft"));
      setSecret("");
      setSavedSecret(true);
      showFeedback(true);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSavingSecret(false);
    }
  }
  const [params] = useSearchParams();
  useEffect(() => {
    void api<Connection>("/microsoft").then(value => { setConnection(value); setClientId(value.clientId ?? ""); }).catch(error => setError(error.message));
  }, []);
  async function connect(calendarAccess = false) {
    setBusy(true);
    setError("");
    try {
      const { url } = await api<{ url: string }>("/microsoft/connect", "POST", { calendarAccess });
      window.location.assign(url);
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  const configuredOrigin = connection ? new URL(connection.redirectUri).origin : undefined;
  const onConfiguredOrigin = window.location.origin === configuredOrigin;
  const outcome = params.get("connection");
  const reason = params.get("reason") ?? "";
  const signInError = reason === "session"
    ? "The Microsoft sign-in session expired or did not match. Start again from Connect Microsoft in this tab."
    : "Microsoft sign-in failed." + (/^AADSTS[0-9]{4,10}$/.test(reason) ? " Microsoft error " + reason + "." : "") + " Try connecting again.";
  return <div className="space-y-5">
    {(error || (outcome && !savedSecret)) && <ErrorBanner message={error || (outcome === "wrong-account" ? "Reconnect using the Microsoft account that owns your enrolled lists or calendar feeds." : signInError)} />}
    <SectionCard title="Microsoft Connection" description="Connect the Microsoft account for your To Do lists and calendars.">
      {connection && <>
        <SettingRow label="Account" action>
          <button className={primaryButtonClass} onClick={() => void connect()} disabled={busy || !connection.clientId || !onConfiguredOrigin}>
            {connection.account ? "Reconnect Microsoft" : "Connect Microsoft"}
          </button>
        </SettingRow>
        {connection.account && <p>Connected as {connection.account}</p>}
        <SettingRow label="Calendar Access" hint="Allow GraphRelay to read events for subscription feeds." action>
          {connection.calendarAccess
            ? <Link className={secondaryButtonClass} to="/calendar">Open Calendar</Link>
            : <button className={secondaryButtonClass} onClick={() => void connect(true)} disabled={busy || !connection.clientId || !onConfiguredOrigin}>Enable Calendar Access</button>}
        </SettingRow>
        {!onConfiguredOrigin && <p className="text-sm text-on-surface-variant">
          Open <a className="break-all underline" href={configuredOrigin + "/settings"}>{configuredOrigin}</a> to connect Microsoft or update app credentials.
        </p>}
        {connection.editable && <details open={!connection.clientId || outcome === "failed" || savedSecret}>
          <summary className="cursor-pointer text-sm">Microsoft App Credentials</summary>
          <form onSubmit={saveSecret} onChange={clearFeedback} className="mt-3 grid gap-3">
            <label className="grid gap-2 text-sm">Application (Client) ID
              <TextInput value={clientId} onChange={setClientId} autoComplete="off" required />
            </label>
            <label className="grid gap-2 text-sm">Client Secret Value
              <TextInput type="password" value={secret} onChange={setSecret} autoComplete="off" required />
            </label>
            <div><button className={cn(secondaryButtonClass, "min-w-56", credentialsSaved && successButtonClass)} aria-live="polite" disabled={savingSecret}>
              {savingSecret ? "Saving…" : credentialsSaved ? "Saved" : "Save Microsoft Credentials"}
            </button></div>
          </form>
        </details>}
      </>}
    </SectionCard>
  </div>;
}

function Settings({ build }: { build: BuildInfo }) {
  const [networkRevision, setNetworkRevision] = useState(0);
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const tabs = [{ id: "general", label: "General" }, { id: "todo", label: "To Do" }, { id: "calendar", label: "Calendar" }, { id: "about", label: "About" }];
  const tab = tabs.some(value => value.id === params.get("tab")) ? params.get("tab")! : "general";
  const sections = [{ id: "general", label: "General" },
    tab === "calendar" ? { id: "feeds", label: "Feeds" } : { id: "groupings", label: "Groupings" }];
  const requestedSection = params.get("section");
  const section = sections.some(value => value.id === requestedSection) ? requestedSection! : "general";
  function selectTab(value: string) {
    if (busy) return;
    setParams(value === "todo" || value === "calendar" ? { tab: value, section: value === tab ? section : "general" } : { tab: value });
  }
  return <Page>
    <PageHeader title="Settings" />
    <div className="mb-6 md:hidden">
      <select aria-label="Settings Section" value={tab} onChange={event => selectTab(event.target.value)} disabled={busy}
        className="w-full rounded-xl border border-outline-variant/20 bg-background-container-high px-4 py-2.5 text-sm font-medium text-on-surface focus:border-primary/50 focus:outline-none">
        {tabs.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}
      </select>
    </div>
    <nav aria-label="Settings Sections" className="mb-6 hidden rounded-xl bg-background-container-high p-1 md:flex">
      {tabs.map(value => <button key={value.id} type="button" disabled={busy} aria-pressed={tab === value.id} onClick={() => selectTab(value.id)}
        className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${tab === value.id ? "bg-background-container text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}>{value.label}</button>)}
    </nav>
    {tab === "general" && <div className="space-y-5">
      <NetworkSettings onSaved={() => setNetworkRevision(value => value + 1)} />
      <MicrosoftSettings key={networkRevision} />
    </div>}
    {(tab === "todo" || tab === "calendar") && <nav aria-label={tab === "todo" ? "To Do Settings Sections" : "Calendar Settings Sections"} className="mb-6 flex w-fit max-w-full gap-1 rounded-xl bg-background-container-high p-1">
      {sections.map(value => <button key={value.id} type="button" disabled={busy} aria-pressed={section === value.id}
        onClick={() => { if (!busy) setParams({ tab, section: value.id }); }}
        className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${section === value.id ? "bg-background-container text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}>{value.label}</button>)}
    </nav>}
    {tab === "todo" && (section === "general" ? <PollingSettings /> : <GroupingProfiles onBusy={setBusy} />)}
    {tab === "calendar" && <CalendarSettings key={section} section={section === "feeds" ? "feeds" : "general"} />}
    {tab === "about" && <SectionCard title="Build Information">
      <dl className="grid gap-3 text-sm">
        <div><dt className="text-on-surface-variant">Version</dt><dd>v{build.version}</dd></div>
        <div><dt className="text-on-surface-variant">Channel</dt><dd className="capitalize">{build.channel}</dd></div>
        <div><dt className="text-on-surface-variant">Revision</dt><dd className="break-all font-mono">{build.revision}</dd></div>
      </dl>
    </SectionCard>}
  </Page>;
}

type SyncedItem = { id: string; name: string; title?: string; aisle?: string };
type ItemSnapshot = { items: SyncedItem[]; completed: SyncedItem[]; syncedAt: string | null };
type ItemGrouping = { name: string; profileId: string; profileName: string; revision: string; group: string; groups: string[] };

function syncedTitle(item: SyncedItem) {
  return item.title ?? item.name;
}

function bySyncedTitle(a: SyncedItem, b: SyncedItem) {
  return syncedTitle(a).localeCompare(syncedTitle(b), undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
}

function EditItemGroup({ path, item, close }: { path: string; item: SyncedItem; close: () => void }) {
  const [grouping, setGrouping] = useState<ItemGrouping>();
  const [group, setGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { feedback: saved, showFeedback, clearFeedback } = useActionFeedback();
  const url = path + "/items/" + encodeURIComponent(item.id) + "/group";

  useEffect(() => {
    let active = true;
    void api<ItemGrouping>(url).then(value => {
      if (active) { setGrouping(value); setGroup(value.group); }
    }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [url]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!grouping || busy || group === grouping.group) return;
    setBusy(true);
    setError("");
    clearFeedback();
    try {
      const { name, profileId, revision } = grouping;
      const result = await api<{ revision: string }>(url, "PUT", { name, profileId, revision, group });
      setGrouping({ ...grouping, group, revision: result.revision });
      showFeedback(true);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <SettingsDialog title="Change Item Group" tabs={[]} selected="" select={() => undefined} close={() => { if (!busy) close(); }}>
    <div className="grid gap-3">
      <p className="break-words font-medium">{syncedTitle(item)}</p>
      {error && <ErrorBanner message={error} />}
      {!grouping && !error && <PageLoading label="Loading grouping profile…" />}
      {grouping && <form className="grid gap-4" onSubmit={save}>
        <p className="text-sm text-on-surface-variant">
          Applies to all lists using <strong>{grouping.profileName}</strong>. Microsoft To Do titles update when each list syncs.
        </p>
        <label className="grid gap-2 text-sm">Group
          <SelectInput value={group} onChange={value => { setGroup(value); clearFeedback(); }} disabled={busy}>
            {grouping.groups.map(name => <option key={name}>{name}</option>)}
          </SelectInput>
        </label>
        <div className="flex flex-wrap gap-2">
          <button className={cn(primaryButtonClass, "min-w-28", saved && successButtonClass)} aria-live="polite" disabled={busy || (!saved && group === grouping.group)}>
            {busy ? "Saving…" : saved ? "Saved" : "Save Group"}
          </button>
          <button type="button" className={secondaryButtonClass} onClick={close} disabled={busy}>Close</button>
        </div>
      </form>}
    </div>
  </SettingsDialog>;
}

function ListItems({ path, grouped }: { path: string; grouped: boolean }) {
  const [snapshot, setSnapshot] = useState<ItemSnapshot>();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<SyncedItem>();
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const value = await api<ItemSnapshot>(path + "/items");
        if (active) { setSnapshot(value); setError(""); }
      } catch (error) {
        if (active) setError((error as Error).message);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [path]);

  const items = [...(snapshot?.items ?? [])].sort(bySyncedTitle);
  return <div className="grid gap-3 rounded-lg bg-background-container-low p-4">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="font-medium">Open Items{snapshot?.syncedAt && " (" + snapshot.items.length + ")"}</h2>
      {snapshot?.syncedAt && <p className="text-xs text-on-surface-variant">Items synced {new Date(snapshot.syncedAt).toLocaleString()}</p>}
    </div>
    {error && <ErrorBanner message={error} />}
    {!snapshot && !error && <p>Loading open items…</p>}
    {snapshot?.syncedAt === null && <p>Waiting for the first Microsoft sync.</p>}
    {snapshot?.syncedAt && !snapshot.items.length && <p>No open items.</p>}
    {!!items.length && <ul className="overflow-hidden rounded-lg border border-outline-variant/30 bg-background-container">
      {items.map((item, index) => {
        const previous = items[index - 1];
        const groupBreak = grouped && previous?.title && item.title && previous.aisle !== item.aisle;
        return <li key={item.id} className={cn("break-words text-sm", previous && "border-t", groupBreak ? "border-outline-variant" : "border-outline-variant/30")}>
          {grouped
            ? <button type="button" aria-haspopup="dialog" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-background-bright focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary" onClick={() => setEditing(item)}>
              <span className="min-w-0 break-words">{syncedTitle(item)}</span>
              <ChevronRight size={14} className="shrink-0 text-on-surface-variant" aria-hidden="true" />
            </button>
            : <span className="block px-3 py-2">{syncedTitle(item)}</span>}
        </li>;
      })}
    </ul>}
    {snapshot?.syncedAt && <details className="rounded-lg border border-outline-variant/30 bg-background-container px-3 py-2">
      <summary className="cursor-pointer py-1 text-sm font-medium">Completed Items ({snapshot.completed?.length ?? 0})</summary>
      {snapshot.completed?.length ? <ul className="mt-2 divide-y divide-outline-variant/30">
        {[...snapshot.completed].sort(bySyncedTitle).map(item => <li key={item.id} className="break-words py-2 text-sm text-on-surface-variant">{syncedTitle(item)}</li>)}
      </ul> : <p className="py-2 text-sm text-on-surface-variant">No completed items.</p>}
    </details>}
    {editing && grouped && <EditItemGroup path={path} item={editing} close={() => setEditing(undefined)} />}
  </div>;
}

function listUrl(id: string) {
  return "/todo/" + encodeURIComponent(id);
}

function runStatus(list: List) {
  return list.lastRun ? "Last run · " + new Date(list.lastRun).toLocaleString() : "No runs yet";
}

type GroupingProfile = { id: string; name: string; grocery: boolean; usedBy: number; revision: string; groups: MatchGroup[] };

function ListSettings({ list, refresh, close }: { list: List; refresh: () => Promise<void>; close: () => void }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState(list.unenrollPending ? "Enrollment" : "Grouping");
  const [confirmUnenroll, setConfirmUnenroll] = useState(false);
  const [restorePrefixes, setRestorePrefixes] = useState(list.mode !== "off" || !!list.unenrollPending);
  const [mode, setMode] = useState(list.mode);
  const [profileId, setProfileId] = useState(list.profileId);
  const [capitalizeItems, setCapitalizeItems] = useState(list.capitalizeItems ?? false);
  const [autoCleanup, setAutoCleanup] = useState(list.autoCleanup);
  const [syncMinutes, setSyncMinutes] = useState(String(list.syncMinutes ?? ""));
  const [profiles, setProfiles] = useState<GroupingProfile[]>();
  const [polling, setPolling] = useState<{ minutes: number; options: number[] }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function unenroll() {
    setBusy(true);
    setError("");
    try {
      await api("/lists/" + encodeURIComponent(list.id) + "/unenroll", "POST", { restorePrefixes });
      await refresh();
      close();
      navigate("/todo", { replace: true });
    } catch (error) {
      setError((error as Error).message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void Promise.all([api<GroupingProfile[]>("/grouping-profiles"), api<{ minutes: number; options: number[] }>("/polling")])
      .then(([values, interval]) => { setProfiles(values); setPolling(interval); })
      .catch(error => setError(error.message));
  }, []);
  async function save() {
    setError("");
    setBusy(true);
    try {
      await api("/lists/" + encodeURIComponent(list.id), "PUT", { mode, profileId, autoCleanup, capitalizeItems, syncMinutes: syncMinutes ? Number(syncMinutes) : null });
      await refresh();
      close();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <SettingsDialog title={list.displayName + " settings"} tabs={["Grouping", "Formatting", "Duplicates", "Sync", "Enrollment"]} selected={tab} select={setTab} close={() => { if (!busy) close(); }}>
    <div className="grid gap-4">
      {error && <ErrorBanner message={error} />}
      {list.unenrollPending && <p className="text-sm text-warning">Automatic runs are paused while unenrollment is unfinished. Use the Enrollment tab to retry.</p>}
      {tab === "Enrollment" && <div className="grid gap-4">
        <p className="text-sm text-on-surface-variant">Unenroll this list to stop its automatic actions. Its contents will still be cached on the default schedule. This removes its local settings and remembered corrections.</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 accent-primary" checked={restorePrefixes} disabled={busy} onChange={event => setRestorePrefixes(event.target.checked)} />
          <span>Remove GraphRelay prefixes from open and completed items before unenrolling.</span>
        </label>
        {confirmUnenroll ? <>
          <p className="text-sm">Unenroll {list.displayName}{restorePrefixes ? " and restore names where the GraphRelay prefix is still present" : " with the current Microsoft To Do titles"}?</p>
          <div className="flex flex-wrap gap-2">
            <button className={dangerButtonClass} disabled={busy} onClick={() => void unenroll()}>{busy ? "Unenrolling…" : "Confirm Unenrollment"}</button>
            <button className={secondaryButtonClass} disabled={busy} onClick={() => setConfirmUnenroll(false)}>Cancel</button>
          </div>
        </> : <div><button className={dangerButtonClass} disabled={busy} onClick={() => setConfirmUnenroll(true)}>Unenroll List</button></div>}
      </div>}
      {tab === "Grouping" && <>
        <SettingToggle label="Group Items" hint="Apply a grouping profile to this list. Use Alphabetical sort in Microsoft To Do." checked={mode !== "off"} onChange={enabled => setMode(enabled ? "named" : "off")} />
        {mode !== "off" && <>
          <label className="grid gap-2 text-sm">Grouping Profile
            <SelectInput value={profileId} onChange={setProfileId} disabled={!profiles}>
              {profiles?.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </SelectInput>
          </label>
          <label className="grid gap-2 text-sm">Prefix Style
            <SelectInput value={mode} onChange={setMode}>
              <option value="named">Named · 03 Frozen · Peas</option>
              <option value="number">Number only · 014 · Peas</option>
            </SelectInput>
          </label>
        </>}
      </>}
      {tab === "Formatting" && <SettingToggle label="Capitalize Each Word" hint="Turn frozen garden peas into Frozen Garden Peas. Applies to open items when the list syncs." checked={capitalizeItems} onChange={setCapitalizeItems} />}
      {tab === "Duplicates" && <SettingToggle label="Automatic Duplicate Cleanup" hint="Keep one open copy when possible and skip copies flagged for review." checked={autoCleanup} onChange={setAutoCleanup} />}
      {tab === "Sync" && <label className="grid gap-2 text-sm">Sync Interval
        <SelectInput value={syncMinutes} onChange={setSyncMinutes} disabled={!polling}>
          <option value="">Use default{polling ? " (" + polling.minutes + " min)" : ""}</option>
          {polling?.options.map(minutes => <option key={minutes} value={minutes}>{minutes} min</option>)}
        </SelectInput>
      </label>}
      {tab !== "Enrollment" && <div><button className={primaryButtonClass} disabled={busy || !!list.unenrollPending || !profiles || !polling} onClick={() => void save()}>{busy ? "Saving…" : "Save List Settings"}</button></div>}
    </div>
  </SettingsDialog>;
}

function GroupRow({ group, selected, busy, choose, remove }: {
  group: GroupDraft; selected: boolean; busy: boolean; choose: () => void; remove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: "group:" + group.id, data: { kind: "group", groupId: group.id, label: group.name }, disabled: busy,
  });
  return <div ref={setNodeRef} data-group-id={group.id}
    style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
    className={`flex items-center gap-1 rounded-lg border ${isOver ? "border-primary" : "border-transparent"} ${selected ? "bg-primary-dim text-on-surface" : "text-on-surface-variant hover:bg-background-container-high"}`}>
    <button type="button" className="touch-none rounded p-2 focus-visible:outline-2 focus-visible:outline-primary" {...attributes} {...listeners} disabled={busy} aria-label={"Reorder " + (group.name || "new group")}><GripVertical size={16} /></button>
    <button type="button" className="min-w-0 flex-1 py-2 text-left text-sm" disabled={busy} aria-pressed={selected} onClick={choose}>
      <span className="block truncate">{group.name || "New Group"}</span>
      <span className="text-xs opacity-70">{group.matches.length} items</span>
    </button>
    <button type="button" className="rounded p-2 hover:bg-background-bright disabled:opacity-30" disabled={busy || group.fallback} aria-label={"Remove Group " + group.name} title={group.fallback ? "Other is required" : "Move items to Other and remove group"} onClick={remove}><Minus size={16} /></button>
  </div>;
}

function MatchChip({ item, groupId, busy, selected, choose, remove }: {
  item: string; groupId: string; busy: boolean; selected: boolean; choose: () => void; remove: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: "match:" + item, data: { kind: "item", item, groupId, label: item }, disabled: busy,
  });
  return <span ref={setNodeRef} className={`inline-flex max-w-full items-center rounded-lg border bg-background-container-high text-sm ${selected ? "border-primary" : "border-outline-variant/30"} ${isDragging ? "opacity-30" : ""}`}>
    <button type="button" disabled={busy} {...attributes} onPointerDown={event => listeners?.onPointerDown?.(event)} aria-label={"Move Match " + item}
      className="min-w-0 touch-none break-words px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-primary" onClick={choose}>{item}</button>
    <button type="button" disabled={busy} aria-label={"Remove Match " + item} className="shrink-0 rounded p-2 text-on-surface-variant hover:text-error" onClick={remove}><X size={12} /></button>
  </span>;
}

const profileCollision: CollisionDetection = args => args.active.data.current?.kind === "item"
  ? args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args)
  : closestCenter(args);

function GroupingProfiles({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const [profiles, setProfiles] = useState<GroupingProfile[]>();
  const [selected, setSelected] = useState("");
  const [activeId, setActiveId] = useState("");
  const [name, setName] = useState("");
  const [groups, setGroups] = useState<GroupDraft[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [itemName, setItemName] = useState("");
  const [moveItem, setMoveItem] = useState("");
  const [arranging, setArranging] = useState(false);
  const [dragLabel, setDragLabel] = useState("");
  const nextId = useRef(0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const current = profiles?.find(profile => profile.id === selected);
  const activeGroup = groups.find(group => group.id === activeId);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  function choose(id: string, values = profiles, groupName?: string) {
    const profile = values?.find(profile => profile.id === id);
    const draft = groupingDraft(profile?.groups ?? [{ name: "", matches: [] }, { name: "Other", matches: [] }]);
    setSelected(id);
    setActiveId(draft.find(group => group.name === groupName)?.id ?? draft[0].id);
    setName(profile?.name ?? "");
    setGroups(draft);
    setError("");
    setNotice("");
    setMoveItem("");
    setAddingItem(false);
    setItemName("");
  }
  useEffect(() => {
    void api<GroupingProfile[]>("/grouping-profiles").then(values => { setProfiles(values); choose("groceries", values); }).catch(error => setError(error.message));
  }, []);
  function selectGroup(id: string) {
    setActiveId(id);
    setMoveItem("");
    setAddingItem(false);
    setItemName("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const unnamed = groups.find(group => !group.name.trim());
    if (unnamed) { setActiveId(unnamed.id); setError("Give every group a name before saving."); return; }
    setBusy(true); onBusy(true); setError(""); setNotice("");
    try {
      const saved = await api<GroupingProfile>("/grouping-profiles/" + selected, "PUT", { name, revision: current?.revision, allMatches: true, groups: groups.map(({ name, matches, prefixes, matchPlurals }) => ({ name, matches, prefixes, matchPlurals })) });
      const values = await api<GroupingProfile[]>("/grouping-profiles");
      setProfiles(values); choose(saved.id, values, activeGroup?.name.trim());
      setNotice("saved");
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); onBusy(false); }
  }
  function addGroup() {
    const id = "new-" + nextId.current++;
    setGroups([...groups, { id, name: "", matches: [], prefixes: [], fallback: false, matchPlurals: false }]);
    selectGroup(id);
    setNotice("");
  }
  function deleteGroup(id: string) {
    const next = removeGroup(groups, id);
    setGroups(next);
    if (id === activeId) selectGroup(next.find(group => group.fallback)!.id);
    setNotice("");
  }
  function moveTo(item: string, target: string) {
    setGroups(moveMatch(groups, item, target));
    setMoveItem(""); setNotice("");
  }
  function dragEnd(event: DragEndEvent) {
    setDragLabel("");
    if (!event.over) return;
    const data = event.active.data.current;
    const target = event.over.data.current?.groupId as string | undefined;
    if (!target) return;
    if (data?.kind === "item") moveTo(data.item as string, target);
    else {
      const from = groups.findIndex(group => group.id === data?.groupId);
      const to = groups.findIndex(group => group.id === target);
      if (from >= 0 && to >= 0) { setGroups(arrayMove(groups, from, to)); setNotice(""); }
    }
  }
  function addItem() {
    const item = matchKey(itemName);
    if (!item || !activeGroup) return;
    moveTo(item, activeGroup.id);
    setItemName(""); setAddingItem(false);
  }
  return <form onSubmit={save} className="flex h-[calc(100dvh-17rem)] min-h-[28rem] flex-col rounded-xl border border-outline-variant/30 bg-background-container p-4 sm:p-5">
    <div className="min-h-0 flex-1 overflow-y-auto md:flex md:flex-col md:overflow-hidden">
      {error && <ErrorBanner message={error} />}
      {!profiles && !error && <p>Loading grouping profiles…</p>}
      {profiles && <>
        <div className="mb-4 grid shrink-0 gap-3 md:grid-cols-2">
          <label className="grid gap-2 text-sm">Profile<SelectInput value={selected} onChange={value => choose(value)} disabled={busy}>
            {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}<option value="new">Create A Profile…</option>
          </SelectInput></label>
          <label className="grid gap-2 text-sm">Profile Name<TextInput value={name} onChange={value => { setName(value); setNotice(""); }} required maxLength={80} disabled={busy} /></label>
          {current && <p className="text-sm text-on-surface-variant md:col-span-2">Used by {current.usedBy} {current.usedBy === 1 ? "list" : "lists"}.</p>}
        </div>
        <DndContext sensors={sensors} collisionDetection={profileCollision} onDragStart={event => { setDragLabel(String(event.active.data.current?.label ?? "")); setMoveItem(""); }}
          onDragEnd={dragEnd} onDragCancel={() => setDragLabel("")}>
          <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col rounded-xl border border-outline-variant/30 bg-background-container-low p-3">
              <div className="mb-3 hidden shrink-0 items-center justify-between gap-2 md:flex"><h3 className="text-sm font-semibold">Group Order</h3><span className="text-xs text-on-surface-variant">{groups.length} groups</span></div>
              <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem] items-end gap-2 md:hidden">
                <label className="grid gap-2 text-sm">Selected Group<SelectInput value={activeId} onChange={selectGroup} disabled={busy}>{groups.map(group => <option key={group.id} value={group.id}>{group.name || "New Group"}</option>)}</SelectInput></label>
                <button type="button" className={secondaryButtonClass} aria-label="Remove Selected Group" disabled={busy || activeGroup?.fallback} onClick={() => deleteGroup(activeId)}><Minus size={16} /></button>
                <button type="button" className={secondaryButtonClass} aria-label="Add Group" disabled={busy || groups.length >= 30} onClick={addGroup}><Plus size={16} /></button>
              </div>
              <button type="button" className="mt-2 text-left text-xs text-on-surface-variant md:hidden" aria-expanded={arranging} onClick={() => setArranging(!arranging)}>{arranging ? "Hide Group Order" : "Arrange Groups"}</button>
              <nav aria-label="Profile groups" className={`min-h-0 space-y-1 overflow-y-auto ${arranging ? "mt-2 max-h-40" : "hidden"} md:mt-0 md:block md:max-h-none md:flex-1`}>
                <SortableContext items={groups.map(group => "group:" + group.id)} strategy={verticalListSortingStrategy}>
                  {groups.map(group => <GroupRow key={group.id} group={group} selected={group.id === activeId} busy={busy} choose={() => selectGroup(group.id)} remove={() => deleteGroup(group.id)} />)}
                </SortableContext>
              </nav>
              <button type="button" className={cn(secondaryButtonClass, "mt-3 hidden shrink-0 md:flex")} disabled={busy || groups.length >= 30} aria-label="Add Group" onClick={addGroup}><Plus size={16} />Add Group</button>
            </div>
            {activeGroup && <fieldset disabled={busy} className="flex min-h-0 min-w-0 flex-col gap-4 rounded-xl border border-outline-variant/30 p-4 md:overflow-y-auto">
              <div className="flex shrink-0 flex-wrap items-end gap-x-5 gap-y-2">
                <label className="grid min-w-0 flex-1 basis-48 gap-2 text-sm md:max-w-sm">Group Name<TextInput value={activeGroup.name} onChange={value => { setGroups(groups.map(group => group.id === activeId ? { ...group, name: value } : group)); setNotice(""); }} required maxLength={40} readOnly={activeGroup.fallback} /></label>
                <label className="flex items-center gap-2 pb-3 text-sm">
                  <input type="checkbox" className="accent-primary" checked={activeGroup.matchPlurals} onChange={event => {
                    const enabled = event.target.checked;
                    setGroups(groups.map(group => group.id === activeId ? { ...group, matchPlurals: enabled, matches: compactMatches(group.matches, enabled) } : group));
                    setMoveItem(""); setNotice("");
                  }} />
                  Match singular and plural
                </label>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <h3 className="text-sm">Item Matches</h3>
                <div aria-label="Item Matches" className="flex min-h-24 content-start flex-wrap items-start gap-2 overflow-y-auto rounded-lg border border-outline-variant/30 bg-background p-3 md:flex-1">
                  {activeGroup.matches.map(item => <MatchChip key={item} item={item} groupId={activeId} busy={busy} selected={moveItem === item} choose={() => setMoveItem(moveItem === item ? "" : item)} remove={() => { setGroups(groups.map(group => group.id === activeId ? { ...group, matches: group.matches.filter(value => value !== item) } : group)); setMoveItem(""); setNotice(""); }} />)}
                  <button type="button" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-outline-variant text-on-surface-variant hover:border-primary hover:text-on-surface" aria-label="Add Item Match" disabled={busy} onClick={() => setAddingItem(true)}><Plus size={16} /></button>
                </div>
              </div>
              {addingItem && <div className="flex shrink-0 flex-wrap items-end gap-2">
                <label className="grid min-w-0 flex-1 gap-2 text-sm">New Item Match<TextInput autoFocus value={itemName} onChange={setItemName} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addItem(); } if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setAddingItem(false); } }} /></label>
                <button type="button" className={secondaryButtonClass} disabled={!itemName.trim()} onClick={addItem}>Add Item</button>
              </div>}
              {moveItem && <label className="grid shrink-0 gap-2 text-sm">Move {moveItem} To
                <SelectInput value={activeId} onChange={value => moveTo(moveItem, value)}>{groups.map(group => <option key={group.id} value={group.id}>{group.name || "New Group"}</option>)}</SelectInput>
              </label>}
              {!!activeGroup.prefixes.length && <p className="shrink-0 text-xs text-on-surface-variant">Also matches names starting with {activeGroup.prefixes.join(", ")}.</p>}
            </fieldset>}
          </div>
          <DragOverlay dropAnimation={null}>{dragLabel && <span className="rounded-lg border border-primary bg-background-container-high px-3 py-2 text-sm shadow-xl">{dragLabel}</span>}</DragOverlay>
        </DndContext>
      </>}
    </div>
    <div className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t border-outline-variant/30 pt-4">
      <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => choose(selected)}>Cancel</button>
      <button className={cn(primaryButtonClass, "min-w-32", notice && successButtonClass)} aria-live="polite" disabled={busy || !profiles}>{busy ? "Saving…" : notice ? "Saved" : "Save Changes"}</button>
    </div>
  </form>;
}

type DuplicateCopy = { id: string; title: string; completed: boolean; date?: string; flags: string[] };
type DuplicateProgress = { status: "running"; processed: number; total: number };
type DuplicateRun = DuplicateProgress
  | { status: "finished"; removed: number; skipped: number; failed: number }
  | { status: "failed"; error: string };

type DuplicateGroup = { key: string; name: string; keep: DuplicateCopy; copies: DuplicateCopy[] };

function DuplicatePreview({ path, onRemoved }: { path: string; onRemoved: () => void }) {
  const [snapshot, setSnapshot] = useState<{ groups: DuplicateGroup[]; syncedAt: string | null }>();
  const groups = snapshot?.groups;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState<DuplicateRun | null>(null);
  const progress = run?.status === "running" ? run : null;
  const removing = starting || !!progress;
  const proposed = groups?.flatMap(group => group.copies.filter(copy => !copy.flags.length).map(copy => ({
    id: copy.id, key: group.key, keepId: group.keep.id, completed: copy.completed, keepCompleted: group.keep.completed,
  }))) ?? [];
  async function remove() {
    setStarting(true);
    setConfirming(false);
    setError("");
    try {
      setRun(await api<DuplicateProgress>(path + "/duplicates/remove", "POST", { proposed, background: true }));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setStarting(false);
    }
  }
  async function load(refresh = true) {
    setBusy(true);
    setError("");
    try {
      setSnapshot(await api<{ groups: DuplicateGroup[]; syncedAt: string | null }>(path + "/duplicates"));
      if (refresh) {
        await api(path + "/refresh", "POST");
        setSnapshot(await api<{ groups: DuplicateGroup[]; syncedAt: string | null }>(path + "/duplicates"));
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let stopped = false;
    void api<DuplicateRun | null>(path + "/duplicates/progress").then(value => {
      if (stopped) return;
      setRun(value);
      if (value?.status === "finished" && value.removed) onRemoved();
      void load(value?.status !== "running");
    }).catch(error => {
      if (stopped) return;
      setError(error.message);
      setBusy(false);
    });
    return () => { stopped = true; };
  }, [path]);
  const running = !!progress;
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function pollProgress() {
      try {
        const value = await api<DuplicateRun | null>(path + "/duplicates/progress");
        if (stopped) return;
        setRun(value);
        if (value?.status !== "running") {
          if (value?.status === "finished" && value.removed) onRemoved();
          void load(false);
          return;
        }
      } catch {
        // A temporary connection error should not stop progress tracking.
      }
      if (!stopped) timer = setTimeout(pollProgress, 750);
    }
    timer = setTimeout(pollProgress, 250);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [path, running]);
  return <div className="grid gap-4">
    <p className="text-sm text-on-surface-variant">GraphRelay keeps an open copy when possible. Review the proposed removals before applying them to Microsoft To Do.</p>
    <div className="flex flex-wrap gap-2">
      <button className={secondaryButtonClass} disabled={busy || removing} onClick={() => { setConfirming(false); void load(); }}>Refresh Preview</button>
      {!!proposed.length && !confirming && <button className={secondaryButtonClass} disabled={busy || removing} onClick={() => setConfirming(true)}>Remove Proposed Duplicates ({proposed.length})</button>}
    </div>
    {confirming && !removing && <div className="grid gap-2 rounded-lg border border-warning/35 p-3">
      <p>Remove {proposed.length} proposed {proposed.length === 1 ? "copy" : "copies"} from Microsoft To Do? Copies flagged for review will be skipped.</p>
      <div className="flex flex-wrap gap-2">
        <button className={dangerButtonClass} onClick={() => void remove()}>Confirm Removal</button>
        <button className={secondaryButtonClass} disabled={removing} onClick={() => setConfirming(false)}>Cancel</button>
      </div>
    </div>}
    {progress && <div className="grid gap-2">
      <p role="status">{progress.processed} of {progress.total} processed</p>
      <progress aria-label="Duplicate Cleanup Progress" className="h-2 w-full accent-primary" value={progress.processed} max={progress.total} />
    </div>}
    {starting && <p role="status">Starting duplicate cleanup…</p>}
    {run?.status === "finished" && <p role="status">Removed {run.removed} · Skipped {run.skipped} · Failed {run.failed}</p>}
    {run?.status === "failed" && <ErrorBanner message={run.error} />}
    {error && <ErrorBanner message={error} />}
    {busy && <p role="status">Refreshing duplicates…</p>}
    {snapshot?.syncedAt === null && <p>Waiting for the first Microsoft sync.</p>}
    {snapshot?.syncedAt && <p className="text-xs text-on-surface-variant">Preview from {new Date(snapshot.syncedAt).toLocaleString()}</p>}
    {snapshot?.syncedAt && groups?.length === 0 && <p>No duplicate names found.</p>}
    {groups?.map(group => <section key={group.key} className="grid gap-2 rounded-lg border border-outline-variant/30 p-3">
      <h3 className="font-headline font-semibold">{group.name} × {group.copies.length + 1}</h3>
      <ul className="divide-y divide-outline-variant/30 text-sm">
        {[group.keep, ...group.copies].map(copy => <li key={copy.id} className="grid gap-1 py-2">
          <span className="break-words">{copy.title}</span>
          <span className="text-on-surface-variant">
            {copy.id === group.keep.id ? "Keep" : copy.flags.length ? "Review Before Removing" : "Proposed Removal"}
            {" · "}{copy.completed ? "Completed" : "Open"}
            {copy.date && " · " + new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(copy.date) ? copy.date : copy.date + "Z").toLocaleString()}
          </span>
          {!!copy.flags.length && <span className="text-warning">{copy.flags.join(" · ")}</span>}
        </li>)}
      </ul>
    </section>)}
  </div>;
}

function ListDetail({ list, refresh }: { list: List; refresh: () => Promise<void> }) {
  const [settings, setSettings] = useState(false);
  const [enrollment, setEnrollment] = useState<"idle" | "confirm" | "pending">("idle");
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [itemRevision, setItemRevision] = useState(0);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [history, setHistory] = useState<Activity[]>();
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const { feedback: synced, showFeedback, clearFeedback } = useActionFeedback();
  const path = "/lists/" + encodeURIComponent(list.id);
  useEffect(() => {
    if (list.enrolled || list.lastRun) return;
    let current = true;
    void api(path + "/refresh", "POST").then(() => {
      if (current) { setItemRevision(value => value + 1); void refresh(); }
    }).catch(error => { if (current) setError(error.message); });
    return () => { current = false; };
  }, [path, list.enrolled, list.lastRun]);
  async function enroll() {
    if (enrollment === "idle") {
      setError("");
      setEnrollment("confirm");
      return;
    }
    if (enrollment !== "confirm") return;
    setEnrollment("pending");
    try {
      await api(path + "/enroll", "POST");
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setEnrollment("idle");
    }
  }
  async function sync() {
    setSyncing(true);
    setError("");
    clearFeedback();
    let completed = false;
    try {
      await api(path + "/sync", "POST");
      completed = true;
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setItemRevision(value => value + 1);
      setPreviewRevision(value => value + 1);
      setHistory(undefined);
      await refresh().catch(error => setError(previous => previous || (error as Error).message));
      setSyncing(false);
      if (completed) showFeedback(true);
    }
  }
  async function activity() {
    if (history) { setHistory(undefined); return; }
    setError("");
    setLoadingHistory(true);
    try {
      setHistory(await api<Activity[]>(path + "/activity"));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoadingHistory(false);
    }
  }
  return <Page className="space-y-5">
    <Link to="/todo" className="text-sm text-on-surface-variant">← To Do</Link>
    <PageHeader title={list.displayName}>
      <button className={cn(primaryButtonClass, "min-w-28", synced && successButtonClass)} aria-live="polite" disabled={syncing} onClick={() => void sync()}>
        {syncing ? "Syncing…" : synced ? "Synced" : "Sync Now"}
      </button>
      {list.enrolled ? <button className={secondaryButtonClass} onClick={() => setSettings(true)}>List Settings</button> : <>
        <button className={enrollment === "confirm" ? primaryButtonClass : secondaryButtonClass} disabled={enrollment === "pending"} onClick={() => void enroll()}>
          {enrollment === "pending" ? "Enrolling…" : enrollment === "confirm" ? "Are You Sure?" : "Enroll List"}
        </button>
        {enrollment === "confirm" && <button className={secondaryButtonClass} onClick={() => setEnrollment("idle")}>Cancel</button>}
      </>}
      <button className={secondaryButtonClass} aria-haspopup="dialog" onClick={() => setShowDuplicates(true)}>Duplicates</button>
      <button className={secondaryButtonClass} disabled={loadingHistory} aria-expanded={!!history} onClick={() => void activity()}>{history ? "Hide Activity" : "View Activity"}</button>
    </PageHeader>
    <p className="text-sm text-on-surface-variant">{runStatus(list)}</p>
    {list.unenrollPending && <p className="text-sm text-warning">Unenrollment is unfinished. Open List settings to retry.</p>}
    {(error || list.error) && <ErrorBanner message={error || list.error!} />}
    {history && <SectionCard title="Activity">
      <ul className="grid gap-2 text-sm">
        {history.length ? history.map((item, index) => <li key={index}><time className="mr-2 text-on-surface-variant">{item.created} UTC</time>{item.message}</li>) : <li>No title changes yet.</li>}
      </ul>
    </SectionCard>}
    {showDuplicates && <SettingsDialog title="Duplicates" tabs={[]} selected="" select={() => undefined} close={() => setShowDuplicates(false)}>
      <DuplicatePreview key={previewRevision} path={path} onRemoved={() => { setItemRevision(value => value + 1); setHistory(undefined); void refresh(); }} />
    </SettingsDialog>}
    <ListItems key={itemRevision} path={path} grouped={list.enrolled && list.mode !== "off" && !list.unenrollPending} />
    {settings && list.enrolled && <ListSettings list={list} refresh={async () => { await refresh(); setItemRevision(value => value + 1); setPreviewRevision(value => value + 1); }} close={() => setSettings(false)} />}
  </Page>;
}

function useListDirectory() {
  const [directory, setDirectory] = useState<{ lists: List[]; directoryReady: boolean; directoryError: string; syncing: boolean; connected: boolean }>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => api<NonNullable<typeof directory>>("/list-directory").then(value => {
      if (active) { setDirectory(value); setError(""); }
    }).catch(error => { if (active) setError(error.message); });
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  return { directory, error };
}

function AvailableLists() {
  const { directory, error } = useListDirectory();
  const available = directory?.lists ?? [];
  const message = error || directory?.directoryError;
  return <SectionCard title="Unenrolled Lists">
    {message && <ErrorBanner message={message} />}
    {available.length ? <ul className="grid gap-2">
      {available.map(list => <li key={list.id}>
        <Link to={listUrl(list.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background-container-low px-4 py-3 hover:bg-background-bright">
          <span className="font-medium">{list.displayName}{list.isShared && <small className="ml-2 text-on-surface-variant">Shared</small>}</span>
          <span className="text-sm text-on-surface-variant">Open →</span>
        </Link>
      </li>)}
    </ul> : directory && (
      !directory.connected ? <Link to="/settings">Connect Microsoft in Settings</Link>
      : directory.directoryReady ? <p>All available lists are enrolled.</p>
      : <p>Waiting for the first Microsoft list sync.</p>
    )}
  </SectionCard>;
}

function ListPage({ lists, refresh }: { lists: List[]; refresh: () => Promise<void> }) {
  const { listId } = useParams();
  const [view, setView] = useState<List>();
  const [error, setError] = useState("");
  async function reload() {
    if (!listId) return;
    const value = await api<List>("/lists/" + encodeURIComponent(listId));
    setView(value);
    await refresh();
  }
  useEffect(() => {
    let current = true;
    setView(undefined);
    setError("");
    if (listId) void api<List>("/lists/" + encodeURIComponent(listId)).then(value => {
      if (current) setView(value);
    }).catch(error => { if (current) setError(error.message); });
    return () => { current = false; };
  }, [listId]);
  const list = lists.find(list => list.id === listId) ?? view;
  if (list) return <ListDetail key={list.id} list={list} refresh={reload} />;
  return <Page><PageHeader title="List" />{error ? <ErrorBanner message={error} /> : <PageLoading label="Loading saved list…" />}<Link to="/todo">Back To To Do</Link></Page>;
}

function ToDo() {
  const [lists, setLists] = useState<List[]>();
  const [error, setError] = useState("");
  async function refresh() {
    try {
      setLists(await api<List[]>("/lists"));
      setError("");
    } catch (error) {
      setError((error as Error).message);
    }
  }
  useEffect(() => { void refresh(); }, []);
  if (!lists) return <Page>
    <PageHeader title="To Do" />
    {error ? <><ErrorBanner message={error} /><Link to="/settings">Open Microsoft connection settings</Link></> : <PageLoading label="Loading Microsoft To Do lists…" />}
  </Page>;
  const enrolled = lists.filter(list => list.enrolled);
  return <>
    {error && <Page><ErrorBanner message={error} /></Page>}
    <Routes>
      <Route index element={<Page className="space-y-5">
        <PageHeader title="To Do" />
        <SectionCard title="Enrolled Lists">
          {enrolled.length ? <ul className="grid gap-2">
            {enrolled.map(list => <li key={list.id}>
              <Link to={listUrl(list.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background-container-low px-4 py-3 hover:bg-background-bright">
                <span className="font-medium">{list.displayName}{list.isShared && <small className="ml-2 text-on-surface-variant">Shared</small>}</span>
                <span className="text-sm text-on-surface-variant">{list.error ? "Needs attention" : runStatus(list)}</span>
              </Link>
            </li>)}
          </ul> : <p>No lists enrolled yet.</p>}
        </SectionCard>
        <AvailableLists />
      </Page>} />
      <Route path="enroll" element={<Navigate to="/todo" replace />} />
      <Route path=":listId" element={<ListPage lists={lists} refresh={refresh} />} />
      <Route path=":listId/settings" element={<ListPage lists={lists} refresh={refresh} />} />
    </Routes>
  </>;
}

export default function App() {
  const [session, setSession] = useState<Session>();
  const [error, setError] = useState("");
  const refresh = () => void api<Session>("/session").then(setSession).catch(error => setError(error.message));
  useEffect(() => {
    const expire = () => setSession(current => current?.signedIn ? { configured: true, signedIn: false } : current);
    window.addEventListener(sessionExpiredEvent, expire);
    refresh();
    return () => window.removeEventListener(sessionExpiredEvent, expire);
  }, []);
  function logout() {
    void api("/logout", "POST").then(refresh).catch(error => {
      if (!(error instanceof SessionExpiredError)) setError(error.message);
    });
  }
  if (error) return <Page><ErrorBanner message={error} /></Page>;
  if (!session) return <PageLoading label="Loading GraphRelay…" />;
  if (!session.configured) return <Login firstRun onLogin={refresh} />;
  if (!session.signedIn) return <Login onLogin={refresh} />;
  return <Layout build={session.build} user={{ username: "Administrator", displayName: "Administrator" }} onLogout={logout}>
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/todo/*" element={<ToDo />} />
      <Route path="/calendar" element={<CalendarFeeds />} />
      <Route path="/settings" element={<Settings build={session.build} />} />
      <Route path="*" element={<Navigate replace to="/dashboard" />} />
    </Routes>
  </Layout>;
}
