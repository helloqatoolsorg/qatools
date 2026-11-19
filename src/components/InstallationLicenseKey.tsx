"use client";

import {useEffect, useId, useRef, useState} from "react";
import {useAuth} from "@/context/AuthContext";
import AccountActivationKey from "@/components/AccountActivationKey";
import "./InstallationLicenseKey.css";

function KeyDialog({id, onClose}: {id: string; onClose: () => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {element.close(); document.body.style.overflow = overflow;};
  }, []);
  return <dialog id={id} ref={dialog} className="install-license-dialog" aria-labelledby={id + "-title"}
    onCancel={event => {event.preventDefault(); onClose();}}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <div className="install-license-dialog-heading">
      <h2 id={id + "-title"}>License key</h2>
      <button type="button" className="install-license-close" aria-label="Close license key" onClick={onClose} autoFocus>×</button>
    </div>
    <AccountActivationKey embedded />
  </dialog>;
}

export default function InstallationLicenseKey() {
  const {user, loading} = useAuth();
  const id = useId();
  const userId = user?.id ?? null;
  const trigger = useRef<HTMLButtonElement>(null);
  const pendingLogin = useRef(false);
  const [owner, setOwner] = useState<string | null>(null);
  useEffect(() => {
    const cancel = () => {pendingLogin.current = false;};
    window.addEventListener("qatools:login-cancelled", cancel);
    return () => {pendingLogin.current = false; window.removeEventListener("qatools:login-cancelled", cancel);};
  }, []);
  useEffect(() => {
    let cancelled = false;
    // Resume an explicit request after authentication, never an unrelated login.
    if (!loading && userId && pendingLogin.current) {
      queueMicrotask(() => {if (!cancelled && pendingLogin.current) {pendingLogin.current = false; setOwner(userId);}});
    } else if (!loading && !userId && owner) {
      queueMicrotask(() => {if (!cancelled) setOwner(null);});
    }
    return () => {cancelled = true;};
  }, [userId, loading, owner]);
  function close() {pendingLogin.current = false; setOwner(null); trigger.current?.focus();}
  return <>
    <button ref={trigger} className="install-guide-secondary" type="button" aria-haspopup="dialog"
      aria-controls={id} disabled={loading} onClick={() => {
        if (loading) return;
        if (user) {setOwner(user.id); return;}
        pendingLogin.current = true;
        window.dispatchEvent(new CustomEvent("qatools:login", {detail: {reason: "get your license key"}}));
      }}>Get license key</button>
    {user && owner === user.id && <KeyDialog key={user.id} id={id} onClose={close} />}
  </>;
}
