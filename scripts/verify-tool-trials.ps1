param([switch]$Stage,[switch]$StageOnly,[string]$Hython='C:\Program Files\Side Effects Software\Houdini 22.0.459\bin\hython.exe')
$ErrorActionPreference='Stop'
$toolTrialRepo=Split-Path $PSScriptRoot -Parent
$toolTrialPythonPath=$env:PYTHONPATH
Push-Location $toolTrialRepo
try {
 if(-not $StageOnly){
  & node --test --test-concurrency=1 tests/houdini-browser-connect.test.cjs tests/licensing-routes.test.cjs tests/trial-license.test.cjs tests/licensing-database.test.cjs
  if($LASTEXITCODE -ne 0){throw 'Tool trial API/crypto/database checks failed.'}
  $env:PYTHONPATH=Join-Path $toolTrialRepo 'houdini\python'
  foreach($toolTrialPattern in @('test_houdini_licensing.py','test_houdini_dialog.py','test_tool_trials.py','test_authoring_compatibility.py','test_export_worker.py','test_prepare_tool.py','test_prepared_tool.py','test_portable_authoring.py')){
   & $Hython -m unittest discover -s tests -p $toolTrialPattern
   if($LASTEXITCODE -ne 0){throw ('Houdini check failed: '+$toolTrialPattern)}
  }
  & npm run build
  if($LASTEXITCODE -ne 0){throw 'Production build failed.'}
  & powershell -NoProfile -ExecutionPolicy Bypass -File houdini\authoring\build-portable.ps1
  if($LASTEXITCODE -ne 0){throw 'Portable authoring build failed.'}
 }
 & git --no-pager diff --check
 if($LASTEXITCODE -ne 0){throw 'Diff check failed.'}
 if($Stage -or $StageOnly){
  & git add -- src/app/api/licensing/activate/route.ts src/app/api/licensing/renew/route.ts src/app/api/licensing/tool-trial/route.ts src/lib/signedToolTrialLicense.ts src/lib/signedTrialLicense.ts src/lib/trialActivation.ts src/lib/trialDatabase.ts src/components/AccountTrial.tsx src/app/information/page.tsx src/app/install/page.tsx houdini/python/qatools_licensing/client.py houdini/python/qatools_licensing/houdini_ui.py houdini/authoring/prepare_tool.py tests/licensing-routes.test.cjs tests/licensing-database.test.cjs tests/test_houdini_licensing.py tests/test_prepare_tool.py tests/test_tool_trials.py supabase/migrations/20261104130000_individual_tool_trials.sql handoff/QATOOLS_INDIVIDUAL_TOOL_TRIALS.md handoff/QATOOLS_POLICY_DECISIONS.md scripts/verify-tool-trials.ps1
  if($LASTEXITCODE -ne 0){throw 'Staging current trial files failed.'}
  & git add -- src/app/api/licensing/connect/route.ts src/app/api/account/houdini-connect/route.ts src/app/connect-houdini/page.tsx src/lib/houdiniConnection.ts tests/houdini-browser-connect.test.cjs supabase/migrations/20261104120000_houdini_browser_connection.sql handoff/QATOOLS_BROWSER_TRIAL_CONNECTION.md scripts/verify-browser-trial.ps1 src/app/globals.css houdini/authoring/prepared_tool.py houdini/authoring/install-authoring.ps1 houdini/authoring/export_worker.py tests/test_authoring_compatibility.py tests/test_export_worker.py
  if($LASTEXITCODE -ne 0){throw 'Staging compatibility dependencies failed.'}
  & git add -- .gitattributes houdini/authoring/build-portable.ps1 tests/test_prepared_tool.py tests/test_portable_authoring.py src/components/AccountActivationKey.tsx src/components/AdminToolPackage.tsx src/components/AdminProducts.css src/app/interactions.css handoff/QATOOLS_PORTABLE_AUTHORING.md
  if($LASTEXITCODE -ne 0){throw 'Staging portable authoring and account UI failed.'}
 }
 if($StageOnly){Write-Output 'Diff checked and trial batch staged. Tests and build were not repeated.'}
 else {Write-Output 'Individual tool trials and cook-cache checks passed. No migration, commit, upload or deployment performed.'}
} finally {$env:PYTHONPATH=$toolTrialPythonPath;Pop-Location}
