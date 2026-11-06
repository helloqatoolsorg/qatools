param([string]$HoudiniPreferences = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'houdini22.0'))
$ErrorActionPreference = 'Stop'
$runtimePackages = Join-Path $HoudiniPreferences 'packages'
if (!(Test-Path -LiteralPath $runtimePackages) -or !(Get-ChildItem -LiteralPath $runtimePackages -Directory | Where-Object { $_.Name -ceq 'QATools' })) {
    throw 'Install a fresh QATools package with the exact QATools folder casing first. Old test packages are not renamed automatically.'
}
$runtimeTarget = Join-Path $HoudiniPreferences 'packages\QATools\python3.13libs\qatools_licensing'
$runtimeSource = Join-Path (Split-Path $PSScriptRoot -Parent) 'python\qatools_licensing'
if (!(Test-Path -LiteralPath (Join-Path $runtimeTarget 'config.py'))) {
    throw 'Install a complete QATools customer package before updating its runtime.'
}
$runtimeStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
foreach ($runtimeName in @('client.py','houdini_ui.py')) {
    $runtimeFile = Join-Path $runtimeTarget $runtimeName
    if (Test-Path -LiteralPath $runtimeFile) {
        Copy-Item -LiteralPath $runtimeFile -Destination ($runtimeFile + '.backup-' + $runtimeStamp)
    }
    Copy-Item -LiteralPath (Join-Path $runtimeSource $runtimeName) -Destination $runtimeFile
}
Write-Output 'Updated local QATools licensing runtime. Server configuration, public keys and license cache retained. Restart Houdini.'
