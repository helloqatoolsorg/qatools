param([string]$PGliteModule = $env:PGLITE_TEST_MODULE, [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$projectRepo = Split-Path $PSScriptRoot -Parent
$previousSqlModule = $env:PGLITE_TEST_MODULE
Push-Location $projectRepo
try {
    if ($PGliteModule) {$env:PGLITE_TEST_MODULE = $PGliteModule}
    & node --test tests/project-experience.test.cjs tests/project-archive.test.cjs tests/automatic-bundle-assembly.test.cjs tests/bundle-ownership.test.cjs tests/downloads.test.cjs tests/prepared-tool.test.cjs tests/product-download-flow.test.cjs
    if ($LASTEXITCODE -ne 0) {throw 'Project product verification failed.'}
    & python -m unittest discover -s tests -p test_prepare_project.py
    if ($LASTEXITCODE -ne 0) {throw 'Project authoring checks failed.'}
    & node node_modules/typescript/bin/tsc --noEmit --incremental false
    if ($LASTEXITCODE -ne 0) {throw 'TypeScript check failed.'}
    if (!$SkipBuild) {
        & npm run build
        if ($LASTEXITCODE -ne 0) {throw 'Production build failed.'}
    }
    if (!$PGliteModule) {Write-Output 'PostgreSQL checks were skipped. Set PGLITE_TEST_MODULE to run them.'}
    Write-Output 'Project product checks passed.'
} finally {
    $env:PGLITE_TEST_MODULE = $previousSqlModule
    Pop-Location
}
