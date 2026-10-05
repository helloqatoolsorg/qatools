# Prepared tool identity — 2026-10-05

## Approved workflow

For a new tool, Asset Label is its website display name (Beautiful Noise). Internal Name must match it with spaces replaced by underscores (Beautiful_Noise). Its stable website/licensing slug is the lowercase Internal Name (beautiful_noise). The title and slug are read-only in the website editor and enforced by the trusted database writer. Existing product slugs are preserved.

New product → Tool now opens a prepared ZIP upload first. After successful import, the owner fills the existing metadata/media/price form and publishes using the existing readiness/Paddle checks. Bundles/projects retain their current creation paths; projects remain blocked from publication.

## Implemented locally

- ZIP contains exactly qatools-tool.json and one slug-named HDA, HDALC or HDANC.
- Metadata schema 1: label, internal_name, slug, file, sha256, schema. Labels currently accept ASCII letters/numbers and single spaces; Internal Name has no namespace/version suffix. Reject unsupported naming instead of silently normalizing identity.
- Server checks paths, ZIP bounds, CRC, decompression size, exact entries, metadata convention, HDA header and SHA-256. It treats this as trusted admin authoring metadata, not a cryptographic licensing certification or malware scan.
- Import requires a confirmed, unbanned admin through requireAdmin and the SQL RPC. ZIP parsing/storage checks precede creating a product.
- A request UUID makes creation retries idempotent. Failed storage binding leaves a real visible unpublished draft. The same file/request retries that draft; reopening an incomplete draft also returns to the upload gate using its stored request UUID.
- The downloadable customer installer is rebuilt with one shared qatools.json, the HDA under qatools/otls, and the shared runtime/startup files. The authoring metadata JSON is not included in customer downloads.
- Replacements require the same prepared identity/filename and atomically update its checksum with the download mapping. Raw advanced ZIP replacement is blocked for prepared tools. Existing legacy tools retain their upload flow.
- Draft deletion removes the product's identity along with its unused draft; linked commercial/history records retain existing protections.
- Paddle continues using the stable slug for its provider product identity and verification. This change does not rename existing provider products or change licensing payloads.

## Houdini export boundary / next milestone

houdini/authoring/prepared_tool.py reads the saved HDADefinition description and nodeTypeName, copies that one definition to a temporary HDA, and exports its ZIP. It never overwrites an existing export or modifies the source definition. Save asset edits in Houdini before export.

This is the reusable identity exporter for the planned Prepare qatools tool shelf action. The licensing injection, standard License tab, guard insertion/validation, backups and shelf installation are STILL TO IMPLEMENT. Exporting an ordinary HDA does not make it licensed. Do not publish newly authored unguarded assets. Keep qabundle01 (qanoise01/qaroad01) unpublished until real prepared/licensed assets are available and the end-to-end owner test is complete. The existing qafit01 keeps its existing slug and bridge.

## Validation

Actual PostgreSQL migration tests cover importer authorization, idempotence, duplicate slug, locked name/slug, manual tool creation rejection, unchanged legacy slug, unused draft deletion/name reuse, replacement identity/hash and stale mapping. ZIP/route tests cover authentication, malformed metadata/archives, private storage, canonical installer building, visible failure/retry and duplicate recovery. Browser component tests cover upload-first gating and read-only populated identity; existing draft recovery/bundle tests remain covered. Real Houdini definition export is tested in temporary files without modifying installed tools. TypeScript, scoped ESLint and production build are required before rollout.

## Owner rollout

From D:\qatools\qatools, apply the migration FIRST:

```cmd
supabase db push
```

Then stage only this batch (preserving unrelated pending work):

```cmd
git add src/lib/preparedTool.ts src/lib/productDraft.ts src/lib/database.types.ts src/components/AdminProducts.tsx src/components/AdminToolPackage.tsx src/app/api/admin/products/import/route.ts src/app/api/admin/products/route.ts src/app/api/admin/products/package/route.ts src/app/api/admin/downloads/route.ts houdini/authoring/prepared_tool.py supabase/migrations/20261005150000_prepared_tool_identity.sql tests/prepared-tool.test.cjs tests/test_prepared_tool.py tests/bundle-ownership.test.cjs tests/houdini-package.test.cjs tests/admin-product-workspace.test.cjs handoff/QATOOLS_PREPARED_TOOL_IDENTITY.md handoff/QATOOLS_POLICY_DECISIONS.md handoff/QATOOLS_FEATURE_BACKLOG.md
git commit -m "Import prepared Houdini tools with locked product identity"
git push
```

Verify the matching Vercel deployment is Ready. Hosted authoring/upload tests follow once the Prepare shelf action supplies actual licensed exports. No remote DB modification, commit, push, deployment or content upload was performed by the agent.


## Authoring helper checkpoint — 2026-10-05

The owner confirmed applying 20261005150000_prepared_tool_identity.sql. The next authoring milestone is now implemented locally: the Prepare qatools tool shelf action, standard License tab, output-guard insertion/verification and automatic ZIP/identity export on a separate copy of saved single-output SOP assets. Source libraries are preserved, with unique temporary definitions cleaned up. Six real Houdini functional tests pass. Installation and real owner GUI/product checks remain to do. See QATOOLS_TOOL_AUTHORING.md; the earlier “still to implement” note is historical.
