-- Read-only: run in Supabase SQL Editor and save the results for review.
select column_name, data_type, is_nullable, column_default, is_identity
from information_schema.columns
where table_schema = 'public' and table_name = 'complexity'
order by ordinal_position;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid = 'public.complexity'::regclass;

select * from public.complexity order by sort_order, name;

select complexity_id, count(*) as product_count
from public.products group by complexity_id order by complexity_id;
