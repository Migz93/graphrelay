import { useState, type FormEvent } from "react";
import { api, SessionExpiredError } from "../lib/api";
import { primaryButtonClass, SectionCard, SettingRow, TextInput } from "./FormControls";
import { ErrorBanner } from "./Page";

export default function ChangePassword({ editable, onChanged }: { editable: boolean; onChanged: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/change-password", "POST", { currentPassword, newPassword, confirmPassword });
      onChanged();
    } catch (error) {
      if (!(error instanceof SessionExpiredError)) setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!editable) return <SectionCard title="Change Password" description="This installation manages its admin password through the environment." />;
  return <form onSubmit={submit}>
    <SectionCard title="Change Password" description="Changing your GraphRelay password signs out all GraphRelay sessions.">
      <SettingRow label="Current Password" wide>
        <TextInput type="password" autoComplete="current-password" required disabled={busy} maxLength={1024}
          value={currentPassword} onChange={setCurrentPassword} />
      </SettingRow>
      <SettingRow label="New Password" wide>
        <TextInput type="password" autoComplete="new-password" required disabled={busy} maxLength={256}
          value={newPassword} onChange={setNewPassword} />
      </SettingRow>
      <SettingRow label="Confirm New Password" wide>
        <TextInput type="password" autoComplete="new-password" required disabled={busy} maxLength={256}
          value={confirmPassword} onChange={setConfirmPassword} />
      </SettingRow>
      {error && <ErrorBanner message={error} />}
      <div className="flex justify-end border-t border-outline-variant/30 pt-3">
        <button type="submit" className={primaryButtonClass} disabled={busy}>{busy ? "Changing…" : "Change Password"}</button>
      </div>
    </SectionCard>
  </form>;
}
