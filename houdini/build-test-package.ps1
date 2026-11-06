# Build the current development package for a second Houdini 22.0 computer.
$ErrorActionPreference = 'Stop'
$taskRepoRoot = Split-Path -Parent $PSScriptRoot
$taskStage = Join-Path ([System.IO.Path]::GetTempPath()) ('qatools-package-' + [guid]::NewGuid().ToString('N'))
$taskPackage = Join-Path $taskStage 'QATools'
$taskOutput = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Path (Join-Path $taskPackage 'otls'),(Join-Path $taskPackage 'python3.13libs\qatools_licensing'),(Join-Path $taskPackage 'scripts'),$taskOutput -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'otls\qafit01_online.hdalc') -Destination (Join-Path $taskPackage 'otls')
Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'python\qatools_licensing') -Filter '*.py' | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $taskPackage 'python3.13libs\qatools_licensing') }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'scripts\pythonrc.py') -Destination (Join-Path $taskPackage 'scripts')
$taskJson = [System.IO.File]::ReadAllText((Join-Path $taskRepoRoot 'public\QATools.json'))
[System.IO.File]::WriteAllText((Join-Path $taskStage 'QATools.json'),$taskJson)
$taskArchive = Join-Path $taskOutput 'qatools-houdini22-dev.zip'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskPendingArchive = $taskArchive + '.building-' + [guid]::NewGuid().ToString('N')
$taskStream = [System.IO.File]::Open($taskPendingArchive,[System.IO.FileMode]::CreateNew)
$taskWriter = New-Object System.IO.Compression.ZipArchive($taskStream,[System.IO.Compression.ZipArchiveMode]::Create,$false)
try {
    $taskFiles = @((Get-Item -LiteralPath (Join-Path $taskStage 'QATools.json'))) + @(Get-ChildItem -LiteralPath $taskPackage -File -Recurse)
    foreach ($taskFile in $taskFiles) {
        $taskEntryName = $taskFile.FullName.Substring($taskStage.Length + 1).Replace('\','/')
        $taskEntry = $taskWriter.CreateEntry($taskEntryName)
        $taskSourceStream = [System.IO.File]::OpenRead($taskFile.FullName)
        $taskEntryStream = $taskEntry.Open()
        try { $taskSourceStream.CopyTo($taskEntryStream) }
        finally { $taskEntryStream.Dispose(); $taskSourceStream.Dispose() }
    }
} finally { $taskWriter.Dispose(); $taskStream.Dispose() }
# Inspect the archive manifest without opening or bundling private server files.
$taskZip = [System.IO.Compression.ZipFile]::OpenRead($taskPendingArchive)
try {
    $taskNames = @($taskZip.Entries | ForEach-Object { $_.FullName })
    if ($taskNames | Where-Object { $_.Contains('\') }) { throw 'ZIP paths must use forward slashes' }
    if ($taskNames | Where-Object { $_ -match '(?i)(\.env|private|license\.txt|account-v2\.json|__pycache__)' }) { throw 'Unexpected private/runtime file in package' }
    if (($taskNames | Where-Object { $_ -match '\.py$' }).Count -ne 5) { throw 'Unexpected Python file count' }
    if (-not ($taskNames -ccontains 'QATools.json')) { throw 'Missing QATools.json with exact casing' }
    if (-not ($taskNames -ccontains 'QATools/otls/qafit01_online.hdalc')) { throw 'Missing HDA or wrong QATools folder casing' }
    Write-Output ('Archive entries: ' + $taskZip.Entries.Count)
} finally { $taskZip.Dispose() }
if (Test-Path -LiteralPath $taskArchive) { [System.IO.File]::Replace($taskPendingArchive,$taskArchive,[NullString]::Value) }
else { Move-Item -LiteralPath $taskPendingArchive -Destination $taskArchive }
Write-Output ('Verified development package: ' + $taskArchive)
# Leave staging in the OS temporary directory; never recursively delete a computed path.
