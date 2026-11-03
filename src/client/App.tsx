import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import Layout from "./components/Layout";
import { ErrorBanner, Page, PageHeader, PageLoading } from "./components/Page";
import { SectionCard, SelectInput, SettingRow, TextInput, primaryButtonClass, secondaryButtonClass } from "./components/FormControls";

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

type Session = { configured: boolean; signedIn: boolean; redirectUri: string };
type Connection = { account: string | null; redirectUri: string };
type List = {
  id: string; displayName: string; isShared: boolean; isOwner: boolean;
  enrolled: boolean; mode: string; order: string[]; lastRun?: string; error?: string;
};
type Activity = { created: string; message: string };

function Setup({ redirectUri, onSetup }: { redirectUri: string; onSetup: () => void }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/setup", "POST", { clientId: clientId.trim(), clientSecret: clientSecret.trim(), password });
      onSetup();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <main className="mx-auto mt-12 max-w-xl p-6">
    <PageHeader title="Set up GraphRelay" />
    <SectionCard title="Microsoft app registration" description="Add the following Web redirect URI to your Microsoft Entra app registration and grant delegated Tasks.ReadWrite access.">
      <code className="break-all text-sm">{redirectUri}</code>
      {error && <ErrorBanner message={error} />}
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-2">Application (client) ID
          <TextInput value={clientId} onChange={setClientId} autoComplete="off" required />
        </label>
        <label className="grid gap-2">Client secret value
          <TextInput type="password" value={clientSecret} onChange={setClientSecret} autoComplete="off" required />
        </label>
        <label className="grid gap-2">GraphRelay admin password
          <TextInput type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={12} maxLength={256} required />
          <span className="text-sm text-on-surface-variant">Choose at least 12 characters.</span>
        </label>
        <button className={primaryButtonClass} disabled={busy}>Finish setup</button>
      </form>
    </SectionCard>
  </main>;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
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
    <SectionCard title="Sign in" description="Use the administrator password for this instance.">
      {error && <ErrorBanner message={error} />}
      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-2">Password
          <TextInput type="password" autoComplete="current-password" value={password} onChange={setPassword} required />
        </label>
        <button className={primaryButtonClass} disabled={busy}>Sign in</button>
      </form>
    </SectionCard>
  </main>;
}

function Settings() {
  const [connection, setConnection] = useState<Connection>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  useEffect(() => {
    void api<Connection>("/microsoft").then(setConnection).catch(error => setError(error.message));
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
    {(error || outcome) && <ErrorBanner message={error || (outcome === "wrong-account" ? "Reconnect using the Microsoft account that owns your enrolled lists." : signInError)} />}
    <SectionCard title="Microsoft connection" description="Connect the Microsoft account that owns your shared shopping list.">
      {connection && <>
        <SettingRow label="Account" action>
          <button className={primaryButtonClass} onClick={() => void connect()} disabled={busy}>
            {connection.account ? "Reconnect Microsoft" : "Connect Microsoft"}
          </button>
        </SettingRow>
        {connection.account && <p>Connected as {connection.account}</p>}
        <p className="break-all text-sm text-on-surface-variant">Redirect URI · {connection.redirectUri}</p>
      </>}
    </SectionCard>
  </Page>;
}

function ListCard({ list, refresh }: { list: List; refresh: () => Promise<void> }) {
  const [mode, setMode] = useState(list.mode);
  const [order, setOrder] = useState(list.order);
  const [history, setHistory] = useState<Activity[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const path = "/lists/" + encodeURIComponent(list.id);
  function move(index: number, direction: number) {
    const reordered = [...order];
    [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
    setOrder(reordered);
  }
  async function save() {
    setError("");
    setBusy(true);
    try {
      await api(path, "PUT", { mode, order });
      if (history) setHistory(await api<Activity[]>(path + "/activity"));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  async function activity() {
    if (history) { setHistory(undefined); return; }
    setError("");
    try {
      setHistory(await api<Activity[]>(path + "/activity"));
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return <SectionCard title={list.displayName} description={list.isShared ? "Shared list" : "Personal list"}>
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
    <div className="flex flex-wrap items-center gap-3">
      <button className={primaryButtonClass} disabled={busy} onClick={() => void save()}>{list.enrolled ? "Save and run" : "Enroll and run"}</button>
      {list.enrolled && <button className={secondaryButtonClass} aria-expanded={!!history} onClick={() => void activity()}>{history ? "Hide activity" : "View activity"}</button>}
      <span className="text-sm text-on-surface-variant">{list.lastRun ? "Last run · " + new Date(list.lastRun).toLocaleString() : "No runs yet"}</span>
    </div>
    {history && <ul className="grid gap-2 text-sm">
      {history.length ? history.map((item, index) => <li key={index}><time className="mr-2 text-on-surface-variant">{item.created} UTC</time>{item.message}</li>) : <li>No title changes yet.</li>}
    </ul>}
  </SectionCard>;
}

function ToDo() {
  const [lists, setLists] = useState<List[]>();
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  async function refresh() {
    try {
      setLists(await api<List[]>("/lists"));
      setError("");
    } catch (error) {
      setError((error as Error).message);
    }
  }
  useEffect(() => { void refresh(); }, []);
  const available = lists?.filter(list => !list.enrolled);
  const visible = lists?.filter(list => list.enrolled || list.id === selected);
  return <Page className="space-y-5">
    <PageHeader title="To Do" />
    <p className="text-on-surface-variant">Set the enrolled list to Alphabetical in Microsoft To Do. GraphRelay checks for new items about every 90 seconds.</p>
    {error && <><ErrorBanner message={error} /><Link to="/settings">Open Microsoft connection settings</Link></>}
    {!lists && !error && <PageLoading label="Loading Microsoft To Do lists…" />}
    {!!available?.length && <SectionCard title="Enroll a list" description="Use a disposable shared list for the first run.">
      <label className="grid gap-2 text-sm">Microsoft To Do list
        <SelectInput value={selected} onChange={setSelected}>
          <option value="">Choose a list</option>
          {available.map(list => <option key={list.id} value={list.id}>{list.displayName}{list.isShared ? " (shared)" : ""}</option>)}
        </SelectInput>
      </label>
    </SectionCard>}
    {visible?.map(list => <ListCard key={list.id} list={list} refresh={refresh} />)}
  </Page>;
}

export default function App() {
  const [session, setSession] = useState<Session>();
  const [error, setError] = useState("");
  const refresh = () => void api<Session>("/session").then(setSession).catch(error => setError(error.message));
  useEffect(refresh, []);
  if (error) return <Page><ErrorBanner message={error} /></Page>;
  if (!session) return <PageLoading label="Loading GraphRelay…" />;
  if (!session.configured) return <Setup redirectUri={session.redirectUri} onSetup={refresh} />;
  if (!session.signedIn) return <Login onLogin={refresh} />;
  return <Layout user={{ username: "Administrator", displayName: "Administrator" }} onLogout={() => void api("/logout", "POST").then(refresh).catch(error => setError(error.message))}>
    <Routes>
      <Route path="/dashboard" element={<Page><PageHeader title="Dashboard" /><SectionCard title="Microsoft account companion" description="Manage Microsoft To Do lists and calendar subscriptions."><Link className={primaryButtonClass} to="/settings">Microsoft connection</Link></SectionCard></Page>} />
      <Route path="/todo" element={<ToDo />} />
      <Route path="/calendar" element={<Page><PageHeader title="Calendar Feeds" /><SectionCard title="Calendar feeds" description="The ms-ical integration is planned for a later milestone." /></Page>} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate replace to="/dashboard" />} />
    </Routes>
  </Layout>;
}
