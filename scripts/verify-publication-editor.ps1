param([switch]$Stage,[switch]$StageOnly)
$ErrorActionPreference='Stop'
$publicationRepo=Split-Path $PSScriptRoot -Parent
Push-Location $publicationRepo
try {
    if(-not $StageOnly){
    & node --test --test-concurrency=1 tests/admin-product-workspace.test.cjs tests/installer-update.test.cjs tests/houdini-package.test.cjs tests/admin-downloads.test.cjs tests/product-download-flow.test.cjs tests/product-artwork.test.cjs tests/bundle-ownership.test.cjs
    if($LASTEXITCODE -ne 0){throw 'Product editor/download tests failed.'}
    & npx tsc --noEmit
    if($LASTEXITCODE -ne 0){throw 'TypeScript check failed.'}
    & npm run build
    if($LASTEXITCODE -ne 0){throw 'Production build failed.'}
    }
    & git --no-pager diff --check
    if($LASTEXITCODE -ne 0){throw 'Diff check failed.'}
    if($Stage -or $StageOnly){
        $publicationFiles=@(
            'src/app/api/admin/downloads/route.ts',
            'src/app/api/admin/products/artwork/route.ts',
            'src/app/api/admin/products/assemble/route.ts',
            'src/app/api/admin/products/content/route.ts',
            'src/app/api/admin/products/package/route.ts',
            'src/app/api/admin/products/rebuild/route.ts',
            'src/app/api/catalog/download-availability/route.ts',
            'src/app/globals.css','src/app/layout.tsx',
            'src/components/AdminGallery.tsx','src/components/AdminProducts.css',
            'src/components/AdminProducts.tsx','src/components/AdminToolPackage.tsx',
            'src/components/AdminProjectPackage.tsx','src/components/ProductDownload.tsx',
            'src/components/ProductPublication.tsx','src/context/DownloadAvailability.tsx',
            'src/context/QAToolsState.tsx','src/lib/adminDraftRecovery.ts','src/lib/installerContents.ts',
            'tests/admin-downloads.test.cjs','tests/admin-product-workspace.test.cjs',
            'tests/bundle-ownership.test.cjs','tests/download-availability.test.cjs',
            'tests/houdini-package.test.cjs','tests/installer-update.test.cjs',
            'tests/product-artwork.test.cjs','tests/product-download-flow.test.cjs',
            'supabase/migrations/20261104110000_publication_package_gate.sql',
            'supabase/inspection/published_missing_downloads.sql',
            'handoff/QATOOLS_PUBLICATION_PACKAGES.md','scripts/verify-publication-editor.ps1'
        )
        & git add -- $publicationFiles
        if($LASTEXITCODE -ne 0){throw 'Unable to stage the publication/editor batch.'}
    }
    if($StageOnly){Write-Output 'Diff check passed; publication/editor batch staged. Tests and build were not repeated.'}
    else {Write-Output 'Publication/editor verification passed. No migration, commit, upload or deployment performed.'}
} finally {Pop-Location}
