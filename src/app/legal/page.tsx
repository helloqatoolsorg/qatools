import type { Metadata } from "next";
import Link from "next/link";
import InformationPage from "@/components/InformationPage";
import {operator,supportHref} from "@/lib/siteOperator";
export const metadata:Metadata={title:"Legal notice | qatools",robots:{index:false,follow:true}};
export default function LegalPage(){return <InformationPage title="Legal notice / Aviso legal" policy>
<section><h2>Website operator</h2><dl className="legal-operator"><dt>Legal name</dt><dd>{operator.name}</dd><dt>Country</dt><dd>{operator.country}</dd><dt>Contact</dt><dd><a href={supportHref}>{operator.email}</a></dd><dt>Postal address</dt><dd>{operator.postalAddress ?? "Pending before live sales"}</dd><dt>Tax identification</dt><dd>{operator.taxId ?? "Pending before live sales"}</dd>{operator.companyRegistration && <><dt>Company registration</dt><dd>{operator.companyRegistration}</dd></>}</dl><p>This is the website&apos;s central operator-identification record. Postal and tax disclosures remain incomplete; this draft is not a finalized legal notice.</p></section>
<section><h2>Website and policies</h2><p>qatools provides digital tools, bundles and project files for SideFX Houdini. Read <Link href="/terms">Terms and license</Link>, <Link href="/privacy">Privacy</Link> and <Link href="/refunds">Refunds</Link> for the corresponding draft policies.</p><p>For installation, product or account questions, visit <Link href="/support">Support</Link>. Payment orders are handled through Paddle as the reseller; its buyer terms apply to that role.</p></section>
</InformationPage>;}
