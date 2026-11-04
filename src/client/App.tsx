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
      <h3 className="font-medium">Item aisles</h3>
      <button className={secondaryButtonClass} disabled={busy} onClick={() => void load()}>Refresh items</button>
    </div>
    <p className="text-sm text-on-surface-variant">Changes are saved for items with the same name on this list.</p>
    {error && <ErrorBanner message={error} />}
    {notice && <p role="status" className="text-sm text-success">{notice}</p>}
    {!items && busy && <p>Loading open items…</p>}
    {items?.length === 0 && <p>No open items.</p>}
    {items?.map(item => <label key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="break-all">{item.name}</span>
      <SelectInput aria-label={"Aisle for " + item.name} value={item.aisle} onChange={aisle => void change(item, aisle)} disabled={busy}>
        {aisles.map(aisle => <option key={aisle} value={aisle}>{aisle}</option>)}
      </SelectInput>
    </label>)}
  </div>;
}

function ListCard({ list, refresh }: { list: List; refresh: () => Promise<void> }) {
  const [mode, setMode] = useState(list.mode);
  const [order, setOrder] = useState(list.order);
  const [history, setHistory] = useState<Activity[]>();
  const [showItems, setShowItems] = useState(false);
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
      {list.enrolled && <button className={secondaryButtonClass} aria-expanded={showItems} onClick={() => setShowItems(!showItems)}>{showItems ? "Hide item aisles" : "Edit item aisles"}</button>}
      {list.enrolled && <button className={secondaryButtonClass} aria-expanded={!!history} onClick={() => void activity()}>{history ? "Hide activity" : "View activity"}</button>}
      <span className="text-sm text-on-surface-variant">{list.lastRun ? "Last run · " + new Date(list.lastRun).toLocaleString() : "No runs yet"}</span>
    </div>
    {showItems && <ItemAisles path={path} aisles={list.order} refresh={refresh} />}
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
  if (!session.configured) return <Login firstRun onLogin={refresh} />;
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
