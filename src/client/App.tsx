import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useDialogA11y } from "./hooks/useDialogA11y";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Layout, { type BuildInfo } from "./components/Layout";
import { ErrorBanner, Page, PageHeader, PageLoading } from "./components/Page";
import { dangerButtonClass, SectionCard, SelectInput, SettingRow, SettingToggle, TextInput, primaryButtonClass, secondaryButtonClass } from "./components/FormControls";

async function api<T>(path: string, method = "GET", body?: object): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json", "X-GraphRelay": "1" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(details?.error ?? (response.status === 401 ? "Sign-in failed or your session expired." : "Request failed (" + response.status + ")."));
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

type Session = { configured: boolean } & ({ signedIn: false } | { signedIn: true; build: BuildInfo });
type Connection = { account: string | null; redirectUri: string; clientId: string | null; editable: boolean };
type List = {
  id: string; displayName: string; isShared: boolean; isOwner: boolean;
  enrolled: boolean; mode: string; order: string[]; lastRun?: string; error?: string;
  unenrollPending?: boolean; autoCleanup: boolean; profileId: string; syncMinutes: number | null;
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
  return <main className="mx-auto mt-24 max-w-md p-6">
    <PageHeader title="GraphRelay" />
    <SectionCard title={firstRun ? "Set up GraphRelay" : "Sign in"} description={firstRun ? "Choose a password for the GraphRelay web interface." : "Use the administrator password for this instance."}>
      {error && <ErrorBanner message={error} />}
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-2">Password
          <TextInput type="password" autoComplete={firstRun ? "new-password" : "current-password"} value={password} onChange={setPassword} required />
        </label>
        <button className={primaryButtonClass} disabled={busy}>{firstRun ? "Create admin password" : "Sign in"}</button>
      </form>
    </SectionCard>
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
  return <SectionCard title="To Do polling" description="Choose how often GraphRelay checks enrolled lists for changes.">
    {error && <ErrorBanner message={error} />}
    {!!options.length && <form className="grid gap-3" onSubmit={save}>
      <label className="grid gap-2 text-sm">Polling interval
        <SelectInput value={minutes} onChange={setMinutes} disabled={busy}>
          {options.map(option => <option key={option} value={option}>{option} {option === 1 ? "minute" : "minutes"}</option>)}
        </SelectInput>
      </label>
      <div><button className={secondaryButtonClass} disabled={busy || minutes === saved}>Save polling interval</button></div>
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
  async function saveSecret(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSavedSecret(false);
    setSavingSecret(true);
    try {
      await api("/microsoft", "PUT", { clientId, clientSecret: secret });
      setConnection(await api<Connection>("/microsoft"));
      setSecret("");
      setSavedSecret(true);
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
  async function connect() {
    setBusy(true);
    setError("");
    try {
      const { url } = await api<{ url: string }>("/microsoft/connect", "POST");
      window.location.assign(url);
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  const outcome = params.get("connection");
  const reason = params.get("reason") ?? "";
  const signInError = reason === "session"
    ? "The Microsoft sign-in session expired or did not match. Start again from Connect Microsoft in this tab."
    : "Microsoft sign-in failed." + (/^AADSTS[0-9]{4,10}$/.test(reason) ? " Microsoft error " + reason + "." : "") + " Try connecting again.";
  return <Page className="space-y-5">
    <PageHeader title="Settings" />
    {(error || (outcome && !savedSecret)) && <ErrorBanner message={error || (outcome === "wrong-account" ? "Reconnect using the Microsoft account that owns your enrolled lists." : signInError)} />}
    <SectionCard title="Microsoft connection" description="Connect the Microsoft account that owns your shared shopping list.">
      {connection && <>
        <SettingRow label="Account" action>
          <button className={primaryButtonClass} onClick={() => void connect()} disabled={busy || !connection.clientId}>
            {connection.account ? "Reconnect Microsoft" : "Connect Microsoft"}
          </button>
        </SettingRow>
        {connection.account && <p>Connected as {connection.account}</p>}
        <p className="break-all text-sm text-on-surface-variant">Redirect URI · {connection.redirectUri}</p>
        {connection.editable && <details open={!connection.clientId || outcome === "failed"}>
          <summary className="cursor-pointer text-sm">Microsoft app credentials</summary>
          <form onSubmit={saveSecret} className="mt-3 grid gap-3">
            <label className="grid gap-2 text-sm">Application (client) ID
              <TextInput value={clientId} onChange={setClientId} autoComplete="off" required />
            </label>
            <label className="grid gap-2 text-sm">Client secret value
              <TextInput type="password" value={secret} onChange={setSecret} autoComplete="off" required />
            </label>
            <div><button className={secondaryButtonClass} disabled={savingSecret}>Save Microsoft credentials</button></div>
            {savedSecret && <p role="status" className="text-sm text-success">Microsoft credentials saved. Select Connect Microsoft to try again.</p>}
          </form>
        </details>}
      </>}
    </SectionCard>
  </Page>;
}

function Settings({ build }: { build: BuildInfo }) {
  const [params] = useSearchParams();
  if (params.get("tab") !== "about") return <MicrosoftSettings />;
  return <Page className="space-y-5">
    <PageHeader title="About GraphRelay"><Link className={secondaryButtonClass} to="/settings">Back to Settings</Link></PageHeader>
    <SectionCard title="Build information">
      <dl className="grid gap-3 text-sm">
        <div><dt className="text-on-surface-variant">Version</dt><dd>v{build.version}</dd></div>
        <div><dt className="text-on-surface-variant">Channel</dt><dd className="capitalize">{build.channel}</dd></div>
        <div><dt className="text-on-surface-variant">Revision</dt><dd className="break-all font-mono">{build.revision}</dd></div>
      </dl>
    </SectionCard>
  </Page>;
}

type ListItem = { id: string; name: string; aisle: string };

function ItemAisles({ path, aisles, grouped, refresh }: { path: string; aisles: string[]; grouped: boolean; refresh: () => Promise<void> }) {
  const [snapshot, setSnapshot] = useState<{ items: ListItem[]; completed: { id: string; name: string }[]; syncedAt: string | null }>();
  const items = snapshot?.items;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      setSnapshot(await api<{ items: ListItem[]; completed: { id: string; name: string }[]; syncedAt: string | null }>(path + "/items"));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function change(item: ListItem, aisle: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ applied: boolean }>(path + "/items/" + encodeURIComponent(item.id) + "/aisle", "PUT", { name: item.name, aisle });
      setNotice(result.applied ? "Aisle saved for future additions." : "Aisle saved. GraphRelay will apply it on a later run.");
      await load();
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { void load(); }, [path]);
  useEffect(() => {
    if (busy) return;
    let active = true;
    const timer = window.setInterval(() => {
      void api<NonNullable<typeof snapshot>>(path + "/items").then(value => {
        if (active) setSnapshot(value);
      }).catch(() => undefined);
    }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [path, busy]);
  return <div className="grid gap-3 rounded-lg bg-background-container-low p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-medium">Open items</h2>
      <button className={secondaryButtonClass} disabled={busy} onClick={() => void load()}>Refresh items</button>
    </div>
    {grouped && <p className="text-sm text-on-surface-variant">Group corrections are saved for items with the same name on this list.</p>}
    {error && <ErrorBanner message={error} />}
    {notice && <p role="status" className="text-sm text-success">{notice}</p>}
    {!items && busy && <p>Loading open items…</p>}
    {snapshot?.syncedAt === null && <p>Waiting for the first Microsoft sync.</p>}
    {snapshot?.syncedAt && <p className="text-xs text-on-surface-variant">Items synced {new Date(snapshot.syncedAt).toLocaleString()}</p>}
    {snapshot?.syncedAt && items?.length === 0 && <p>No open items.</p>}
    {!grouped && !!items?.length && <ul className="divide-y divide-outline-variant/30 rounded-lg border border-outline-variant/30 bg-background-container px-3">
      {[...items].sort((a, b) => a.name.localeCompare(b.name)).map(item => <li key={item.id} className="break-words py-2 text-sm">{item.name}</li>)}
    </ul>}
    {grouped && aisles.map(aisle => {
      const group = items?.filter(item => (aisles.includes(item.aisle) ? item.aisle : "Other") === aisle);
      if (!group?.length) return null;
      return <section key={aisle} className="grid gap-2 rounded-lg border border-outline-variant/30 bg-background-container p-3">
        <h4 className="font-headline font-semibold">{aisle}</h4>
        <ul className="divide-y divide-outline-variant/30">
          {group.map(item => <li key={item.id}>
            <label className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_12rem]">
              <span className="min-w-0 break-words">{item.name}</span>
              <SelectInput aria-label={"Group for " + item.name} value={aisles.includes(item.aisle) ? item.aisle : "Other"} onChange={value => void change(item, value)} disabled={busy}>
                {aisles.map(option => <option key={option} value={option}>{option}</option>)}
              </SelectInput>
            </label>
          </li>)}
        </ul>
      </section>;
    })}
    {snapshot?.syncedAt && <details className="rounded-lg border border-outline-variant/30 bg-background-container px-3 py-2">
      <summary className="cursor-pointer py-1 text-sm font-medium">Completed items ({snapshot.completed?.length ?? 0})</summary>
      {snapshot.completed?.length ? <ul className="mt-2 divide-y divide-outline-variant/30">
        {[...snapshot.completed].sort((a, b) => a.name.localeCompare(b.name)).map(item => <li key={item.id} className="break-words py-2 text-sm text-on-surface-variant">{item.name}</li>)}
      </ul> : <p className="py-2 text-sm text-on-surface-variant">No completed items.</p>}
    </details>}
  </div>;
}

function listUrl(id: string) {
  return "/todo/" + encodeURIComponent(id);
}

function runStatus(list: List) {
  return list.lastRun ? "Last run · " + new Date(list.lastRun).toLocaleString() : "No runs yet";
}

type GroupingProfile = { id: string; name: string; grocery: boolean; usedBy: number; groups: { name: string; matches: string[] }[] };

function SettingsDialog({ title, tabs, selected, select, close, wide = false, children }: {
  title: string; tabs: string[]; selected: string; select: (tab: string) => void; close: () => void; wide?: boolean; children: ReactNode;
}) {
  const id = useId();
  const ref = useDialogA11y<HTMLDivElement>(true, close);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={close}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className={`w-full rounded-2xl border border-outline-variant/20 bg-background-container p-4 shadow-xl sm:p-6 ${wide ? "flex h-[90dvh] max-h-[52rem] max-w-5xl flex-col overflow-hidden" : "max-h-[90dvh] max-w-2xl overflow-y-auto"}`} onClick={event => event.stopPropagation()}>
      <div className="mb-4 flex shrink-0 items-center justify-between gap-2">
        <h2 id={id} className="font-headline text-lg font-semibold">{title}</h2>
        <button type="button" aria-label="Close settings" data-overlay-initial-focus onClick={close} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-background-container-high hover:text-on-surface"><X size={18} /></button>
      </div>
      <div className="mb-5 flex shrink-0 flex-wrap gap-2 border-b border-outline-variant/30 pb-3" aria-label="Settings sections">
        {tabs.map(tab => <button key={tab} type="button" aria-pressed={selected === tab} className={selected === tab ? primaryButtonClass : secondaryButtonClass} onClick={() => select(tab)}>{tab}</button>)}
      </div>
      {children}
    </div>
  </div>;
}

function ListSettings({ list, refresh, close }: { list: List; refresh: () => Promise<void>; close: () => void }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState(list.unenrollPending ? "Enrollment" : "Grouping");
  const [confirmUnenroll, setConfirmUnenroll] = useState(false);
  const [restorePrefixes, setRestorePrefixes] = useState(list.mode !== "off" || !!list.unenrollPending);
  const [mode, setMode] = useState(list.mode);
  const [profileId, setProfileId] = useState(list.profileId);
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
      await api("/lists/" + encodeURIComponent(list.id), "PUT", { mode, profileId, autoCleanup, syncMinutes: syncMinutes ? Number(syncMinutes) : null });
      await refresh();
      close();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <SettingsDialog title={list.displayName + " settings"} tabs={["Grouping", "Duplicates", "Sync", "Enrollment"]} selected={tab} select={setTab} close={() => { if (!busy) close(); }}>
    <div className="grid gap-4">
      {error && <ErrorBanner message={error} />}
      {list.unenrollPending && <p className="text-sm text-warning">Automatic runs are paused while unenrollment is unfinished. Use the Enrollment tab to retry.</p>}
      {tab === "Enrollment" && <div className="grid gap-4">
        <p className="text-sm text-on-surface-variant">Unenroll this list to stop GraphRelay syncing and managing it. This removes its local settings and remembered corrections.</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 accent-primary" checked={restorePrefixes} disabled={busy} onChange={event => setRestorePrefixes(event.target.checked)} />
          <span>Remove GraphRelay prefixes from open and completed items before unenrolling.</span>
        </label>
        {confirmUnenroll ? <>
          <p className="text-sm">Unenroll {list.displayName}{restorePrefixes ? " and restore names where the GraphRelay prefix is still present" : " with the current Microsoft To Do titles"}?</p>
          <div className="flex flex-wrap gap-2">
            <button className={dangerButtonClass} disabled={busy} onClick={() => void unenroll()}>{busy ? "Unenrolling…" : "Confirm unenrollment"}</button>
            <button className={secondaryButtonClass} disabled={busy} onClick={() => setConfirmUnenroll(false)}>Cancel</button>
          </div>
        </> : <div><button className={dangerButtonClass} disabled={busy} onClick={() => setConfirmUnenroll(true)}>Unenroll list</button></div>}
      </div>}
      {tab === "Grouping" && <>
        <SettingToggle label="Group items" hint="Apply a grouping profile to this list. Use Alphabetical sort in Microsoft To Do." checked={mode !== "off"} onChange={enabled => setMode(enabled ? "named" : "off")} />
        {mode !== "off" && <>
          <label className="grid gap-2 text-sm">Grouping profile
            <SelectInput value={profileId} onChange={setProfileId} disabled={!profiles}>
              {profiles?.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </SelectInput>
          </label>
          <label className="grid gap-2 text-sm">Prefix style
            <SelectInput value={mode} onChange={setMode}>
              <option value="named">Named · 03 Frozen · Peas</option>
              <option value="number">Number only · 014 · Peas</option>
            </SelectInput>
          </label>
        </>}
      </>}
      {tab === "Duplicates" && <SettingToggle label="Automatic duplicate cleanup" hint="Keep one open copy when possible and skip copies flagged for review." checked={autoCleanup} onChange={setAutoCleanup} />}
      {tab === "Sync" && <label className="grid gap-2 text-sm">Sync interval
        <SelectInput value={syncMinutes} onChange={setSyncMinutes} disabled={!polling}>
          <option value="">Use default{polling ? " (" + polling.minutes + " min)" : ""}</option>
          {polling?.options.map(minutes => <option key={minutes} value={minutes}>{minutes} min</option>)}
        </SelectInput>
      </label>}
      {tab !== "Enrollment" && <div><button className={primaryButtonClass} disabled={busy || !!list.unenrollPending || !profiles || !polling} onClick={() => void save()}>{busy ? "Saving…" : "Save list settings"}</button></div>}
    </div>
  </SettingsDialog>;
}

type GroupDraft = { name: string; matches: string; locked: boolean };

function GroupingProfiles({ cancel, onBusy }: { cancel: () => void; onBusy: (busy: boolean) => void }) {
  const [profiles, setProfiles] = useState<GroupingProfile[]>();
  const [selected, setSelected] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [name, setName] = useState("");
  const [groups, setGroups] = useState<GroupDraft[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const current = profiles?.find(profile => profile.id === selected);
  const activeGroup = groups[activeIndex];
  function choose(id: string, values = profiles) {
    const profile = values?.find(profile => profile.id === id);
    setSelected(id);
    setActiveIndex(0);
    setName(profile?.name ?? "");
    setGroups(profile?.groups.map(group => ({
      name: group.name, matches: group.matches.join("\n"),
      locked: group.name === "Other" || !!profile.grocery && ["Produce", "Meat", "Frozen", "Dairy", "Bakery", "Pantry"].includes(group.name),
    })) ?? [{ name: "", matches: "", locked: false }, { name: "Other", matches: "", locked: true }]);
    setError("");
    setNotice("");
  }
  useEffect(() => {
    void api<GroupingProfile[]>("/grouping-profiles").then(values => { setProfiles(values); choose("groceries", values); }).catch(error => setError(error.message));
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    const unnamed = groups.findIndex(group => !group.name.trim());
    if (unnamed >= 0) {
      setActiveIndex(unnamed);
      setError("Give every group a name before saving.");
      return;
    }
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await api<GroupingProfile>("/grouping-profiles/" + selected, "PUT", { name, groups: groups.map(group => ({ name: group.name, matches: group.matches.split("\n") })) });
      const values = await api<GroupingProfile[]>("/grouping-profiles");
      setProfiles(values);
      choose(saved.id, values);
      setNotice("Profile saved. Lists using it will update on their next sync.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  function move(direction: number) {
    const next = [...groups];
    const destination = activeIndex + direction;
    [next[activeIndex], next[destination]] = [next[destination], next[activeIndex]];
    setGroups(next);
    setActiveIndex(destination);
  }
  function update(changes: Partial<GroupDraft>) {
    setGroups(groups.map((group, index) => index === activeIndex ? { ...group, ...changes } : group));
    setNotice("");
  }
  function add() {
    setGroups([...groups, { name: "", matches: "", locked: false }]);
    setActiveIndex(groups.length);
    setNotice("");
  }
  function remove() {
    setGroups(groups.filter((_, index) => index !== activeIndex));
    setActiveIndex(Math.max(0, activeIndex - 1));
    setNotice("");
  }
  return <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
    <div className="min-h-0 flex-1 overflow-y-auto md:flex md:flex-col md:overflow-hidden">
      {error && <ErrorBanner message={error} />}
      {notice && <p role="status" className="mb-3 text-sm text-success">{notice}</p>}
      {!profiles && !error && <p>Loading grouping profiles…</p>}
      {profiles && <>
        <div className="mb-4 grid shrink-0 gap-3 md:grid-cols-2">
          <label className="grid gap-2 text-sm">Profile
            <SelectInput value={selected} onChange={value => choose(value)} disabled={busy}>
              {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              <option value="new">Create a profile…</option>
            </SelectInput>
          </label>
          <label className="grid gap-2 text-sm">Profile name<TextInput value={name} onChange={value => { setName(value); setNotice(""); }} required maxLength={80} disabled={busy} /></label>
          {current && <p className="text-sm text-on-surface-variant md:col-span-2">Used by {current.usedBy} {current.usedBy === 1 ? "list" : "lists"}.{current.grocery ? " Includes the built-in grocery matcher." : ""}</p>}
        </div>
        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="grid gap-2 md:hidden">
            <label htmlFor="profile-mobile-group" className="text-sm">Selected group</label>
            <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_2.5rem] items-center gap-2">
              <SelectInput id="profile-mobile-group" value={activeIndex} onChange={value => setActiveIndex(Number(value))} disabled={busy}>
                {groups.map((group, index) => <option key={index} value={index}>{index + 1}. {group.name || "New group"}</option>)}
              </SelectInput>
              <button type="button" className={secondaryButtonClass} aria-label="Move up" title="Move up" disabled={busy || !activeIndex} onClick={() => move(-1)}><ArrowUp size={16} className="shrink-0" /></button>
              <button type="button" className={secondaryButtonClass} aria-label="Move down" title="Move down" disabled={busy || activeIndex >= groups.length - 1} onClick={() => move(1)}><ArrowDown size={16} className="shrink-0" /></button>
              <button type="button" className={secondaryButtonClass} aria-label="Add group" title="Add group" disabled={busy || groups.length >= 30} onClick={add}><Plus size={16} className="shrink-0" /></button>
            </div>
          </div>
          <div className="hidden min-h-0 flex-col rounded-xl border border-outline-variant/30 bg-background-container-low p-3 md:flex">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Group order</h3>
              <span className="text-xs text-on-surface-variant">{groups.length} groups</span>
            </div>
            <nav aria-label="Profile groups" className="hidden min-h-0 flex-1 space-y-1 overflow-y-auto md:block">
              {groups.map((group, index) => <button key={index} type="button" disabled={busy} aria-pressed={activeIndex === index}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${activeIndex === index ? "bg-primary-dim text-on-surface" : "text-on-surface-variant hover:bg-background-container-high hover:text-on-surface"}`}
                onClick={() => setActiveIndex(index)}>
                <span className="w-5 shrink-0 text-xs opacity-70">{String(index + 1).padStart(2, "0")}</span>
                <span className="truncate">{group.name || "New group"}</span>
              </button>)}
            </nav>
            <div className="mt-3 grid shrink-0 gap-2 border-t border-outline-variant/30 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={secondaryButtonClass + " whitespace-nowrap text-xs"} disabled={busy || !activeIndex} onClick={() => move(-1)}>Move up</button>
                <button type="button" className={secondaryButtonClass + " whitespace-nowrap text-xs"} disabled={busy || activeIndex >= groups.length - 1} onClick={() => move(1)}>Move down</button>
              </div>
              <button type="button" className={secondaryButtonClass} disabled={busy || groups.length >= 30} onClick={add}>Add group</button>
            </div>
          </div>
          {activeGroup && <fieldset disabled={busy} className="flex min-h-0 min-w-0 flex-col gap-4 rounded-xl border border-outline-variant/30 p-4 md:overflow-y-auto">
            <label className="grid shrink-0 gap-2 text-sm">Group name
              <TextInput value={activeGroup.name} onChange={value => update({ name: value })} required maxLength={40} readOnly={activeGroup.locked} />
            </label>
            <label className="flex min-h-0 flex-1 flex-col gap-2 text-sm">
              {current?.grocery ? "Additional item matches" : "Item matches"}
              <textarea className="min-h-32 w-full flex-1 resize-y rounded-lg border border-outline-variant/30 bg-background-container-high p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:resize-none"
                value={activeGroup.matches} onChange={event => update({ matches: event.target.value })} />
            </label>
            <p className="shrink-0 text-xs leading-relaxed text-on-surface-variant">
              {current?.grocery ? "The built-in grocery matcher still applies. Add extra exact item names here, one per line." : "Enter one exact item name per line. Items without a match go to Other."}
            </p>
            {!activeGroup.locked && <div className="shrink-0"><button type="button" className={dangerButtonClass} onClick={remove}>Remove group</button></div>}
          </fieldset>}
        </div>
      </>}
    </div>
    <div className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t border-outline-variant/30 pt-4">
      <button type="button" className={secondaryButtonClass} disabled={busy} onClick={cancel}>Cancel</button>
      <button className={primaryButtonClass} disabled={busy || !profiles}>{busy ? "Saving…" : "Save changes"}</button>
    </div>
  </form>;
}

function ToDoSettings({ close }: { close: () => void }) {
  const [tab, setTab] = useState("Grouping profiles");
  const [busy, setBusy] = useState(false);
  const dismiss = () => { if (!busy) close(); };
  return <SettingsDialog title="To Do settings" tabs={["Grouping profiles", "Sync defaults"]} selected={tab} select={value => { if (!busy) setTab(value); }} close={dismiss} wide={tab === "Grouping profiles"}>
    {tab === "Grouping profiles" ? <GroupingProfiles cancel={dismiss} onBusy={setBusy} /> : <PollingSettings />}
  </SettingsDialog>;
}

type DuplicateCopy = { id: string; title: string; completed: boolean; date?: string; flags: string[] };
type DuplicateGroup = { key: string; name: string; keep: DuplicateCopy; copies: DuplicateCopy[] };

function DuplicatePreview({ path, onRemoved }: { path: string; onRemoved: () => void }) {
  const [snapshot, setSnapshot] = useState<{ groups: DuplicateGroup[]; syncedAt: string | null }>();
  const groups = snapshot?.groups;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [result, setResult] = useState("");
  const proposed = groups?.flatMap(group => group.copies.filter(copy => !copy.flags.length).map(copy => ({
    id: copy.id, key: group.key, keepId: group.keep.id, completed: copy.completed, keepCompleted: group.keep.completed,
  }))) ?? [];
  async function remove() {
    setRemoving(true);
    setError("");
    setResult("");
    try {
      const summary = await api<{ removed: number; skipped: number; failed: number }>(path + "/duplicates/remove", "POST", { proposed });
      setResult(`Removed ${summary.removed} · Skipped ${summary.skipped} · Failed ${summary.failed}`);
      await load();
      if (summary.removed) onRemoved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setRemoving(false);
      setConfirming(false);
    }
  }
  async function load() {
    setBusy(true);
    setError("");
    try {
      setSnapshot(await api<{ groups: DuplicateGroup[]; syncedAt: string | null }>(path + "/duplicates"));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { void load(); }, [path]);
  return <SectionCard title="Duplicate preview" description="GraphRelay keeps an open copy when possible. Review the proposed removals before applying them to Microsoft To Do.">
    <div className="flex flex-wrap gap-2">
      <button className={secondaryButtonClass} disabled={busy || removing} onClick={() => { setConfirming(false); setResult(""); void load(); }}>Refresh preview</button>
      {!!proposed.length && !confirming && <button className={secondaryButtonClass} disabled={busy || removing} onClick={() => setConfirming(true)}>Remove proposed duplicates ({proposed.length})</button>}
    </div>
    {confirming && !removing && <div className="grid gap-2 rounded-lg border border-warning/35 p-3">
      <p>Remove {proposed.length} proposed {proposed.length === 1 ? "copy" : "copies"} from Microsoft To Do? Copies flagged for review will be skipped.</p>
      <div className="flex flex-wrap gap-2">
        <button className={dangerButtonClass} onClick={() => void remove()}>Confirm removal</button>
        <button className={secondaryButtonClass} disabled={removing} onClick={() => setConfirming(false)}>Cancel</button>
      </div>
    </div>}
    {removing && <p role="status">Removing eligible duplicates…</p>}
    {result && <p role="status">{result}</p>}
    {error && <ErrorBanner message={error} />}
    {busy && <p role="status">Loading saved preview…</p>}
    {snapshot?.syncedAt === null && <p>Waiting for the first Microsoft sync.</p>}
    {snapshot?.syncedAt && <p className="text-xs text-on-surface-variant">Preview from {new Date(snapshot.syncedAt).toLocaleString()}</p>}
    {snapshot?.syncedAt && groups?.length === 0 && <p>No duplicate names found.</p>}
    {groups?.map(group => <section key={group.key} className="grid gap-2 rounded-lg border border-outline-variant/30 p-3">
      <h3 className="font-headline font-semibold">{group.name} × {group.copies.length + 1}</h3>
      <ul className="divide-y divide-outline-variant/30 text-sm">
        {[group.keep, ...group.copies].map(copy => <li key={copy.id} className="grid gap-1 py-2">
          <span className="break-words">{copy.title}</span>
          <span className="text-on-surface-variant">
            {copy.id === group.keep.id ? "Keep" : copy.flags.length ? "Review before removing" : "Proposed removal"}
            {" · "}{copy.completed ? "Completed" : "Open"}
            {copy.date && " · " + new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(copy.date) ? copy.date : copy.date + "Z").toLocaleString()}
          </span>
          {!!copy.flags.length && <span className="text-warning">{copy.flags.join(" · ")}</span>}
        </li>)}
      </ul>
    </section>)}
  </SectionCard>;
}

function ListDetail({ list, refresh }: { list: List; refresh: () => Promise<void> }) {
  const [settings, setSettings] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [itemRevision, setItemRevision] = useState(0);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [history, setHistory] = useState<Activity[]>();
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");
  const path = "/lists/" + encodeURIComponent(list.id);
  async function sync() {
    setSyncing(true);
    setError("");
    setSyncNotice("");
    try {
      await api(path + "/sync", "POST");
      setSyncNotice("Sync complete.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setItemRevision(value => value + 1);
      setPreviewRevision(value => value + 1);
      setHistory(undefined);
      await refresh();
      setSyncing(false);
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
      <button className={primaryButtonClass} disabled={syncing} onClick={() => void sync()}>{syncing ? "Syncing…" : "Sync Now"}</button>
      <button className={secondaryButtonClass} onClick={() => setSettings(true)}>List settings</button>
      <button className={secondaryButtonClass} aria-expanded={showDuplicates} onClick={() => setShowDuplicates(!showDuplicates)}>{showDuplicates ? "Hide duplicates" : "Preview duplicates"}</button>
      <button className={secondaryButtonClass} disabled={loadingHistory} aria-expanded={!!history} onClick={() => void activity()}>{history ? "Hide activity" : "View activity"}</button>
    </PageHeader>
    <p className="text-sm text-on-surface-variant">{runStatus(list)}</p>
    {list.unenrollPending && <p className="text-sm text-warning">Unenrollment is unfinished. Open List settings to retry.</p>}
    {syncNotice && <p role="status" className="text-sm text-success">{syncNotice}</p>}
    {(error || list.error) && <ErrorBanner message={error || list.error!} />}
    {history && <SectionCard title="Activity">
      <ul className="grid gap-2 text-sm">
        {history.length ? history.map((item, index) => <li key={index}><time className="mr-2 text-on-surface-variant">{item.created} UTC</time>{item.message}</li>) : <li>No title changes yet.</li>}
      </ul>
    </SectionCard>}
    {showDuplicates && <DuplicatePreview key={previewRevision} path={path} onRemoved={() => { setItemRevision(value => value + 1); setHistory(undefined); }} />}
    <ItemAisles key={itemRevision} path={path} aisles={list.order} grouped={list.mode !== "off"} refresh={refresh} />
    {settings && <ListSettings list={list} refresh={async () => { await refresh(); setItemRevision(value => value + 1); setPreviewRevision(value => value + 1); }} close={() => setSettings(false)} />}
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
  return { directory, setDirectory, error, setError };
}

function AvailableLists() {
  const { directory, error } = useListDirectory();
  const available = directory?.lists ?? [];
  const message = error || directory?.directoryError;
  return <SectionCard title="Available to enroll">
    {message && <ErrorBanner message={message} />}
    {available.length ? <ul className="grid gap-2">
      {available.map(list => <li key={list.id}>
        <Link to={{ pathname: "/todo/enroll", search: new URLSearchParams({ list: list.id }).toString() }} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background-container-low px-4 py-3 hover:bg-background-bright">
          <span className="font-medium">{list.displayName}{list.isShared && <small className="ml-2 text-on-surface-variant">Shared</small>}</span>
          <span className="text-sm text-on-surface-variant">Enroll →</span>
        </Link>
      </li>)}
    </ul> : directory && (
      !directory.connected ? <Link to="/settings">Connect Microsoft in Settings</Link>
      : directory.directoryReady ? <p>All available lists are enrolled.</p>
      : <p>Waiting for the first Microsoft list sync.</p>
    )}
  </SectionCard>;
}

function EnrollList({ refresh }: { refresh: () => Promise<void> }) {
  const navigate = useNavigate();
  const [enrolling, setEnrolling] = useState(false);
  const [params, setParams] = useSearchParams();
  const selected = params.get("list") ?? "";
  const { directory, setDirectory, error, setError } = useListDirectory();
  async function refreshDirectory() {
    if (!directory) return;
    setError("");
    setDirectory({ ...directory, syncing: true });
    try {
      await api("/list-directory/refresh", "POST");
    } catch (error) {
      setDirectory({ ...directory, syncing: false });
      setError((error as Error).message);
    }
  }
  const available = directory?.lists ?? [];
  const list = available.find(list => list.id === selected);
  async function enroll() {
    if (!list) return;
    setEnrolling(true);
    setError("");
    try {
      await api("/lists/" + encodeURIComponent(list.id) + "/enroll", "POST");
      await refresh();
      navigate(listUrl(list.id), { replace: true });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setEnrolling(false);
    }
  }
  return <Page className="space-y-5">
    <Link to="/todo" className="text-sm text-on-surface-variant">← To Do</Link>
    <PageHeader title="Enroll a list">
      {directory?.connected && <button className={secondaryButtonClass} disabled={directory.syncing} onClick={() => void refreshDirectory()}>{directory.syncing ? "Refreshing…" : "Refresh available lists"}</button>}
    </PageHeader>
    {(error || directory?.directoryError) && <ErrorBanner message={error || directory!.directoryError} />}
    {directory && !directory.connected && <Link to="/settings">Connect Microsoft in Settings</Link>}
    {directory?.connected && !directory.directoryReady && <p>Waiting for GraphRelay to sync available Microsoft lists.</p>}
    {available.length ? <SectionCard title="Choose a Microsoft To Do list">
      <label className="grid gap-2 text-sm">Microsoft To Do list
        <SelectInput value={list?.id ?? ""} onChange={value => setParams(value ? { list: value } : {}, { replace: true })}>
          <option value="">Choose a list</option>
          {available.map(list => <option key={list.id} value={list.id}>{list.displayName}{list.isShared ? " (shared)" : ""}</option>)}
        </SelectInput>
      </label>
    </SectionCard> : directory?.directoryReady && <p>All available lists are enrolled.</p>}
    {list && <SectionCard title={list.displayName} description="Enrollment syncs the list into GraphRelay. You can enable automations later in List settings.">
      <button className={primaryButtonClass} disabled={enrolling} onClick={() => void enroll()}>{enrolling ? "Enrolling…" : "Enroll list"}</button>
    </SectionCard>}
  </Page>;
}

function EnrolledList({ lists, refresh }: { lists: List[]; refresh: () => Promise<void> }) {
  const { listId } = useParams();
  const list = lists.find(list => list.enrolled && list.id === listId);
  if (!list) return <Page><PageHeader title="List unavailable" /><Link to="/todo">Back to enrolled lists</Link></Page>;
  return <ListDetail key={list.id} list={list} refresh={refresh} />;
}

function ToDo() {
  const [settings, setSettings] = useState(false);
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
        <PageHeader title="To Do"><button className={secondaryButtonClass} onClick={() => setSettings(true)}>To Do settings</button><Link className={primaryButtonClass} to="/todo/enroll">Enroll a list</Link></PageHeader>
        <SectionCard title="Enrolled lists">
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
        {settings && <ToDoSettings close={() => { setSettings(false); void refresh(); }} />}
      </Page>} />
      <Route path="enroll" element={<EnrollList refresh={refresh} />} />
      <Route path=":listId" element={<EnrolledList lists={lists} refresh={refresh} />} />
      <Route path=":listId/settings" element={<EnrolledList lists={lists} refresh={refresh} />} />
    </Routes>
  </>;
}

export default function App() {
  const [session, setSession] = useState<Session>();
  const [error, setError] = useState("");
  const refresh = () => void api<Session>("/session").then(setSession).catch(error => setError(error.message));
  useEffect(refresh, []);
  if (error) return <Page><ErrorBanner message={error} /></Page>;
  if (!session) return <PageLoading label="Loading GraphRelay…" />;
  if (!session.configured) return <Login firstRun onLogin={refresh} />;
  if (!session.signedIn) return <Login onLogin={refresh} />;
  return <Layout build={session.build} user={{ username: "Administrator", displayName: "Administrator" }} onLogout={() => void api("/logout", "POST").then(refresh).catch(error => setError(error.message))}>
    <Routes>
      <Route path="/dashboard" element={<Page><PageHeader title="Dashboard" /><SectionCard title="Microsoft account companion" description="Manage Microsoft To Do lists and calendar subscriptions."><Link className={primaryButtonClass} to="/settings">Microsoft connection</Link></SectionCard></Page>} />
      <Route path="/todo/*" element={<ToDo />} />
      <Route path="/calendar" element={<Page><PageHeader title="Calendar Feeds" /><SectionCard title="Calendar feeds" description="The ms-ical integration is planned for a later milestone." /></Page>} />
      <Route path="/settings" element={<Settings build={session.build} />} />
      <Route path="*" element={<Navigate replace to="/dashboard" />} />
    </Routes>
  </Layout>;
}
