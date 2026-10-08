// Public operator disclosures. Update this record when the legal operator changes;
// retain dated policy records and coordinate provider/customer notices separately.
export const operator = {
  name:"Quim Amat Heinert",
  country:"Spain",
  email:"hello@qatools.org",
  postalAddress:null as string | null,
  taxId:null as string | null,
  companyRegistration:null as string | null,
} as const;
export const supportHref = `mailto:${operator.email}`;
