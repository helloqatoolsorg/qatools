"use client";

import { useState } from "react";
import Link from "next/link";
import "./InstallationGuide.css";

const steps = ["Download", "Install", "Connect", "Create"];

export default function InstallationGuide() {
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const path = "Documents\\houdini22.0\\packages";

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

  return <section className="install-guide" aria-label="Installation walkthrough">
    <nav className="install-guide-steps" aria-label="Installation steps">
      {steps.map((label, index) => <button key={label} type="button" aria-current={step === index ? "step" : undefined}
        onClick={() => setStep(index)}><span>{String(index + 1).padStart(2, "0")}</span>{label}</button>)}
    </nav>
    <div className="install-guide-panel" key={step}>
      <div className="install-guide-copy">
        <span className="eyebrow">STEP {step + 1} OF 4 · WINDOWS / HOUDINI 22</span>
        <h2>{["Choose a tool. Try it out.", "Two items. One folder.", "One key for your tools.", "You’re ready to create."][step]}</h2>
        {step === 0 && <>
          <p>Sign in, open a tool or bundle, and choose <strong>Try for free</strong>. Free tools use <strong>Free download</strong>.</p>
          <p>Extract the complete ZIP. Keep <code>qatools.json</code> and the <code>qatools</code> folder together.</p>
          <Link className="install-guide-link" href="/">Explore tools ↗</Link>
          <details><summary>Installing a project?</summary><p>Projects require a purchase. Extract the project archive into a separate working folder, preserving its folders. Install the included qatools package using the next step.</p></details>
        </>}
        {step === 1 && <>
          <p>Save your work and close Houdini. Open your Houdini preferences folder and create <code>packages</code> if it is missing.</p>
          <p>Copy <strong>both items</strong> from the extracted download into this folder:</p>
          <div className="install-guide-path"><code>{path}</code><button type="button" onClick={() => void copyPath()}>{copied ? "Copied" : "Copy"}</button></div>
          <span className="install-guide-feedback" role="status">{copyError ? "Select and copy the path above manually." : copied ? "Folder path copied." : ""}</span>
          <details><summary>Already have qatools installed?</summary><p>Merge the qatools folders and replace matching files. Keep the other tools already in your folder. Copying only the HDA skips the shared licensing files.</p></details>
          <details><summary>Using a custom preferences folder?</summary><p>In Houdini’s Python Shell, enter <code>{'hou.getenv("HOUDINI_USER_PREF_DIR")'}</code> to find your actual preferences folder. Use its packages subfolder.</p></details>
        </>}
        {step === 2 && <>
          <p>Restart Houdini and place your tool. Open its <strong>License</strong> tab.</p>
          <ol><li>Click <strong>Get license key</strong> and log in.</li><li>Copy your key from <strong>License Data</strong>.</li><li>Return to Houdini, click <strong>Activate</strong>, and paste it into the private key dialog.</li></ol>
          <p>You connect your account once per computer. Future tools reuse that connection. Keep your key private.</p>
          <Link className="install-guide-link" href="/user?section=license">Open License Data ↗</Link>
        </>}
        {step === 3 && <>
          <p>The License tab should show <strong>Active license</strong> or <strong>Active free license</strong>.</p>
          <p>Each unpurchased paid tool starts its own seven-day trial when first placed online with your account connected. Free tools stay free; purchased tools continue after the trial.</p>
          <p>After buying a tool, connect to the internet and refresh its license. The trial countdown disappears once ownership is recognised.</p>
          <details><summary>Something isn’t working?</summary><p>Tool missing? Check that both package items are installed and restart Houdini. Connection error? Check your internet connection and install the latest download. Your account uses one active computer; contact <a href="mailto:hello@qatools.org">hello@qatools.org</a> if you need to release an old machine.</p><p>Activated tools work offline while their cached license remains valid. Connect and refresh when renewal is needed.</p></details>
        </>}
      </div>
      <div className="install-guide-visual" aria-label="Installation example">
        <div className="install-guide-window"><span /><span /><span /><small>{["Your download", "Houdini packages", "Houdini · License", "Your next project"][step]}</small></div>
        {step === 0 && <div className="install-guide-files"><span className="install-guide-file">↓ &nbsp; Your_Tool.zip</span><span className="install-guide-connector">Extract ZIP</span><span>↳ &nbsp; qatools.json</span><span>↳ &nbsp; qatools/</span></div>}
        {step === 1 && <div className="install-guide-files"><span>houdini22.0/</span><span>└─ packages/</span><strong>　 ├─ qatools.json</strong><strong>　 └─ qatools/</strong><span className="install-guide-caption">Keep both at the same level.</span></div>}
        {step === 2 && <div className="install-guide-license"><span className="install-guide-tab">License</span><span>E-mail <b>your account</b></span><span>Machine <b>your computer</b></span><hr /><span className="install-guide-key">Get license key ↗</span><span className="install-guide-key">Activate → ••••••••</span><small>Illustration — activate inside Houdini.</small></div>}
        {step === 3 && <div className="install-guide-ready"><span aria-hidden="true">✓</span><strong>Connected. Ready.</strong><p>Your tools share one account connection.</p><Link href="/">Find your next tool ↗</Link></div>}
      </div>
    </div>
    <div className="install-guide-navigation">
      <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</button>
      <span aria-live="polite" aria-atomic="true">{String(step + 1).padStart(2, "0")} / 04 · {steps[step]}</span>
      <button type="button" onClick={() => setStep(step === 3 ? 0 : step + 1)}>{step === 3 ? "Start again ↺" : `${steps[step + 1]} →`}</button>
    </div>
  </section>;
}
