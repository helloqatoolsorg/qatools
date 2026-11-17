BEGIN;
SET LOCAL lock_timeout = '5s';

-- The catalog owner confirmed this specific published tool's minimum version.
UPDATE public.products
SET compatibility = 'Houdini 21 and newer'
WHERE id = 15
  AND name = 'QA Tool testE'
  AND compatibility = 'Lorem ipsum — test content';

-- Convert existing labels that identify a single supported major version.
WITH recognized AS (
  SELECT id, substring(
    lower(btrim(compatibility))
    FROM '^(?:houdini |h)(2[1-9]|30)(?:[.]0)?(?: and (?:newer|over))?$'
  ) AS version
  FROM public.products
)
UPDATE public.products AS product
SET compatibility = 'Houdini ' || recognized.version || ' and newer'
FROM recognized
WHERE product.id = recognized.id
  AND recognized.version IS NOT NULL
  AND product.compatibility IS DISTINCT FROM 'Houdini ' || recognized.version || ' and newer';

-- Validation also rolls back the conversions if a new, ambiguous label appeared since review.
ALTER TABLE public.products
  ADD CONSTRAINT products_compatibility_dropdown
  CHECK (
    compatibility ~ '^Houdini (2[1-9]|30) and newer$'
    OR (NOT published AND compatibility = '')
  );

COMMIT;
