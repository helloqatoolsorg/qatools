-- Read-only diagnosis, run in the Supabase SQL editor if name recovery still fails.
SELECT id,name,slug,published,updated_at FROM public.products WHERE name='qatesta01' OR slug='qatesta01';
SELECT max(id) AS highest_product_id,pg_get_serial_sequence('public.products','id') AS identity_sequence FROM public.products;
SELECT schemaname,sequencename,last_value FROM pg_sequences WHERE schemaname='public' AND sequencename='products_id_seq';
