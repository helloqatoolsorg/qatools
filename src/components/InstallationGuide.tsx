"use client";

import { useState } from "react";
import Link from "next/link";
import "./InstallationGuide.css";

type Step = "version" | "welcome" | "download" | "copy" | "restart" | "automatic" | "key" | "activate" | "ready";
type Version = "21.0" | "22.0";

export default function InstallationGuide() {
  const [history, setHistory] = useState<Step[]>(["welcome"]);
  const [hasInstalledBefore, setHasInstalledBefore] = useState(false);
  const [version, setVersion] = useState<Version | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const step = history[history.length - 1];
  const path = version ? `Documents\\houdini${version}\\packages` : "";

  function next(value: Step) {
    setHistory(previous => [...previous, value]);
  }

  async function copyPath() {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

  return <section className="install-guide" aria-label="Installation instructions">
    <div className="install-guide-instruction" key={step}>
      {step === "welcome" && <div className="install-guide-buttons install-guide-start-options">
        <button type="button" onClick={() => {setHasInstalledBefore(false);next("download");}}>I’m installing QATools for the first time →</button>
        <button type="button" onClick={() => {setHasInstalledBefore(true);next("download");}}>I’ve already installed a QATools tool →</button>
      </div>}
      {step === "download" && <>
        <p>Download a tool or bundle. All tools free for 7 days.</p>
        <div className="install-guide-buttons">
          <Link href="/" target="_blank" rel="noopener noreferrer">Choose a tool ↗</Link>
          <button type="button" onClick={() => next("version")}>I have downloaded the tool →</button>
        </div>
      </>}
      {step === "version" && <>
        <p>Which Houdini version are you installing for?</p>
        <div className="install-guide-buttons">
          {(["21.0", "22.0"] as const).map(value => <button key={value} type="button" onClick={() => {
            setVersion(value); setCopied(false); setCopyError(false); next("copy");
          }}>Houdini {value.split(".")[0]} →</button>)}
        </div>
      </>}
      {step === "copy" && <>
        <ol className="install-guide-instructions">
          <li>Close Houdini.</li>
          <li>Extract the ZIP.</li>
          <li>Open your Houdini {version?.split(".")[0]} packages folder.<br />Create it if you don’t see it.
            <div className="install-guide-path"><code>{path}</code><button type="button" onClick={() => void copyPath()}>{copied ? "Copied ✓" : "Copy path"}</button></div>
            <span className="install-guide-feedback" role="status">{copyError ? "Select and copy the path manually." : ""}</span>
          </li>
          <li>Copy the extracted ZIP’s contents and paste them here.</li>
          <li>Replace files if asked.</li>
        </ol>
        <button type="button" onClick={() => next(hasInstalledBefore ? "automatic" : "restart")}>The files are in the packages folder →</button>
      </>}
      {step === "automatic" && <>
        <p className="install-guide-complete" role="status">You are set !</p>
        <p>Restart Houdini and place your tool.<br />Your existing license will be detected automatically.</p>
        <Link href="/">Back to tools ↗</Link>
        <div className="install-guide-activation-help">
          <p>If the tool is inactive, continue to license activation.</p>
          <button type="button" className="install-guide-secondary" onClick={() => next("key")}>Go to license activation →</button>
        </div>
      </>}
      {step === "restart" && <>
        <ol className="install-guide-instructions">
          <li>Restart Houdini.</li>
          <li>Search for your node and place it.</li>
          <li>Open the <span className="install-guide-control">License</span> tab in the parameters.</li>
        </ol>
        <p>Does it show an active license?</p>
        <div className="install-guide-buttons">
          <button className="install-guide-answer-yes" type="button" onClick={() => next("ready")}>Yes, it is active →</button>
          <button className="install-guide-answer-no" type="button" onClick={() => next("key")}>No, connect my account →</button>
        </div>
      </>}
      {step === "key" && <>
        <ol className="install-guide-instructions">
          <li>Click <span className="install-guide-control">Get license key</span> here or in the tool’s <span className="install-guide-control">License</span> tab.
            <div className="install-guide-inline-link"><Link href="/user?section=license&highlight=key" target="_blank" rel="noopener noreferrer">Get license key ↗</Link></div>
          </li>
          <li>Copy your license key.</li>
        </ol>
        <button type="button" onClick={() => next("activate")}>I have copied my key →</button>
      </>}
      {step === "activate" && <>
        <ol className="install-guide-instructions">
          <li>Return to Houdini while connected to the internet.</li>
          <li>In the <span className="install-guide-control">License</span> tab, click <span className="install-guide-control">Activate</span> and paste your key.</li>
          <li>Confirm activation.</li>
        </ol>
        <button type="button" onClick={() => next("ready")}>My license is active →</button>
      </>}
      {step === "ready" && <>
        <p className="install-guide-complete" role="status">Enjoy !</p>
        <Link href="/">Back to tools ↗</Link>
      </>}
    </div>
    {history.length > 1 && <div className="install-guide-navigation">
      <button type="button" onClick={() => setHistory(previous => previous.slice(0, -1))}>← Back</button>
      {(step === "ready" || step === "automatic") && <button type="button" onClick={() => {setHistory(["welcome"]);setHasInstalledBefore(false);setVersion(null);setCopied(false);setCopyError(false);}}>Start again</button>}
    </div>}
  </section>;
}
