-- Read-only audit of historical public products without a usable stored mapping.
SELECT p.id,p.name,p.slug,p.product_type,d.file_name,
 CASE WHEN d.product_id IS NULL THEN 'No package attached'
      WHEN NOT d.enabled THEN 'Download disabled'
      WHEN o.id IS NULL THEN 'Stored file missing'
      WHEN b.public THEN 'Download bucket must be private'
 END AS issue
FROM public.products p
LEFT JOIN public.product_downloads d ON d.product_id=p.id
LEFT JOIN storage.objects o ON o.bucket_id='qatools-downloads' AND o.name=d.file_path
LEFT JOIN storage.buckets b ON b.id=o.bucket_id
WHERE p.published AND (d.product_id IS NULL OR NOT d.enabled OR o.id IS NULL OR b.public)
ORDER BY p.name;
