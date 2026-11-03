param([string]$Hython = 'C:\Program Files\Side Effects Software\Houdini 22.0.459\bin\hython.exe')
$ErrorActionPreference = 'Stop'
$trialRepo = Split-Path $PSScriptRoot -Parent
Push-Location $trialRepo
$trialPreviousPython = $env:PYTHONPATH
try {
  $env:PYTHONPATH = Join-Path $trialRepo 'houdini\python'
  & node --test tests/trial-license.test.cjs tests/licensing-routes.test.cjs tests/downloads.test.cjs
  if ($LASTEXITCODE -ne 0) {throw 'Website trial tests failed.'}
  & $Hython -m unittest discover -s tests -p test_houdini_licensing.py
  if ($LASTEXITCODE -ne 0) {throw 'Houdini licensing tests failed.'}
  & $Hython -m unittest discover -s tests -p test_prepare_tool.py
  if ($LASTEXITCODE -ne 0) {throw 'Houdini export tests failed.'}
  & npm run build
  if ($LASTEXITCODE -ne 0) {throw 'Production build failed.'}
  Write-Output 'Trial verification passed. No migration, commit, upload or deployment performed.'
} finally {
  $env:PYTHONPATH = $trialPreviousPython
  Pop-Location
}
