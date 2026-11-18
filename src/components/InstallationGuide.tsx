"use client";

import { useState } from "react";
import Link from "next/link";
import "./InstallationGuide.css";

type Step = "version" | "welcome" | "product-type" | "download" | "copy" | "project" | "restart" | "automatic" | "key" | "activate" | "ready";
type ProductType = "tool" | "shelf_tool" | "project";
type Version = "21.0" | "22.0";
const packageFiles = [
  {name: "QATools", icon: "install-guide-folder-icon"},
  {name: "QATools.json", icon: "install-guide-document-icon"},
];


export default function InstallationGuide() {
  const [history, setHistory] = useState<Step[]>(["welcome"]);
  const [hasInstalledBefore, setHasInstalledBefore] = useState(false);
  const [productType, setProductType] = useState<ProductType>("tool");
  const [version, setVersion] = useState<Version | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const step = history[history.length - 1];
  const isProject = productType === "project";
  const isShelf = productType === "shelf_tool";
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
    {history.length > 1 && <button type="button" className="install-guide-back"
      onClick={() => setHistory(previous => previous.slice(0, -1))}>← Back</button>}
    <div className="install-guide-instruction" key={step}>
      {step === "welcome" && <div className="install-guide-buttons install-guide-start-options">
        <button type="button" onClick={() => {setHasInstalledBefore(false);next("product-type");}}>I’m installing QATools for the first time →</button>
        <button className="install-guide-secondary" type="button" onClick={() => {setHasInstalledBefore(true);next("product-type");}}>I’ve already installed QATools →</button>
      </div>}
      {step === "product-type" && <>
        <div className="install-guide-buttons install-guide-start-options">
          <button type="button" onClick={() => {setProductType("tool");next("download");}}>Tool or Bundle →</button>
          <button type="button" onClick={() => {setProductType("shelf_tool");next("download");}}>Shelf Tool →</button>
          <button type="button" onClick={() => {setProductType("project");next("download");}}>Project →</button>
        </div>
        <div className="install-guide-inline-link">
          <Link href="/user?section=purchased&highlight=types" target="_blank" rel="noopener noreferrer">Not sure? Check your downloads ↗</Link>
        </div>
      </>}
      {step === "download" && <>
        <p>{isProject ? "Download a Project. All Tools free for 7 days." : isShelf ? "Download a Shelf Tool. All Tools free for 7 days." : "Download a Tool or Bundle. All Tools free for 7 days."}</p>
        <div className="install-guide-buttons">
          <Link href={isProject ? "/?type=project" : isShelf ? "/?type=shelf_tool" : "/?type=tool&type=bundle"} target="_blank" rel="noopener noreferrer">{isProject ? "Choose Project ↗" : isShelf ? "Choose Shelf Tool ↗" : "Choose Tool or Bundle ↗"}</Link>
          <button type="button" onClick={() => next("version")}>{isProject ? "I have downloaded the Project →" : isShelf ? "I have downloaded the Shelf Tool →" : "I have downloaded the Tool →"}</button>
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
          <li>Open your Houdini {version?.split(".")[0]} <span className="install-guide-control">packages</span> folder.<br />Create it if you don’t see it.
            <div className="install-guide-path"><code>{path}</code><button type="button" onClick={() => void copyPath()}>{copied ? "Copied ✓" : "Copy path"}</button></div>
            <span className="install-guide-feedback" role="status">{copyError ? "Select and copy the path manually." : ""}</span>
          </li>
          <li>Extract the download ZIP, copy QATools.json and the QATools folder, and paste them into the <span className="install-guide-control">packages</span> folder.
            <div className="install-guide-files install-guide-package-preview" role="img" aria-label={isProject
              ? "Extracted download. Select and copy the QATools folder and QATools.json. Move the Project contents to your chosen working folder."
              : "Extracted download. Select and copy the QATools folder and QATools.json."}>
              <div className="install-guide-files-header" aria-hidden="true">Extracted ZIP</div>
              <div aria-hidden="true">
                <div className="install-guide-copy-group">
                  {packageFiles.map(file => <div key={file.name} className="install-guide-file selected">
                    <span className={file.icon} />
                    <span>{file.name}</span>
                    <span className="install-guide-file-check">Copy ✓</span>
                  </div>)}
                </div>
                {isProject && <div className="install-guide-file">
                  <span className="install-guide-folder-icon" />
                  <span>Project</span>
                </div>}
              </div>
            </div>
          </li>
          <li>Replace files if asked.</li>
        </ol>
        <button type="button" onClick={() => next(isProject ? "project" : hasInstalledBefore ? "automatic" : "restart")}>The files are in the packages folder →</button>
      </>}
      {step === "project" && <>
        <ol className="install-guide-instructions">
          <li>Open the <span className="install-guide-control">Project</span> folder in the extracted download.</li>
          <li>Move the folder named after your Project to your chosen working location.
            <div className="install-guide-files install-guide-project-preview" role="img"
              aria-label="Open the Project folder, then copy the folder named after your Project to your working location.">
              <div className="install-guide-files-header" aria-hidden="true">Extracted ZIP</div>
              <div aria-hidden="true">
                <div className="install-guide-file install-guide-project-parent">
                  <span className="install-guide-folder-chevron" />
                  <span className="install-guide-folder-icon" />
                  <span>Project</span>
                </div>
                <div className="install-guide-project-children">
                  <div className="install-guide-copy-group">
                    <div className="install-guide-file selected">
                      <span className="install-guide-folder-icon" />
                      <span>Project Name</span>
                      <span className="install-guide-file-check">Copy ✓</span>
                    </div>
                    <div className="install-guide-copy-ghost">
                      <div className="install-guide-file selected">
                        <span className="install-guide-folder-icon" />
                        <span>Project Name</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </li>
        </ol>
        <button type="button" onClick={() => next(hasInstalledBefore ? "automatic" : "restart")}>The Project is in my working folder →</button>
      </>}
      {step === "automatic" && <>
        <p className="install-guide-complete" role="status">You are set !</p>
        <p>{isProject ? "Restart Houdini and open the scene in your extracted Project folder." : isShelf ? "Restart Houdini and enable the shelf tab named after your Shelf Tool." : "Restart Houdini and place your Tool."}<br />Your existing license will be detected automatically.</p>
        <Link href="/">Back to Tools ↗</Link>
        <div className="install-guide-activation-help">
          <p>If the Tool is inactive, continue to license activation.</p>
          <button type="button" className="install-guide-secondary" onClick={() => next("key")}>Go to license activation →</button>
        </div>
      </>}
      {step === "restart" && <>
        <ol className="install-guide-instructions">
          <li>Restart Houdini.</li>
          <li>{isProject ? "Open the scene in your extracted Project folder." : isShelf ? "Enable the shelf tab named after your Shelf Tool." : "Search for your node and place it."}</li>
          <li>{isShelf ? <>Shift-click the Shelf Tool to open its <span className="install-guide-control">License</span> window.</> : <>{isProject ? "Select a QATools node and open its " : "Open the "}<span className="install-guide-control">License</span> tab in the parameters.</>}</li>
        </ol>
        <p>Does it show an active license?</p>
        <div className="install-guide-buttons">
          <button className="install-guide-answer-yes" type="button" onClick={() => next("ready")}>Yes, it is active →</button>
          <button className="install-guide-answer-no" type="button" onClick={() => next("key")}>No, connect my account →</button>
        </div>
      </>}
      {step === "key" && <>
        <ol className="install-guide-instructions">
          <li>Click <span className="install-guide-control">Get license key</span> here or in {isShelf ? "the Shelf Tool’s" : "the Tool’s"} <span className="install-guide-control">License</span> {isShelf ? "window" : "tab"}.
            <div className="install-guide-inline-link"><Link href="/user?section=license&highlight=key" target="_blank" rel="noopener noreferrer">Get license key ↗</Link></div>
          </li>
          <li>Copy your license key.</li>
        </ol>
        <button type="button" onClick={() => next("activate")}>I have copied my key →</button>
      </>}
      {step === "activate" && <>
        <ol className="install-guide-instructions">
          <li>Return to Houdini while connected to the internet.</li>
          <li>In the <span className="install-guide-control">License</span> {isShelf ? "window" : "tab"}, click <span className="install-guide-control">Activate</span> and paste your key.</li>
          <li>Confirm activation.</li>
        </ol>
        <button type="button" onClick={() => next("ready")}>My license is active →</button>
      </>}
      {step === "ready" && <>
        <p className="install-guide-complete" role="status">Enjoy !</p>
        <Link href="/">Back to Tools ↗</Link>
      </>}
    </div>
    {(step === "ready" || step === "automatic") && <div className="install-guide-navigation">
      <button type="button" onClick={() => {setHistory(["welcome"]);setHasInstalledBefore(false);setProductType("tool");setVersion(null);setCopied(false);setCopyError(false);}}>Start again</button>
    </div>}
  </section>;
}
