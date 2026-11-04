param([switch]$Stage,[switch]$StageOnly,[string]$Hython='C:\Program Files\Side Effects Software\Houdini 22.0.459\bin\hython.exe')
$ErrorActionPreference='Stop'
$trialRepo=Split-Path $PSScriptRoot -Parent
$trialPythonPath=$env:PYTHONPATH
Push-Location $trialRepo
try {
 if(-not $StageOnly){
  & node --test --test-concurrency=1 tests/houdini-browser-connect.test.cjs tests/licensing-routes.test.cjs tests/trial-license.test.cjs tests/licensing-database.test.cjs
  if($LASTEXITCODE -ne 0){throw 'Browser/licensing tests failed.'}
  $env:PYTHONPATH=Join-Path $trialRepo 'houdini\python'
  foreach($trialPattern in @('test_houdini_licensing.py','test_houdini_dialog.py','test_authoring_compatibility.py','test_export_worker.py','test_prepare_tool.py')){
   & $Hython -m unittest discover -s tests -p $trialPattern
   if($LASTEXITCODE -ne 0){throw ('Houdini check failed: '+$trialPattern)}
  }
  & npm run build
  if($LASTEXITCODE -ne 0){throw 'Production build failed.'}
 }
 & git --no-pager diff --check
 if($LASTEXITCODE -ne 0){throw 'Diff check failed.'}
 if($Stage -or $StageOnly){
  & git add -- src/app/api/licensing/connect/route.ts src/app/api/account/houdini-connect/route.ts src/app/connect-houdini/page.tsx src/lib/houdiniConnection.ts src/app/globals.css src/app/install/page.tsx houdini/python/qatools_licensing/client.py houdini/python/qatools_licensing/houdini_ui.py houdini/authoring/prepare_tool.py houdini/authoring/prepared_tool.py houdini/authoring/install-authoring.ps1 houdini/authoring/export_worker.py tests/houdini-browser-connect.test.cjs tests/licensing-database.test.cjs tests/test_prepare_tool.py tests/test_houdini_licensing.py tests/test_authoring_compatibility.py tests/test_export_worker.py supabase/migrations/20261104120000_houdini_browser_connection.sql scripts/verify-browser-trial.ps1 handoff/QATOOLS_BROWSER_TRIAL_CONNECTION.md handoff/QATOOLS_POLICY_DECISIONS.md
  if($LASTEXITCODE -ne 0){throw 'Staging failed.'}
 }
 Write-Output 'Browser trial batch checked. No migration, commit, upload or deployment performed.'
} finally {$env:PYTHONPATH=$trialPythonPath;Pop-Location}
