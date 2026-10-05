param([string]$HoudiniPreferences = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'houdini22.0'))
$ErrorActionPreference = 'Stop'
$taskPackages = Join-Path $HoudiniPreferences 'packages'
$taskDestination = Join-Path $taskPackages 'qatools-authoring'
$taskPython = Join-Path $taskDestination 'python3.13libs\qatools_authoring'
$taskToolbar = Join-Path $taskDestination 'toolbar'
$taskStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$taskFiles = @('__init__.py','prepared_tool.py','prepare_tool.py')
New-Item -ItemType Directory -Path $taskPython,$taskToolbar -Force | Out-Null
foreach ($taskFile in $taskFiles) {
 $taskTarget = Join-Path $taskPython $taskFile
 if (Test-Path -LiteralPath $taskTarget) {Copy-Item -LiteralPath $taskTarget -Destination ($taskTarget + '.backup-' + $taskStamp)}
 Copy-Item -LiteralPath (Join-Path $PSScriptRoot $taskFile) -Destination $taskTarget
}
$taskShelf = Join-Path $taskToolbar 'qatools-authoring.shelf'
if (Test-Path -LiteralPath $taskShelf) {Copy-Item -LiteralPath $taskShelf -Destination ($taskShelf + '.backup-' + $taskStamp)}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'toolbar\qatools-authoring.shelf') -Destination $taskShelf
$taskConfigPath = Join-Path $taskPackages 'qatools-authoring.json'
if (Test-Path -LiteralPath $taskConfigPath) {Copy-Item -LiteralPath $taskConfigPath -Destination ($taskConfigPath + '.backup-' + $taskStamp)}
$taskConfig = '{"env":[{"qatools_authoring":"$HOUDINI_PACKAGE_PATH/qatools-authoring"}],"path":[{"HOUDINI_PATH":"$qatools_authoring"}]}'
[System.IO.File]::WriteAllText($taskConfigPath,$taskConfig)
Write-Output 'qatools authoring installed. Restart Houdini and enable the qatools authoring shelf.'
Write-Output ('Package: ' + $taskDestination)
