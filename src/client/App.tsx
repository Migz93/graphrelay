import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Layout from "./components/Layout";
import { ErrorBanner, Page, PageHeader, PageLoading } from "./components/Page";
import { dangerButtonClass, SectionCard, SelectInput, SettingRow, TextInput, primaryButtonClass, secondaryButtonClass } from "./components/FormControls";

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

type Session = { configured: boolean; signedIn: boolean };
type Connection = { account: string | null; redirectUri: string; clientId: string | null; editable: boolean };
type List = {
  id: string; displayName: string; isShared: boolean; isOwner: boolean;
  enrolled: boolean; mode: string; order: string[]; lastRun?: string; error?: string;
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

function Settings() {
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
  return <Page>
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

type ListItem = { id: string; name: string; aisle: string };

function ItemAisles({ path, aisles, refresh }: { path: string; aisles: string[]; refresh: () => Promise<void> }) {
  const [items, setItems] = useState<ListItem[]>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      setItems(await api<ListItem[]>(path + "/items"));
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
  return <div className="grid gap-3 rounded-lg bg-background-container-low p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-medium">Open items</h2>
      <button className={secondaryButtonClass} disabled={busy} onClick={() => void load()}>Refresh items</button>
    </div>
    <p className="text-sm text-on-surface-variant">Changes are saved for items with the same name on this list.</p>
    {error && <ErrorBanner message={error} />}
    {notice && <p role="status" className="text-sm text-success">{notice}</p>}
    {!items && busy && <p>Loading open items…</p>}
    {items?.length === 0 && <p>No open items.</p>}
    {aisles.map(aisle => {
      const group = items?.filter(item => item.aisle === aisle);
      if (!group?.length) return null;
      return <section key={aisle} className="grid gap-2 rounded-lg border border-outline-variant/30 bg-background-container p-3">
        <h4 className="font-headline font-semibold">{aisle}</h4>
        <ul className="divide-y divide-outline-variant/30">
          {group.map(item => <li key={item.id}>
            <label className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="break-all">{item.name}</span>
              <SelectInput aria-label={"Aisle for " + item.name} value={item.aisle} onChange={value => void change(item, value)} disabled={busy}>
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

function ListSettings({ list, refresh }: { list: List; refresh: () => Promise<void> }) {
  const [mode, setMode] = useState(list.mode);
  const [order, setOrder] = useState(list.order);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  function move(index: number, direction: number) {
    const reordered = [...order];
    [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
    setOrder(reordered);
  }
  async function save() {
    setError("");
    setBusy(true);
    try {
      await api("/lists/" + encodeURIComponent(list.id), "PUT", { mode, order });
      await refresh();
      navigate(listUrl(list.id), { replace: !list.enrolled });
    } catch (error) {
      setError((error as Error).message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return <SectionCard title="Prefix and aisle order" description="Choose how GraphRelay groups items and set the list to Alphabetical in Microsoft To Do.">
    {(error || list.error) && <ErrorBanner message={error || list.error!} />}
    <label className="grid gap-2 text-sm">Prefix style
      <SelectInput value={mode} onChange={setMode}>
        <option value="named">Named · 03 Frozen · Peas</option>
        <option value="number">Number only · 014 · Peas</option>
        <option value="off">Off</option>
      </SelectInput>
    </label>
    {mode !== "off" && <ol className="grid gap-2" aria-label="Aisle order">
      {order.map((aisle, index) => <li key={aisle} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background-container-low px-3 py-2">
        <span>{index + 1}. {aisle}</span>
        <div className="flex gap-2">
          <button aria-label={"Move " + aisle + " up"} className={secondaryButtonClass} disabled={!index || busy} onClick={() => move(index, -1)}>↑</button>
          <button aria-label={"Move " + aisle + " down"} className={secondaryButtonClass} disabled={index === order.length - 1 || busy} onClick={() => move(index, 1)}>↓</button>
        </div>
      </li>)}
    </ol>}
    <button className={primaryButtonClass} disabled={busy} onClick={() => void save()}>{list.enrolled ? "Save and run" : "Enroll and run"}</button>
  </SectionCard>;
}

type DuplicateCopy = { id: string; title: string; completed: boolean; date?: string; flags: string[] };
type DuplicateGroup = { key: string; name: string; keep: DuplicateCopy; copies: DuplicateCopy[] };

function DuplicatePreview({ path, onRemoved }: { path: string; onRemoved: () => void }) {
  const [groups, setGroups] = useState<DuplicateGroup[]>();
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
    setGroups(undefined);
    try {
      setGroups(await api<DuplicateGroup[]>(path + "/duplicates"));
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
    {busy && <p role="status">Checking open and completed items…</p>}
    {groups?.length === 0 && <p>No duplicate names found.</p>}
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
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [itemRevision, setItemRevision] = useState(0);
  const [history, setHistory] = useState<Activity[]>();
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");
  const path = "/lists/" + encodeURIComponent(list.id);
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
      <Link className={secondaryButtonClass} to={listUrl(list.id) + "/settings"}>List settings</Link>
      <button className={secondaryButtonClass} aria-expanded={showDuplicates} onClick={() => setShowDuplicates(!showDuplicates)}>{showDuplicates ? "Hide duplicates" : "Preview duplicates"}</button>
      <button className={secondaryButtonClass} disabled={loadingHistory} aria-expanded={!!history} onClick={() => void activity()}>{history ? "Hide activity" : "View activity"}</button>
    </PageHeader>
    <p className="text-sm text-on-surface-variant">{runStatus(list)}</p>
    {(error || list.error) && <ErrorBanner message={error || list.error!} />}
    {history && <SectionCard title="Activity">
      <ul className="grid gap-2 text-sm">
        {history.length ? history.map((item, index) => <li key={index}><time className="mr-2 text-on-surface-variant">{item.created} UTC</time>{item.message}</li>) : <li>No title changes yet.</li>}
      </ul>
    </SectionCard>}
    {showDuplicates && <DuplicatePreview path={path} onRemoved={() => { setItemRevision(value => value + 1); setHistory(undefined); }} />}
    <ItemAisles key={itemRevision} path={path} aisles={list.order} refresh={refresh} />
  </Page>;
}

function EnrollList({ lists, refresh }: { lists: List[]; refresh: () => Promise<void> }) {
  const [selected, setSelected] = useState("");
  const available = lists.filter(list => !list.enrolled);
  const list = available.find(list => list.id === selected);
  return <Page className="space-y-5">
    <Link to="/todo" className="text-sm text-on-surface-variant">← To Do</Link>
    <PageHeader title="Enroll a list" />
    {available.length ? <SectionCard title="Choose a Microsoft To Do list">
      <label className="grid gap-2 text-sm">Microsoft To Do list
        <SelectInput value={selected} onChange={setSelected}>
          <option value="">Choose a list</option>
          {available.map(list => <option key={list.id} value={list.id}>{list.displayName}{list.isShared ? " (shared)" : ""}</option>)}
        </SelectInput>
      </label>
    </SectionCard> : <p>All available lists are enrolled.</p>}
    {list && <ListSettings key={list.id} list={list} refresh={refresh} />}
  </Page>;
}

function EnrolledList({ lists, refresh, settings = false }: { lists: List[]; refresh: () => Promise<void>; settings?: boolean }) {
  const { listId } = useParams();
  const list = lists.find(list => list.enrolled && list.id === listId);
  if (!list) return <Page><PageHeader title="List unavailable" /><Link to="/todo">Back to enrolled lists</Link></Page>;
  if (!settings) return <ListDetail key={list.id} list={list} refresh={refresh} />;
  return <Page className="space-y-5">
    <Link to={listUrl(list.id)} className="text-sm text-on-surface-variant">← {list.displayName}</Link>
    <PageHeader title="List settings" />
    <ListSettings key={list.id} list={list} refresh={refresh} />
  </Page>;
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
        <PageHeader title="To Do"><Link className={primaryButtonClass} to="/todo/enroll">Enroll a list</Link></PageHeader>
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
      </Page>} />
      <Route path="enroll" element={<EnrollList lists={lists} refresh={refresh} />} />
      <Route path=":listId" element={<EnrolledList lists={lists} refresh={refresh} />} />
      <Route path=":listId/settings" element={<EnrolledList lists={lists} refresh={refresh} settings />} />
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
  return <Layout user={{ username: "Administrator", displayName: "Administrator" }} onLogout={() => void api("/logout", "POST").then(refresh).catch(error => setError(error.message))}>
    <Routes>
      <Route path="/dashboard" element={<Page><PageHeader title="Dashboard" /><SectionCard title="Microsoft account companion" description="Manage Microsoft To Do lists and calendar subscriptions."><Link className={primaryButtonClass} to="/settings">Microsoft connection</Link></SectionCard></Page>} />
      <Route path="/todo/*" element={<ToDo />} />
      <Route path="/calendar" element={<Page><PageHeader title="Calendar Feeds" /><SectionCard title="Calendar feeds" description="The ms-ical integration is planned for a later milestone." /></Page>} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate replace to="/dashboard" />} />
    </Routes>
  </Layout>;
}
