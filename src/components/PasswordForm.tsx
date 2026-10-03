"use client";

import { FormEvent, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

export default function PasswordForm({ recovery = false }: { recovery?: boolean }) {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [nonce, setNonce] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    setMessage(null);
    if (!user?.email) { setError("Please log in again before changing your password."); return; }
    if (password.length < 12) { setError("Use at least 12 characters for your new password."); return; }
    if (password !== confirmation) { setError("The new passwords do not match."); return; }
    if (!recovery && !currentPassword) { setError("Enter your current password."); return; }
    if (!recovery && password === currentPassword) { setError("Choose a different new password."); return; }
    submitting.current = true;
    setBusy(true);
    try {
      if (!recovery) {
        const result = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
        if (result.error) { setError(result.error.message); return; }
        if (result.data.user?.id !== user.id) { setError("Your account changed. Reload this page and try again."); return; }
      }
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        ...(recovery ? {} : { current_password: currentPassword }),
        ...(needsCode ? { nonce: nonce.trim() } : {}),
      });
      if (updateError) {
        if (updateError.code === "reauthentication_needed") {
          const { error: codeError } = await supabase.auth.reauthenticate();
          if (codeError) { setError(codeError.message); return; }
          setNeedsCode(true);
          setMessage("Check your email for a verification code, enter it below, and submit again.");
        } else { setError(updateError.message); }
        return;
      }
      setCurrentPassword(""); setPassword(""); setConfirmation(""); setNonce(""); setNeedsCode(false);
      setMessage("Password updated. Use your new password the next time you log in.");
    } catch {
      setError("Unable to update your password. Check your connection and try again.");
    } finally { submitting.current = false; setBusy(false); }
  }

  return (
    <form className="profile-form password-form" onSubmit={handleSubmit} aria-label={recovery ? "Set new password" : "Change password"}>
      <h2>{recovery ? "Set new password" : "Change password"}</h2>
      <p className="user-muted">Use a unique password with at least 12 characters.</p>
      <input type="text" name="username" autoComplete="username" value={user?.email ?? ""} readOnly hidden />
      {!recovery && <label>Current password
        <input type="password" name="current-password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} disabled={busy} />
      </label>}
      <label>New password
        <input type="password" name="new-password" autoComplete="new-password" required minLength={12} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
      </label>
      <label>Confirm new password
        <input type="password" name="confirm-password" autoComplete="new-password" required minLength={12} value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} />
      </label>
      {needsCode && <label>Email verification code
        <input type="text" autoComplete="one-time-code" required value={nonce} onChange={e => setNonce(e.target.value)} disabled={busy} />
      </label>}
      <button type="submit" disabled={busy}>{busy ? "UPDATING..." : "UPDATE PASSWORD"}</button>
      {error && <p role="alert" className="password-error">{error}</p>}
      {message && <p role="status" className="password-success">{message}</p>}
    </form>
  );
}
