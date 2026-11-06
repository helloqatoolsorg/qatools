param([string]$HoudiniPreferences='', [ValidateSet('21.0','22.0')][string]$HoudiniVersion='22.0')
$ErrorActionPreference = 'Stop'
function Get-AuthoringHash([string]$Path){
 $algorithm=[Security.Cryptography.SHA256]::Create();$stream=[IO.File]::OpenRead($Path)
 try{return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}
 finally{$stream.Dispose();$algorithm.Dispose()}
}
if(!$HoudiniPreferences){$HoudiniPreferences=Join-Path ([Environment]::GetFolderPath('MyDocuments')) ('houdini'+$HoudiniVersion)}
if(![IO.Path]::IsPathRooted($HoudiniPreferences)){throw 'Use an absolute Houdini preferences folder.'}
$taskPackages = Join-Path $HoudiniPreferences 'packages'
$taskDestination = Join-Path $taskPackages 'qatools-authoring'
# Pure Python authoring modules use the common path supported by both versions.
$taskPython = Join-Path $taskDestination 'scripts\python\qatools_authoring'
$taskToolbar = Join-Path $taskDestination 'toolbar'
$taskStamp = (Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[guid]::NewGuid().ToString('N')
$taskFiles = @('__init__.py','prepared_tool.py','prepare_tool.py','export_worker.py')
New-Item -ItemType Directory -Path $taskPython,$taskToolbar -Force | Out-Null
foreach ($taskFile in $taskFiles) {
 $taskTarget = Join-Path $taskPython $taskFile
 if (Test-Path -LiteralPath $taskTarget) {Copy-Item -LiteralPath $taskTarget -Destination ($taskTarget + '.backup-' + $taskStamp)}
 Copy-Item -LiteralPath (Join-Path $PSScriptRoot $taskFile) -Destination $taskTarget
 if((Get-AuthoringHash $taskTarget) -ne (Get-AuthoringHash (Join-Path $PSScriptRoot $taskFile))){throw ('Failed to verify '+$taskFile)}
}
# Preserve older copies outside Python's search paths, so they cannot shadow updates.
$taskBase=[IO.Path]::GetFullPath($taskDestination).TrimEnd('\')+'\'
Get-ChildItem -LiteralPath $taskDestination -Directory -Filter 'python*libs' | ForEach-Object {
 $taskLegacy=Join-Path $_.FullName 'qatools_authoring'
 if(Test-Path -LiteralPath $taskLegacy){
  $taskBackup=Join-Path $taskDestination ('backups\'+$taskStamp+'\'+$_.Name+'\qatools_authoring')
  $taskLegacyFull=[IO.Path]::GetFullPath($taskLegacy)
  $taskBackupFull=[IO.Path]::GetFullPath($taskBackup)
  if(!$taskLegacyFull.StartsWith($taskBase,[StringComparison]::OrdinalIgnoreCase) -or !$taskBackupFull.StartsWith($taskBase,[StringComparison]::OrdinalIgnoreCase)){throw 'Authoring backup path escaped its package.'}
  if((Get-Item -LiteralPath $taskLegacy).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'The old authoring module is a link; move it manually before installing.'}
  New-Item -ItemType Directory -Path (Split-Path $taskBackupFull -Parent) -Force | Out-Null
  Move-Item -LiteralPath $taskLegacyFull -Destination $taskBackupFull
 }
}
$taskShelf = Join-Path $taskToolbar 'qatools-authoring.shelf'
if (Test-Path -LiteralPath $taskShelf) {Copy-Item -LiteralPath $taskShelf -Destination ($taskShelf + '.backup-' + $taskStamp)}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'toolbar\qatools-authoring.shelf') -Destination $taskShelf
$taskConfigPath = Join-Path $taskPackages 'qatools-authoring.json'
if (Test-Path -LiteralPath $taskConfigPath) {
 $taskConfigBackup=Join-Path $taskDestination ('backups\'+$taskStamp+'\qatools-authoring.json')
 New-Item -ItemType Directory -Path (Split-Path $taskConfigBackup -Parent) -Force | Out-Null
 Copy-Item -LiteralPath $taskConfigPath -Destination $taskConfigBackup
}
$taskConfig = '{"env":[{"qatools_authoring":"$HOUDINI_PACKAGE_PATH/qatools-authoring"}],"path":[{"HOUDINI_PATH":"$qatools_authoring"}]}'
[System.IO.File]::WriteAllText($taskConfigPath,$taskConfig)
Write-Output ('QATools authoring installed for Houdini '+$HoudiniVersion+'. Restart Houdini and enable the QATools dev shelf tab.')
Write-Output ('Package: ' + $taskDestination)
if (!(Test-Path -LiteralPath (Join-Path $taskPython 'export_worker.py'))) {
 throw 'The headless export worker was not installed.'
}
Write-Output 'Export mode: separate headless Houdini worker installed.'
