export type AccountAccess = {
 id:number; status:string; source:string; granted_at:string; direct_acquisition:boolean;
 products:{id:number;name:string;slug:string;subtitle:string|null;current_version:string|null;product_type:string;category:{name:string}|null}|null;
 included_tools:{id:number;name:string;slug:string}[];
};
export type AccountPurchases = {ok:boolean;entitlements:AccountAccess[];machines:{id:number;machine_id:string;status:string;activated_at:string}[]};
