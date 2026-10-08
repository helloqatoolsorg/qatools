begin;
create table public.site_branding (
  id smallint primary key check (id = 1),
  logo_path text check (logo_path is null or logo_path ~ '^branding/logos/[a-f0-9-]{36}\.png$'),
  revision uuid not null default gen_random_uuid()
);
insert into public.site_branding (id) values (1);
alter table public.site_branding enable row level security;
revoke all on public.site_branding from anon, authenticated, service_role;
grant select on public.site_branding to anon, authenticated;
grant select, update on public.site_branding to service_role;
create policy "Website branding is public" on public.site_branding for select to anon, authenticated using (id = 1);
comment on table public.site_branding is 'Public logo pointer only. Admin-authorized server route performs version-checked updates.';
commit;
