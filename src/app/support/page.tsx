import type { Metadata } from "next";
import Link from "next/link";
import InformationPage from "@/components/InformationPage";
import {operator,supportHref} from "@/lib/siteOperator";
export const metadata:Metadata={title:"Support | qatools"};
export default function SupportPage(){return <InformationPage title="Support">
<section className="support-contact"><h2>Get in touch</h2><a className="support-email" href={supportHref}>{operator.email}</a><p>qatools is operated by {operator.name}, based in {operator.country}.</p></section>
<section><h2>Help us understand the issue</h2><p>Include your account email, tool name, Houdini version, operating system and steps to reproduce the problem. For a purchase question, include the order reference.</p><p>Never send your password, activation key, private license files or full card details.</p></section>
<section><h2>Installation and activation</h2><p>Start with <Link href="/install">How to install</Link>. Install the complete downloaded package, including the shared qatools files, then restart Houdini.</p><p>If you are changing computers, ask us to release your previous machine assignment. One account activation covers the tools you own.</p></section>
<section><h2>Payments and refunds</h2><p>See <Link href="/refunds">Refunds</Link> for our request policy. For payment help, you can also use <a href="https://paddle.net">Paddle buyer support</a> and the support link in your receipt.</p></section>
<section><h2>Privacy requests</h2><p>Contact the same address for questions about your data or to make a privacy request. See <Link href="/privacy">Privacy</Link> for details.</p></section>
</InformationPage>;}
