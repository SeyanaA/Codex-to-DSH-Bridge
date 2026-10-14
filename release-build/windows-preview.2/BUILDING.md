# Building the Windows installer

The source archive has a `release-build/windows-preview.2` directory. Run the build from the archive root on Windows x64.

Prerequisites: official Node.js **24.19.0** Windows x64 distribution (node.exe, npm.cmd and LICENSE), and **NSIS 3.13** (makensis.exe with its include, plugin and stub directories). npm installs the production dependencies pinned by the included lock files.

```powershell
& '.\release-build\windows-preview.2\build.ps1' -NodeDirectory 'C:\tools\node-v24.19.0-win-x64' -Makensis 'C:\tools\nsis-3.13\makensis.exe'
```

The output is `Codex-to-DSH-Bridge-0.1.0-preview.2-windows-x64-setup.exe` beside installer.nsi. The released installer contains the runtime and dependency files; the source archive omits those rebuildable binaries/dependencies.

Runtime sources: https://nodejs.org/dist/v24.19.0/ and https://github.com/deepseek-ai/deepseek-harness

Crew source: https://github.com/ZSeven-W/dsh-crew — the original fixed release is included under payload/vendor/crew and remains unmodified.

The CODEX_DSH_BRIDGE_TEST_HOME and CODEX_DSH_BRIDGE_TEST_PORT process environment variables are reserved for isolated installation tests. `/TESTMODE` suppresses the setup program's real Windows shortcut and registry changes while still testing extraction and MCP registration against that isolated home. Ordinary installation needs none of these test options.
