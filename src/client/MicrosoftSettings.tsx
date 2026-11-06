import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorBanner } from "./components/Page";
import { SectionCard, SettingRow, TextInput, primaryButtonClass, secondaryButtonClass, successButtonClass } from "./components/FormControls";
import { api } from "./lib/api";
import { useActionFeedback } from "./lib/useActionFeedback";
import { cn } from "./lib/utils";

type Connection = { account: string | null; calendarAccess: boolean; needsReconnect: boolean; hasClientSecret: boolean; redirectUri: string; trustProxy: boolean; clientId: string | null; editable: boolean };
type AccessCheck = { todo: boolean; calendar: boolean | null; needsReconnect: boolean };

export default function MicrosoftSettings({ onAccountChange }: { onAccountChange: (account: string | null) => void }) {
  const [connection, setConnection] = useState<Connection>();
  const [error, setError] = useState("");
  const [action, setAction] = useState<"address" | "save" | "connect" | "test">();
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [credentialsNeedReconnect, setCredentialsNeedReconnect] = useState(false);
  const [access, setAccess] = useState<AccessCheck>();
  const [copyHint, setCopyHint] = useState(false);
  const redirectInput = useRef<HTMLInputElement>(null);
  const { feedback, showFeedback, clearFeedback } = useActionFeedback<"address" | "save" | "copy">();
  const [params, setParams] = useSearchParams();
  const outcome = params.get("connection");
  const reason = params.get("reason") ?? "";
  const configuredOrigin = connection && new URL(connection.redirectUri).origin;
  const browserOrigin = window.location.origin;
  const onConfiguredOrigin = browserOrigin === configuredOrigin;
  const canUseBrowserOrigin = window.location.protocol === "https:" || window.location.hostname === "localhost";

  useEffect(() => {
    let current = true;
    void api<Connection>("/microsoft").then(value => {
      if (current) { setConnection(value); setClientId(value.clientId ?? ""); }
    }).catch(error => { if (current) setError(error.message); });
    return () => { current = false; };
  }, []);

  function clearOutcome() {
    if (outcome) setParams({ tab: "microsoft" }, { replace: true });
  }

  async function useBrowserAddress() {
    if (!connection) return;
    setAction("address");
    setError("");
    try {
      const { redirectUri } = await api<{ redirectUri: string }>("/network", "PUT", { publicUrl: browserOrigin, trustProxy: connection.trustProxy });
      setConnection({ ...connection, redirectUri });
      clearOutcome();
      showFeedback("address");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setAction(undefined);
    }
  }

  async function copyRedirect() {
    if (!connection) return;
    setCopyHint(false);
    try {
      await navigator.clipboard.writeText(connection.redirectUri);
      showFeedback("copy");
    } catch {
      redirectInput.current?.select();
      setCopyHint(true);
    }
  }

  async function saveCredentials(event: FormEvent) {
    event.preventDefault();
    setAction("save");
    setError("");
    setAccess(undefined);
    clearFeedback();
    try {
      await api("/microsoft", "PUT", { clientId, clientSecret: secret });
      const updated = await api<Connection>("/microsoft");
      setConnection(updated);
      onAccountChange(updated.account);
      setCredentialsNeedReconnect(!!updated.account && reconnectNeeded);
      setSecret("");
      clearOutcome();
      showFeedback("save");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setAction(undefined);
    }
  }

  async function connect() {
    setAction("connect");
    setError("");
    try {
      const { url } = await api<{ url: string }>("/microsoft/connect", "POST");
      window.location.assign(url);
    } catch (error) {
      setError((error as Error).message);
      setAction(undefined);
    }
  }

  async function testConnection() {
    setAction("test");
    setError("");
    setAccess(undefined);
    try {
      setAccess(await api<AccessCheck>("/microsoft/test", "POST"));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setAction(undefined);
    }
  }

  useEffect(() => {
    if (outcome === "connected" && connection?.account) void testConnection();
  }, [outcome, connection?.account]);

  const secretError = outcome === "failed" && ["AADSTS7000215", "AADSTS7000222"].includes(reason);
  const connectionError = outcome === "wrong-account"
    ? "Reconnect with the Microsoft account that owns your enrolled lists or calendar feeds."
    : outcome === "failed" && !secretError
      ? reason === "session"
        ? "The Microsoft sign-in session expired or did not match. Start again from Connect Microsoft in this tab."
        : "Microsoft sign-in failed." + (/^AADSTS[0-9]{4,10}$/.test(reason) ? " Microsoft error " + reason + "." : "") + " Try connecting again."
      : "";
  const missingCalendarAccess = !!connection?.account && !connection.calendarAccess;
  const reconnectNeeded = missingCalendarAccess || (access?.needsReconnect ?? connection?.needsReconnect) || credentialsNeedReconnect || outcome === "failed" || outcome === "wrong-account" || access?.todo === false || access?.calendar === false;
  const connectDisabled = !!action || !connection?.clientId || !onConfiguredOrigin;

  return <div className="space-y-5">
    {(error || connectionError) && <ErrorBanner message={error || connectionError} />}
    {!connection && !error && <p className="text-sm text-on-surface-variant">Loading Microsoft settings…</p>}
    {connection && <>
      <SectionCard title="Microsoft Connection" description="Manage the account GraphRelay uses for To Do and Calendar.">
        <SettingRow label="Account" hint={connection.account ? <>{connection.account}{missingCalendarAccess && <span className="block">Reconnect to grant Calendar access.</span>}</> : "Follow the setup instructions below."} action>
          {connection.account && reconnectNeeded
            ? <button className={primaryButtonClass} disabled={connectDisabled || secretError} onClick={() => void connect()}>Reconnect Microsoft</button>
            : <span className="text-sm text-on-surface-variant">{connection.account ? "Connected" : "Not Connected"}</span>}
        </SettingRow>
        {connection.account && <div>
          <button className={secondaryButtonClass} disabled={!!action} onClick={() => void testConnection()}>
            {action === "test" ? "Testing…" : "Test Connection"}
          </button>
          {access && <p role="status" className="mt-2 text-sm">
            To Do: {access.todo ? "Working" : "Could not read lists"}{access.calendar !== null && (access.calendar ? " · Calendar: Working" : " · Could not read calendars")}
          </p>}
        </div>}
      </SectionCard>

      <SectionCard title="Microsoft App Setup">
        <details open={!connection.account || outcome === "failed" || feedback === "save"}>
          <summary className="cursor-pointer font-medium">Setup Instructions</summary>
          <ol className="mt-4 list-decimal space-y-5 pl-5 text-sm">
            <li>
              <strong>Confirm the callback address</strong>
              <div className="mt-2 grid gap-2">
                {!onConfiguredOrigin && <>
                  <p className="break-words text-warning">You’re browsing from {browserOrigin}. GraphRelay is configured for {configuredOrigin}.</p>
                  <p className="text-on-surface-variant">
                    <a className="underline" href={configuredOrigin + "/settings?tab=microsoft"}>Open the configured address</a> before signing in with Microsoft.
                    {!canUseBrowserOrigin && <> For a remote callback, use an HTTPS address. Set it under <Link className="underline" to="/settings?tab=general">Settings → General → Network</Link>.</>}
                  </p>
                  {canUseBrowserOrigin && <div><button className={secondaryButtonClass} disabled={!!action} onClick={() => void useBrowserAddress()}>
                    {action === "address" ? "Saving…" : "Use This Address"}
                  </button></div>}
                </>}
                {browserOrigin.startsWith("https:") && !connection.trustProxy && <p className="text-on-surface-variant">
                  If you use a reverse proxy, configure Trust Proxy in <Link className="underline" to="/settings?tab=general">Settings → General → Network</Link>.
                </p>}
                {feedback === "address" && <p role="status" className="text-on-surface-variant">Use the updated redirect URI below in Entra.</p>}
                <label className="grid gap-1.5">
                  Microsoft Redirect URI
                  <input ref={redirectInput} readOnly value={connection.redirectUri} onFocus={event => event.currentTarget.select()}
                    className="w-full min-w-0 rounded-lg border border-outline-variant/30 bg-background px-3 py-2 text-on-surface" />
                </label>
                <div><button className={cn(secondaryButtonClass, feedback === "copy" && successButtonClass)} aria-live="polite" onClick={() => void copyRedirect()}>
                  {feedback === "copy" ? "Copied" : "Copy Redirect URI"}
                </button></div>
                {copyHint && <p role="status" className="text-on-surface-variant">The redirect URI is selected. Copy it from the field.</p>}
              </div>
            </li>
            <li>
              <strong>Register your app in Entra</strong>
              <p className="mt-1 text-on-surface-variant">Go to <strong>Entra ID → App registrations → New registration</strong>. Name it GraphRelay and choose an account type that includes personal Microsoft accounts if you use Outlook.com. Add the redirect URI above under <strong>Authentication → Web</strong>.</p>
              <a href="https://entra.microsoft.com/" target="_blank" rel="noreferrer" className={cn(secondaryButtonClass, "mt-2")}>Open Microsoft Entra</a>
            </li>
            <li>
              <strong>Save your app credentials</strong>
              <p className="mt-1 text-on-surface-variant">Copy the client ID from <strong>Overview</strong>. Go to <strong>Certificates &amp; secrets → Client secrets → New client secret</strong> and copy its <strong>Value</strong> before leaving Entra.</p>
              {secretError && <ErrorBanner message={reason === "AADSTS7000222" ? "The Microsoft client secret expired. Create a new one and paste its Value below." : "Microsoft rejected the client secret. Paste the secret Value from Entra and check that it belongs to this client ID."} />}
              {connection.editable ? <form onSubmit={saveCredentials} onChange={clearFeedback} className="mt-3 grid gap-3">
                <label className="grid gap-2">Application (Client) ID
                  <TextInput value={clientId} onChange={setClientId} autoComplete="off" required disabled={!!action} />
                </label>
                <label className="grid gap-2">Client Secret Value
                  <TextInput type="password" value={secret} onChange={setSecret} placeholder={connection.hasClientSecret ? "********" : undefined} autoComplete="off" required disabled={!!action} />
                </label>
                <div><button className={cn(secondaryButtonClass, "min-w-56", feedback === "save" && successButtonClass)} aria-live="polite" disabled={!!action || !onConfiguredOrigin}>
                  {action === "save" ? "Saving…" : feedback === "save" ? "Saved" : "Save Microsoft Credentials"}
                </button></div>
              </form> : <p className="mt-1 text-on-surface-variant">This installation reads Microsoft credentials from its environment.</p>}
            </li>
            <li>
              <strong>Connect your account</strong>
              <p className="mt-1 text-on-surface-variant">Microsoft asks for To Do and Calendar access during sign-in. Work or school accounts may need approval from an administrator.</p>
              {!connection.account && <button className={cn(primaryButtonClass, "mt-2")} disabled={connectDisabled} onClick={() => void connect()}>Connect Microsoft</button>}
            </li>
          </ol>
        </details>
      </SectionCard>
    </>}
  </div>;
}
