"use client";

import { useState } from "react";
import Link from "next/link";
import "./InstallationGuide.css";

const steps = ["Download", "Install", "Restart", "Activate", "Ready"];
const confirmations = ["I have downloaded the tool", "I have copied the files", "I have placed the tool", "My license is active"];

export default function InstallationGuide() {
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState(false);

  async function copyPath(version: string) {
    try {
      await navigator.clipboard.writeText(`%USERPROFILE%\\Documents\\houdini${version}\\packages`);
      setCopied(version);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

  return <section className="install-guide" aria-label="Installation walkthrough">
    <ol className="install-guide-steps" aria-label="Installation progress">
      {steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={index < step ? "complete" : ""}>
        <span>{index < step ? "✓" : String(index + 1).padStart(2, "0")}</span>{label}
      </li>)}
    </ol>
    <div className="install-guide-panel" key={step}>
      <span className="eyebrow">STEP {step + 1} OF 5</span>
      <h2>{["Try any tool free for 7 days.", "Extract. Copy. Paste.", "Restart Houdini.", "Connect your account once.", "You’re ready."][step]}</h2>
      {step === 0 && <>
        <p>Download a tool or bundle using <strong>Try for free</strong>. Free tools stay free.</p>
        <Link className="install-guide-link" href="/" target="_blank" rel="noopener noreferrer">Choose a tool ↗</Link>
      </>}
      {step === 1 && <>
        <p>Close Houdini. Extract the ZIP and copy <strong>all files</strong> into your version’s packages folder.</p>
        <div className="install-guide-paths">
          {["21.0", "22.0"].map(version => <div className="install-guide-path" key={version}>
            <span>Houdini {version.split(".")[0]}</span>
            <code>%USERPROFILE%\Documents\houdini{version}\packages</code>
            <button type="button" aria-label={`Copy Houdini ${version} packages folder path`} onClick={() => void copyPath(version)}>{copied === version ? "Copied ✓" : "Copy path"}</button>
          </div>)}
        </div>
        <p className="install-guide-note">Paste the path into File Explorer. Create the packages folder if missing. Merge folders and replace matching files if prompted.</p>
        <p className="install-guide-note">Use a download compatible with your Houdini version. If your preferences are stored elsewhere, use that folder’s packages subfolder.</p>
        <span role="status" className="install-guide-feedback">{copyError ? "Copy the path above manually." : copied ? `Houdini ${copied} path copied.` : ""}</span>
      </>}
      {step === 2 && <p>Open Houdini. In your node network, press <kbd>Tab</kbd>, find your tool by name, and place it.</p>}
      {step === 3 && <>
        <ol className="install-guide-actions"><li>Open the tool’s <strong>License</strong> tab.</li><li>Click <strong>Get license key</strong> and sign in.</li><li>Copy your key, click <strong>Activate</strong> in Houdini, and paste it.</li></ol>
        <Link className="install-guide-link" href="/user?section=license" target="_blank" rel="noopener noreferrer">Open License Data ↗</Link>
        <p className="install-guide-note">Already connected? Your tools use the same account. Start online to activate each new trial.</p>
      </>}
      {step === 4 && <>
        <span className="install-guide-check" aria-hidden="true">✓</span>
        <p>Your tool is active. For trial tools, check the remaining days in the License tab.</p>
        <Link className="install-guide-link" href="/">Explore more tools ↗</Link>
      </>}
      {step < 4 && <button className="install-guide-confirm" type="button" onClick={() => setStep(step + 1)}>{confirmations[step]} <span aria-hidden="true">→</span></button>}
    </div>
    <div className="install-guide-navigation">
      <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</button>
      <span aria-live="polite" aria-atomic="true">{step + 1} / 5 · {steps[step]}</span>
      {step === 4 && <button type="button" onClick={() => setStep(0)}>Start again ↺</button>}
    </div>
  </section>;
}
