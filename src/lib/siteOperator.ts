// Public operator disclosures. Update this record when the legal operator changes;
// retain dated policy records and coordinate provider/customer notices separately.
export const operator = {
  name:"Quim Amat Heinert",
  country:"Spain",
  email:"hello@qatools.org",
  postalAddress: "Carrer Concordia 15, 17600, Figueres, Spain",
  taxId:"ES41560207N",
  companyRegistration:null as string | null,
} as const;
export const supportHref = `mailto:${operator.email}`;
