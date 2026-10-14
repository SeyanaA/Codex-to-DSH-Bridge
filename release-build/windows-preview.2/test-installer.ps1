$ErrorActionPreference = 'Stop'
$installerPath = Join-Path $PSScriptRoot 'Codex-to-DSH-Bridge-0.1.0-preview.2-windows-x64-setup.exe'
$testBase = Join-Path $env:TEMP ('codex-dsh-installer-' + [guid]::NewGuid().ToString('N').Substring(0,12))
$testApp = Join-Path $testBase '安装 测试\Codex-to-DSH Bridge'
$testUser = Join-Path $testBase 'test-user'
New-Item -ItemType Directory -Path (Join-Path $testUser '.codex'),(Join-Path $testUser '.dsh-codex-bridge') -Force | Out-Null
$fixtureConfig = @'
model = "keep-existing-setting"

[mcp_servers.keep-me]
command = "node"
args = []
'@
[IO.File]::WriteAllText((Join-Path $testUser '.codex\config.toml'),$fixtureConfig,[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $testUser '.codex\AGENTS.md'),'Keep this user preference.',[Text.UTF8Encoding]::new($false))
# This private test copy stays outside the app and publishing directories.
$credentialSource = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.dsh-codex-bridge\.credentials.yaml'
Copy-Item -LiteralPath $credentialSource -Destination (Join-Path $testUser '.dsh-codex-bridge\.credentials.yaml')
$env:CODEX_DSH_BRIDGE_TEST_HOME = $testUser
$env:CODEX_DSH_BRIDGE_TEST_PORT = '3082'
$install = Start-Process -FilePath $installerPath -ArgumentList @('/S','/TESTMODE',('/D=' + $testApp)) -WindowStyle Hidden -Wait -PassThru
if ($install.ExitCode -ne 0) { throw ('Installer failed: ' + $install.ExitCode) }
$state = @{app=$testApp;home=$testUser;base=$testBase;installExitCode=$install.ExitCode;unicodeAndSpaces=$true}
$state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'installer-smoke-state.json') -Encoding utf8
$node = Join-Path $testApp 'runtime\node.exe'
& $node (Join-Path $PSScriptRoot 'packaging-smoke.mjs') --root $testApp --home $testUser --port 3082 --dispatch --report (Join-Path $PSScriptRoot 'installer-mcp-check.json')
if ($LASTEXITCODE -ne 0) { throw 'Installed MCP generation test failed.' }
$config = [IO.File]::ReadAllText((Join-Path $testUser '.codex\config.toml'))
if (-not $config.Contains('[mcp_servers.keep-me]') -or -not $config.Contains('keep-existing-setting')) { throw 'Pre-existing Codex settings were not preserved.' }
$appResolved = (Resolve-Path -LiteralPath $testApp).Path
$baseResolved = (Resolve-Path -LiteralPath $testBase).Path
if (-not $appResolved.StartsWith($baseResolved + [IO.Path]::DirectorySeparatorChar)) { throw 'Uninstall target is outside isolated test directory.' }
$sentinel = Get-Content -LiteralPath (Join-Path $testApp 'bridge-install.json') -Raw | ConvertFrom-Json
if ($sentinel.product -ne 'codex-to-dsh-bridge' -or [IO.Path]::GetFullPath($sentinel.installDir) -ne $appResolved) { throw 'Uninstall target marker mismatch.' }
$uninstall = Start-Process -FilePath (Join-Path $testApp 'Uninstall.exe') -ArgumentList @('/S',('_?=' + $testApp)) -WindowStyle Hidden -Wait -PassThru
if ($uninstall.ExitCode -ne 0) { throw ('Uninstall failed: ' + $uninstall.ExitCode) }
$after = [IO.File]::ReadAllText((Join-Path $testUser '.codex\config.toml'))
$policy = [IO.File]::ReadAllText((Join-Path $testUser '.codex\AGENTS.md'))
$uninstallCheck = @{exitCode=$uninstall.ExitCode;managedMcpRemoved=(-not $after.Contains('[mcp_servers.dsh-crew]'));otherMcpPreserved=$after.Contains('[mcp_servers.keep-me]');userPreferencePreserved=$policy.Contains('Keep this user preference.');dshDataPreserved=(Test-Path -LiteralPath (Join-Path $testUser '.dsh-codex-bridge\sessions'));installedRuntimeRemoved=(-not (Test-Path -LiteralPath (Join-Path $testApp 'runtime')))}
Remove-Item -LiteralPath (Join-Path $testUser '.dsh-codex-bridge\.credentials.yaml') -Force
$uninstallCheck | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'uninstaller-check.json') -Encoding utf8
foreach ($checkName in @('managedMcpRemoved','otherMcpPreserved','userPreferencePreserved','dshDataPreserved','installedRuntimeRemoved')) {
  if (-not $uninstallCheck[$checkName]) { throw ('Uninstall acceptance failed: ' + $checkName) }
}
$uninstallCheck | ConvertTo-Json
