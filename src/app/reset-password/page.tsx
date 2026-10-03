"use client";

import { useAuth } from "@/context/AuthContext";
import PasswordForm from "@/components/PasswordForm";

export default function ResetPasswordPage() {
  const { user, loading } = useAuth();
  return (
    <main className="password-reset-page">
      <a href="/" className="eyebrow">qatools</a>
      {loading ? <p role="status" className="user-muted">Checking your password reset link...</p>
        : user ? <PasswordForm key={user.id} recovery />
        : <section>
            <h1>Reset password</h1>
            <p role="alert" className="user-muted">Open the latest password reset link from your email. If it has expired or already been used, request a new one.</p>
            <a href="/user?mode=reset">Request a new reset link</a>
          </section>}
      <p><a href="/user?section=general">Back to account</a></p>
    </main>
  );
}
