import { X } from "lucide-react";
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
  autoCleanup: boolean; profileId: string; syncMinutes: number | null;
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
  const [snapshot, setSnapshot] = useState<{ items: ListItem[]; syncedAt: string | null }>();
  const items = snapshot?.items;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      setSnapshot(await api<{ items: ListItem[]; syncedAt: string | null }>(path + "/items"));
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
            <label className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="break-all">{item.name}</span>
              <SelectInput aria-label={"Group for " + item.name} value={aisles.includes(item.aisle) ? item.aisle : "Other"} onChange={value => void change(item, value)} disabled={busy}>
                {aisles.map(option => <option key={option} value={option}>{option}</option>)}
              </SelectInput>
            </label>
          </li>)}
        </ul>
      </section>;
    })}
  </div>;
}

function listUrl(id: string) {
  return "/todo/" + encodeURIComponent(id);
}

function runStatus(list: List) {
  return list.lastRun ? "Last run · " + new Date(list.lastRun).toLocaleString() : "No runs yet";
}

type GroupingProfile = { id: string; name: string; grocery: boolean; usedBy: number; groups: { name: string; matches: string[] }[] };

function SettingsDialog({ title, tabs, selected, select, close, children }: {
  title: string; tabs: string[]; selected: string; select: (tab: string) => void; close: () => void; children: ReactNode;
}) {
  const id = useId();
  const ref = useDialogA11y<HTMLDivElement>(true, close);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={close}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-outline-variant/20 bg-background-container p-6 shadow-xl" onClick={event => event.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 id={id} className="font-headline text-lg font-semibold">{title}</h2>
        <button type="button" aria-label="Close settings" data-overlay-initial-focus onClick={close} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-background-container-high hover:text-on-surface"><X size={18} /></button>
      </div>
      <div className="mb-5 flex flex-wrap gap-2 border-b border-outline-variant/30 pb-3" aria-label="Settings sections">
        {tabs.map(tab => <button key={tab} type="button" aria-pressed={selected === tab} className={selected === tab ? primaryButtonClass : secondaryButtonClass} onClick={() => select(tab)}>{tab}</button>)}
      </div>
      {children}
    </div>
  </div>;
}

function ListSettings({ list, refresh, close }: { list: List; refresh: () => Promise<void>; close: () => void }) {
  const [tab, setTab] = useState("Grouping");
  const [mode, setMode] = useState(list.mode);
  const [profileId, setProfileId] = useState(list.profileId);
  const [autoCleanup, setAutoCleanup] = useState(list.autoCleanup);
  const [syncMinutes, setSyncMinutes] = useState(String(list.syncMinutes ?? ""));
  const [profiles, setProfiles] = useState<GroupingProfile[]>();
  const [polling, setPolling] = useState<{ minutes: number; options: number[] }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
  return <SettingsDialog title={list.displayName + " settings"} tabs={["Grouping", "Duplicates", "Sync"]} selected={tab} select={setTab} close={() => { if (!busy) close(); }}>
    <div className="grid gap-4">
      {error && <ErrorBanner message={error} />}
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
      <div><button className={primaryButtonClass} disabled={busy || !profiles || !polling} onClick={() => void save()}>{busy ? "Saving…" : "Save list settings"}</button></div>
    </div>
  </SettingsDialog>;
}

function GroupingProfiles() {
  const [profiles, setProfiles] = useState<GroupingProfile[]>();
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [groups, setGroups] = useState<{ name: string; matches: string }[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const current = profiles?.find(profile => profile.id === selected);
  function choose(id: string, values = profiles) {
    const profile = values?.find(profile => profile.id === id);
    setSelected(id);
    setName(profile?.name ?? "");
    setGroups(profile?.groups.map(group => ({ name: group.name, matches: group.matches.join("\n") })) ?? [{ name: "", matches: "" }, { name: "Other", matches: "" }]);
    setError("");
    setNotice("");
  }
  useEffect(() => {
    void api<GroupingProfile[]>("/grouping-profiles").then(values => { setProfiles(values); choose("groceries", values); }).catch(error => setError(error.message));
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
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
    }
  }
  function move(index: number, direction: number) {
    const next = [...groups];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setGroups(next);
  }
  return <div className="grid gap-4">
    {error && <ErrorBanner message={error} />}
    {notice && <p role="status" className="text-sm text-success">{notice}</p>}
    {profiles && <form onSubmit={save} className="grid gap-4">
      <label className="grid gap-2 text-sm">Profile
        <SelectInput value={selected} onChange={value => choose(value)} disabled={busy}>
          {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          <option value="new">Create a profile…</option>
        </SelectInput>
      </label>
      {current && <p className="text-sm text-on-surface-variant">Used by {current.usedBy} {current.usedBy === 1 ? "list" : "lists"}.{current.grocery ? " Includes the built-in grocery matcher." : ""}</p>}
      <fieldset disabled={busy} className="grid gap-4">
        <label className="grid gap-2 text-sm">Profile name<TextInput value={name} onChange={setName} required maxLength={80} /></label>
        <p className="text-sm text-on-surface-variant">Groups are applied in this order. Enter one exact item name per line. Items without a match go to Other.</p>
        {groups.map((group, index) => {
          const locked = group.name === "Other" || !!current?.grocery && ["Produce", "Meat", "Frozen", "Dairy", "Bakery", "Pantry"].includes(group.name);
          const update = (changes: Partial<typeof group>) => setGroups(groups.map((value, i) => i === index ? { ...value, ...changes } : value));
          return <div key={index} className="grid gap-2 rounded-lg border border-outline-variant/30 p-3">
            <label className="grid gap-2 text-sm">Group {index + 1}<TextInput value={group.name} onChange={value => update({ name: value })} required maxLength={40} readOnly={locked} /></label>
            <label className="grid gap-2 text-sm">Item matches
              <textarea className="min-h-20 rounded-lg border border-outline-variant/30 bg-background-container-high p-2" value={group.matches} onChange={event => update({ matches: event.target.value })} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondaryButtonClass} disabled={!index} onClick={() => move(index, -1)}>Move up</button>
              <button type="button" className={secondaryButtonClass} disabled={index === groups.length - 1} onClick={() => move(index, 1)}>Move down</button>
              {!locked && <button type="button" className={secondaryButtonClass} onClick={() => setGroups(groups.filter((_, i) => i !== index))}>Remove group</button>}
            </div>
          </div>;
        })}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButtonClass} disabled={groups.length >= 30} onClick={() => setGroups([...groups, { name: "", matches: "" }])}>Add group</button>
          <button className={primaryButtonClass}>Save profile</button>
        </div>
      </fieldset>
    </form>}
  </div>;
}

function ToDoSettings({ close }: { close: () => void }) {
  const [tab, setTab] = useState("Grouping profiles");
  return <SettingsDialog title="To Do settings" tabs={["Grouping profiles", "Sync defaults"]} selected={tab} select={setTab} close={close}>
    {tab === "Grouping profiles" ? <GroupingProfiles /> : <PollingSettings />}
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
