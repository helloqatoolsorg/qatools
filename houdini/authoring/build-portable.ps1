param([string]$OutputDirectory=(Join-Path (Split-Path $PSScriptRoot -Parent) 'dist'))
$ErrorActionPreference='Stop'
function Get-PortableHash([string]$Path){
 $algorithm=[Security.Cryptography.SHA256]::Create();$stream=[IO.File]::OpenRead($Path)
 try{return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}
 finally{$stream.Dispose();$algorithm.Dispose()}
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$OutputDirectory=(Resolve-Path -LiteralPath $OutputDirectory).ProviderPath
$portableFiles=@('__init__.py','prepare_tool.py','prepared_tool.py','export_worker.py','install-authoring.ps1')
foreach($portableVersion in @('21.0','22.0')){
 $portableStage=Join-Path ([IO.Path]::GetTempPath()) ('qatools-authoring-kit-'+[guid]::NewGuid().ToString('N'))
 $portableTempZip=Join-Path $OutputDirectory ('.authoring-'+[guid]::NewGuid().ToString('N')+'.zip')
 try {
  New-Item -ItemType Directory -Path (Join-Path $portableStage 'toolbar') -Force | Out-Null
  foreach($portableFile in $portableFiles){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $portableFile) -Destination (Join-Path $portableStage $portableFile)}
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'toolbar\qatools-authoring.shelf') -Destination (Join-Path $portableStage 'toolbar\qatools-authoring.shelf')
  $portableMajor=$portableVersion.Split('.')[0]
  $portableCmdName='Install Houdini '+$portableMajor+'.cmd'
  $portableCmd='@echo off'+"`r`n"+'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-authoring.ps1" -HoudiniVersion '+$portableVersion+"`r`n"+'if errorlevel 1 (echo Installation failed. & pause & exit /b 1)'+"`r`n"+'echo Restart Houdini and enable the QATools dev shelf tab.'+"`r`n"+'pause'+"`r`n"
  [IO.File]::WriteAllText((Join-Path $portableStage $portableCmdName),$portableCmd,[Text.Encoding]::ASCII)
  $portableReadme=@"
QATools authoring utility for Houdini $portableVersion (Qt6/PySide6 build)

Extract this entire ZIP into a folder, then double-click '$portableCmdName'.
Restart Houdini and enable the 'QATools dev' shelf tab. Select your saved,
locked development SOP HDA and click 'Prepare QATools tool'.

Source: QA_Tool_Name_dev.hdalc (editable; retained unchanged).
Export: QA_Tool_Name.zip containing the black-box QA_Tool_Name.hdalc and identity.
An existing same-named ZIP is replaced only after successful export.

Install uses your Documents/houdini$portableVersion/packages preferences, no admin rights.
For custom preferences, run install-authoring.ps1 -HoudiniVersion $portableVersion
-HoudiniPreferences 'your actual Houdini preferences folder'.

This is the authoring utility, not a customer licensing installer. It contains
no account credentials, local license cache, private signing key or source HDAs.
Creating an export does not require a customer license key. Testing tool access
requires a compatible complete customer installation.

The same pure-Python utility supports 21 and 22 via scripts/python. Assets,
licensing dependencies and customer-download compatibility must still be tested
in each Houdini version. A Houdini 22-built HDA is not certified for Houdini 21.
"@
  [IO.File]::WriteAllText((Join-Path $portableStage 'README.txt'),$portableReadme,(New-Object Text.UTF8Encoding($false)))
  $portableHashes=@{}
  foreach($portableFile in $portableFiles){$portableHashes[$portableFile]=Get-PortableHash (Join-Path $portableStage $portableFile)}
  $portableManifest=@{schema=1;houdini=$portableVersion;qt='PySide6';modulePath='scripts/python/qatools_authoring';files=$portableHashes} | ConvertTo-Json -Depth 4
  [IO.File]::WriteAllText((Join-Path $portableStage 'authoring-kit.json'),$portableManifest,(New-Object Text.UTF8Encoding($false)))
  [IO.Compression.ZipFile]::CreateFromDirectory($portableStage,$portableTempZip)
  $portableZip=[IO.Compression.ZipFile]::OpenRead($portableTempZip)
  try {
   $portableNames=@($portableZip.Entries | ForEach-Object {$_.FullName.Replace('\','/')})
   $portableExpected=@($portableFiles)+@('toolbar/qatools-authoring.shelf',$portableCmdName,'README.txt','authoring-kit.json')
   if($portableNames.Count -ne $portableExpected.Count -or @($portableExpected | Where-Object {$_ -notin $portableNames}).Count){throw 'Portable archive manifest mismatch.'}
  } finally {$portableZip.Dispose()}
  $portableOutput=Join-Path $OutputDirectory ('qatools-authoring-houdini'+$portableMajor+'.zip')
  if(Test-Path -LiteralPath $portableOutput){[IO.File]::Replace($portableTempZip,$portableOutput,[NullString]::Value)}else{Move-Item -LiteralPath $portableTempZip -Destination $portableOutput}
  Write-Output ('Verified portable authoring kit: '+[IO.Path]::GetFullPath($portableOutput))
 } finally {
  if(Test-Path -LiteralPath $portableTempZip){Remove-Item -LiteralPath $portableTempZip}
  $portableTempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
  $portableStageFull=[IO.Path]::GetFullPath($portableStage)
  if(!$portableStageFull.StartsWith($portableTempRoot,[StringComparison]::OrdinalIgnoreCase) -or !(Split-Path $portableStageFull -Leaf).StartsWith('qatools-authoring-kit-')){throw 'Unsafe temporary cleanup path.'}
  if(Test-Path -LiteralPath $portableStageFull){Remove-Item -LiteralPath $portableStageFull -Recurse -Force}
 }
}
