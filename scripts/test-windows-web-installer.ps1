param([string]$Installer)
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\package.json') -Raw -Encoding utf8 | ConvertFrom-Json).version
if (-not $Installer) { $Installer = Join-Path $PSScriptRoot ("..\dist\Codex-to-DSH-Bridge-$version-windows-x64-setup.exe") }
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base = Join-Path $env:TEMP ('codex-dsh-installer-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$app = Join-Path $base '安装 测试\Bridge'
$testUser = Join-Path $base '用户 data'
New-Item -ItemType Directory -Path (Join-Path $testUser '.codex'),(Join-Path $testUser '.dsh-codex-bridge\sessions') -Force | Out-Null
$utf8 = [Text.UTF8Encoding]::new($false)
$config = Join-Path $testUser '.codex\config.toml'
$policy = Join-Path $testUser '.codex\AGENTS.md'
[IO.File]::WriteAllText($config,"[mcp_servers.keep_me]`ncommand = `"keep-me`"`n",$utf8)
[IO.File]::WriteAllText($policy,'Keep this user preference.',$utf8)
$preserve = Join-Path $testUser '.dsh-codex-bridge\sessions\KEEP.txt'
[IO.File]::WriteAllText($preserve,'untouched-history-marker',$utf8)
$priorHome = $env:CODEX_DSH_BRIDGE_TEST_HOME
$priorDsh = $env:DSH_HOME
$env:CODEX_DSH_BRIDGE_TEST_HOME = $testUser
$env:DSH_HOME = Join-Path $testUser '.dsh-codex-bridge'
$node = Join-Path $app 'runtime\node.exe'
$launcher = Join-Path $app 'payload\scripts\desktop-launcher.mjs'
$record = [ordered]@{ version=$version; testMode=$true; realCredentialsCopied=$false; unicodeAndSpaces=$true; installerSha256=(Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash.ToLowerInvariant(); checkedAtUtc=[DateTime]::UtcNow.ToString('o') }
try {
  $install = Start-Process -FilePath $Installer -ArgumentList "/S /TESTMODE /D=$app" -WindowStyle Hidden -Wait -PassThru
  $record.installExit = $install.ExitCode
  if ($install.ExitCode -ne 0) { throw 'Installer failed' }
  $settingsFile = Join-Path $testUser '.codex-to-dsh-bridge\desktop.json'
  $saved = Get-Content -LiteralPath $settingsFile -Raw -Encoding utf8 | ConvertFrom-Json
  if ($saved.surface -ne 'web') { throw 'Installer did not select Web' }
  $manifest = Get-Content -LiteralPath (Join-Path $saved.profile 'package.json') -Raw -Encoding utf8 | ConvertFrom-Json
  $record.crewDisabled = -not ($manifest.dsh.profile.bundles -contains '@zseven-w/dsh-crew')
  if (-not $record.crewDisabled) { throw 'Fresh Web unexpectedly enabled Crew' }
  & $node $launcher install --surface web --web-url http://127.0.0.1:3083 --desktop-url http://127.0.0.1:19388
  if ($LASTEXITCODE -ne 0) { throw 'Repeat installation failed' }
  & $node $launcher serve
  if ($LASTEXITCODE -ne 0) { throw 'Installed Web failed to start' }
  & $node $launcher doctor
  if ($LASTEXITCODE -ne 0) { throw 'Installed doctor failed' }
  $ping = Invoke-RestMethod -Uri 'http://127.0.0.1:19388/_dsh/dsh-crew/ping'
  $record.installedBridgeReady = $ping.sessionReuse -and -not $ping.crewPluginRequired
  try { Invoke-WebRequest -Uri 'http://127.0.0.1:3083' -UseBasicParsing | Out-Null; throw 'Anonymous Web unexpectedly allowed' }
  catch { if ([int]$_.Exception.Response.StatusCode -ne 401) { throw }; $record.anonymousWebDenied = $true }
  $controlState = Get-Content -LiteralPath (Join-Path $testUser '.codex-to-dsh-bridge\bundled-web-host.json') -Raw -Encoding utf8 | ConvertFrom-Json
  $status = Invoke-RestMethod -Uri ("http://127.0.0.1:" + $controlState.port + '/status') -Headers @{Authorization=('Bearer ' + $controlState.controlToken)}
  $record.webHttpStatus = [int](Invoke-WebRequest -Uri $status.browserURL -UseBasicParsing).StatusCode
  $text = [IO.File]::ReadAllText($config)
  $record.otherMcpPreserved = $text.Contains('[mcp_servers.keep_me]')
  $record.singleManagedRegistration = ([regex]::Matches($text,'\[mcp_servers\.dsh_desktop_crew\]').Count -eq 1)
  $resolved = [IO.Path]::GetFullPath($app)
  if (-not $resolved.StartsWith([IO.Path]::GetFullPath($base) + [IO.Path]::DirectorySeparatorChar)) { throw 'Unsafe uninstall target' }
  $marker = Get-Content -LiteralPath (Join-Path $app 'bridge-install.json') -Raw | ConvertFrom-Json
  if ($marker.product -ne 'codex-to-dsh-bridge' -or [IO.Path]::GetFullPath($marker.installDir) -ne $resolved) { throw 'Marker mismatch' }
  # Leave the isolated service running: uninstall itself must stop its host.
  $uninstall = Start-Process -FilePath (Join-Path $app 'Uninstall.exe') -ArgumentList "/S _?=$app" -WindowStyle Hidden -Wait -PassThru
  $record.uninstallExit = $uninstall.ExitCode
  $after = [IO.File]::ReadAllText($config)
  $record.managedMcpRemoved = -not $after.Contains('[mcp_servers.dsh_desktop_crew]')
  $record.otherMcpPreservedAfterUninstall = $after.Contains('[mcp_servers.keep_me]')
  $record.preferencePreserved = [IO.File]::ReadAllText($policy).Contains('Keep this user preference.')
  $record.historyPreserved = [IO.File]::ReadAllText($preserve) -eq 'untouched-history-marker'
  $record.durableExtensionPreserved = Test-Path -LiteralPath (Join-Path $saved.profile 'codex-bridge\crew-session-hub.mjs')
  $record.runtimeRemoved = -not (Test-Path -LiteralPath (Join-Path $app 'runtime'))
  $record.hostStopped = -not (Test-Path -LiteralPath (Join-Path $testUser '.codex-to-dsh-bridge\bundled-web-host.json'))
  foreach ($name in @('crewDisabled','installedBridgeReady','singleManagedRegistration','otherMcpPreserved','managedMcpRemoved','otherMcpPreservedAfterUninstall','preferencePreserved','historyPreserved','durableExtensionPreserved','runtimeRemoved','hostStopped')) {
    if (-not $record[$name]) { throw "Acceptance failed: $name" }
  }
  if ($record.uninstallExit -ne 0 -or $record.webHttpStatus -ne 200) { throw 'Exit or HTTP check failed' }
  $record.pass = $true
} catch {
  $record.pass = $false; $record.error = $_.Exception.Message
  throw
} finally {
  # This only requests shutdown from the isolated test home; never touches 3080.
  if (Test-Path -LiteralPath $launcher) { & $node $launcher stop }
  $env:CODEX_DSH_BRIDGE_TEST_HOME = $priorHome
  $env:DSH_HOME = $priorDsh
  $output = Join-Path $repo 'docs\windows-web-installer-check.json'
  [IO.File]::WriteAllText($output,($record | ConvertTo-Json -Depth 6),$utf8)
  $record | ConvertTo-Json -Depth 6
}
