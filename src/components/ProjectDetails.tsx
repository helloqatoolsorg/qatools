"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Details = {scene: string; houdini: string; dependencies: string[]};

export default function ProjectDetails({productId}: {productId: number}) {
  const [details, setDetails] = useState<Details | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await supabase.rpc("project_product_details", {p_product_id: productId});
      if (cancelled) return;
      if (result.error) {setFailed(true); return;}
      const value = result.data;
      if (value && typeof value === "object" && !Array.isArray(value) &&
          typeof value.scene === "string" && typeof value.houdini === "string" &&
          Array.isArray(value.dependencies) && value.dependencies.every((name: unknown) => typeof name === "string")) {
        setDetails(value as Details);
      }
    })().catch(() => {if (!cancelled) setFailed(true);});
    return () => {cancelled = true;};
  }, [productId]);

  return <section className="product-project-details">
    <p>Includes the project scene and the tools listed above.</p>
    {details && <p>{details.scene} · Created in Houdini {details.houdini}</p>}
    {details?.dependencies.length ? <p role="note">Requires a separate installation of {details.dependencies.join(", ")}.</p> : null}
    {failed && <p role="status">Project requirements could not be loaded. Refresh to try again.</p>}
    <details><summary className="menu-trigger">Project installation</summary>
      <ol>
        <li>Extract the download and copy QATools.json and the QATools folder into your Houdini packages folder.</li>
        <li>Open Project and move the folder named after your Project to your chosen working location.</li>
        <li>Restart Houdini and open the project scene. Activate your account if needed.</li>
      </ol>
    </details>
  </section>;
}
