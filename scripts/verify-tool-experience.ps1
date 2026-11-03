param([string]$Hython = 'C:\Program Files\Side Effects Software\Houdini 22.0.459\bin\hython.exe')
$ErrorActionPreference = 'Stop'
$experienceRepo = Split-Path $PSScriptRoot -Parent
$experiencePython = $env:PYTHONPATH
Push-Location $experienceRepo
try {
    $env:PYTHONPATH = Join-Path $experienceRepo 'houdini\python'
    & node --test tests/product-download-flow.test.cjs tests/downloads.test.cjs tests/prepared-tool.test.cjs
    if ($LASTEXITCODE -ne 0) {throw 'Website download/import tests failed.'}
    foreach ($experiencePattern in @('test_houdini_licensing.py','test_houdini_dialog.py','test_authoring_compatibility.py','test_prepare_tool.py','test_prepared_tool.py')) {
        & $Hython -m unittest discover -s tests -p $experiencePattern
        if ($LASTEXITCODE -ne 0) {throw ('Houdini checks failed: ' + $experiencePattern)}
    }
    & npm run build
    if ($LASTEXITCODE -ne 0) {throw 'Production build failed.'}
    Write-Output 'Tool experience verification passed. No migration, upload, commit or deployment performed.'
} finally {
    $env:PYTHONPATH = $experiencePython
    Pop-Location
}
