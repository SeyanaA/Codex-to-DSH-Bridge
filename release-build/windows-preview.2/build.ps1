param([Parameter(Mandatory=$true)][string]$NodeDirectory,[string]$Makensis = 'makensis.exe')
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $projectRoot
try {
  $nodePath = Join-Path $NodeDirectory 'node.exe'
  $npmPath = Join-Path $NodeDirectory 'npm.cmd'
  if ((& $nodePath --version) -ne 'v24.19.0') { throw 'Use the pinned Node.js 24.19.0 Windows x64 runtime.' }
  $appPath = Join-Path $PSScriptRoot 'app'
  New-Item -ItemType Directory -Path (Join-Path $appPath 'runtime') -Force | Out-Null
  Copy-Item -LiteralPath $nodePath -Destination (Join-Path $appPath 'runtime\node.exe')
  Copy-Item -LiteralPath (Join-Path $NodeDirectory 'LICENSE') -Destination (Join-Path $appPath 'runtime\NODE-LICENSE.txt')
  & $npmPath ci --prefix (Join-Path $appPath 'runtime\dsh') --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'DSH dependency installation failed.' }
  & $npmPath ci --prefix (Join-Path $appPath 'payload\template\web') --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Crew profile dependency installation failed.' }
  & $nodePath '.\release-build\windows-preview.2\finalize-stage.mjs'
  if ($LASTEXITCODE -ne 0) { throw 'Staging failed.' }
  & $nodePath '.\release-build\windows-preview.2\pack-runtime.mjs'
  if ($LASTEXITCODE -ne 0) { throw 'Runtime archive generation failed.' }
  & $Makensis /INPUTCHARSET UTF8 /V2 (Join-Path $PSScriptRoot 'installer.nsi')
  if ($LASTEXITCODE -ne 0) { throw 'NSIS compilation failed.' }
} finally { Pop-Location }
