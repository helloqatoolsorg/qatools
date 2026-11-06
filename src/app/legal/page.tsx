import type { Metadata } from "next";
import Link from "next/link";
import InformationPage from "@/components/InformationPage";
import {operator,supportHref} from "@/lib/siteOperator";
export const metadata:Metadata={title:"Legal notice | QATools",robots:{index:false,follow:true}};
export default function LegalPage(){return <InformationPage title="Legal notice / Aviso legal" policy>
<section><h2>Website operator</h2><dl className="legal-operator"><dt>Legal name</dt><dd>{operator.name}</dd><dt>Country</dt><dd>{operator.country}</dd><dt>Contact</dt><dd><a href={supportHref}>{operator.email}</a></dd><dt>Postal address</dt><dd>{operator.postalAddress ?? "Pending before live sales"}</dd><dt>Tax identification</dt><dd>{operator.taxId ?? "Pending before live sales"}</dd>{operator.companyRegistration && <><dt>Company registration</dt><dd>{operator.companyRegistration}</dd></>}</dl><p>{operator.name} operates QATools as a self-employed individual in Spain.</p></section>
<section><h2>Website information</h2><p>Read <Link href="/information">Information</Link> for terms, privacy, refunds and support.</p></section>
</InformationPage>;}
