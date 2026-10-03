# Build the current development package for a second Houdini 22.0 computer.
$ErrorActionPreference = 'Stop'
$taskRepoRoot = Split-Path -Parent $PSScriptRoot
$taskStage = Join-Path ([System.IO.Path]::GetTempPath()) ('qatools-package-' + [guid]::NewGuid().ToString('N'))
$taskPackage = Join-Path $taskStage 'qatools'
$taskOutput = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Path (Join-Path $taskPackage 'otls'),(Join-Path $taskPackage 'python3.13libs\qatools_licensing'),(Join-Path $taskPackage 'scripts'),$taskOutput -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'otls\qafit01_online.hdalc') -Destination (Join-Path $taskPackage 'otls')
Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'python\qatools_licensing') -Filter '*.py' | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $taskPackage 'python3.13libs\qatools_licensing') }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'scripts\pythonrc.py') -Destination (Join-Path $taskPackage 'scripts')
$taskJson = @'
{
  "env": [{ "qatools": "$HOUDINI_PACKAGE_PATH/qatools" }],
  "path": [{ "HOUDINI_PATH": "$qatools" }]
}
'@
[System.IO.File]::WriteAllText((Join-Path $taskStage 'qatools.json'),$taskJson)
$taskArchive = Join-Path $taskOutput 'qatools-houdini22-dev.zip'
Compress-Archive -LiteralPath (Join-Path $taskStage 'qatools.json'),$taskPackage -DestinationPath $taskArchive -Force
# Inspect the archive manifest without opening or bundling private server files.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip = [System.IO.Compression.ZipFile]::OpenRead($taskArchive)
try {
    $taskNames = @($taskZip.Entries | ForEach-Object { $_.FullName.Replace('\','/') })
    if ($taskNames | Where-Object { $_ -match '(?i)(\.env|private|license\.txt|account-v2\.json|__pycache__)' }) { throw 'Unexpected private/runtime file in package' }
    if (($taskNames | Where-Object { $_ -match '\.py$' }).Count -ne 5) { throw 'Unexpected Python file count' }
    if (-not ($taskNames -contains 'qatools.json')) { throw 'Missing package configuration' }
    if (-not ($taskNames -contains 'qatools/otls/qafit01_online.hdalc')) { throw 'Missing HDA' }
    Write-Output ('Verified development package: ' + $taskArchive)
    Write-Output ('Archive entries: ' + $taskZip.Entries.Count)
} finally { $taskZip.Dispose() }
# Leave staging in the OS temporary directory; never recursively delete a computed path.
