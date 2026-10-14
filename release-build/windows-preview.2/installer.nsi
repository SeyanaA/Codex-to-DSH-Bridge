Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"
!define PRODUCT "Codex-to-DSH Bridge"
!define VERSION "0.1.0-preview.2"
!define UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexToDSHBridge"
Name "${PRODUCT} ${VERSION}"
OutFile "Codex-to-DSH-Bridge-${VERSION}-windows-x64-setup.exe"
InstallDir "$LOCALAPPDATA\Programs\Codex-to-DSH Bridge"
InstallDirRegKey HKCU "${UNINST}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 32
SetDatablockOptimize on
CRCCheck force
VIProductVersion "0.1.0.2"
VIAddVersionKey /LANG=2052 "ProductName" "${PRODUCT}"
VIAddVersionKey /LANG=2052 "FileDescription" "Codex to DSH MCP Bridge Setup"
VIAddVersionKey /LANG=2052 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=2052 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=2052 "LegalCopyright" "MIT; third-party notices included"
Var TestMode
Var SetupResult
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TEXT "安装 Codex 与 DSH 的 MCP 桥接器。包含 Node.js、DSH 0.2.1-alpha.3 和第三方 DSH Crew 0.1.0-rc.14。$\r$\n$\r$\n安装会备份并注册当前用户的 Codex MCP 配置。首次使用需在 DSH 网页配置自己的模型凭据。模型任务使用对应服务的 API 用量。"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "app\payload\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\README.md"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "查看使用说明"
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "此安装包需要 Windows x64。"
    Abort
  ${EndIf}
  SetShellVarContext current
  StrCpy $TestMode 0
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/TESTMODE" $R1
  ${IfNot} ${Errors}
    StrCpy $TestMode 1
  ${EndIf}
FunctionEnd

Function .onVerifyInstDir
  GetFullPathName $R0 "$INSTDIR"
  ${GetRoot} "$R0" $R1
  ${If} "$R0" == "$R1\"
    Abort
  ${EndIf}
  ${If} "$R0" == "$PROFILE"
  ${OrIf} "$R0" == "$LOCALAPPDATA"
  ${OrIf} "$R0" == "$APPDATA"
    Abort
  ${EndIf}
  IfFileExists "$INSTDIR\bridge-install.json" checked
  FindFirst $R2 $R3 "$INSTDIR\*"
  inspect:
    ${If} "$R3" == ""
      FindClose $R2
      Goto checked
    ${EndIf}
    ${If} "$R3" != "."
    ${AndIf} "$R3" != ".."
      FindClose $R2
      Abort
    ${EndIf}
    FindNext $R2 $R3
    Goto inspect
  checked:
FunctionEnd

Section "Bridge" Main
  Call .onVerifyInstDir
  SetShellVarContext current
  IfFileExists "$INSTDIR\runtime\node.exe" 0 extract
  IfFileExists "$INSTDIR\payload\scripts\launcher.mjs" 0 extract
  nsExec::ExecToStack '"$INSTDIR\runtime\node.exe" "$INSTDIR\payload\scripts\launcher.mjs" stop'
  Pop $R0
  Pop $R1
  extract:
  SetOutPath "$INSTDIR"
  File "app\run.cmd"
  File "app\README.md"
  File "app\THIRD_PARTY_NOTICES.md"
  File "app\build-manifest.json"
  File "app\SBOM.json"
  File "app\bridge-runtime.tar.gz"
  SetOutPath "$INSTDIR\runtime"
  File "app\runtime\node.exe"
  File "app\runtime\NODE-LICENSE.txt"
  File "app\runtime\DSH-LICENSE.txt"
  SetOutPath "$INSTDIR\payload"
  File "app\payload\LICENSE"
  File "app\payload\package.json"
  SetOutPath "$INSTDIR\payload\scripts"
  File "app\payload\scripts\*.mjs"
  SetOutPath "$INSTDIR"
  ; A plain path sentinel avoids JSON escaping of custom Windows paths.
  FileOpen $R0 "$INSTDIR\install-root.txt" w
  FileWriteUTF16LE $R0 "$INSTDIR"
  FileClose $R0
  nsExec::ExecToStack '"$INSTDIR\runtime\node.exe" "$INSTDIR\payload\scripts\write-install-marker.mjs"'
  Pop $SetupResult
  Pop $R1
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  nsExec::ExecToStack /TIMEOUT=600000 '"$INSTDIR\runtime\node.exe" "$INSTDIR\payload\scripts\extract-archive.mjs"'
  Pop $SetupResult
  Pop $R1
  DetailPrint "$R1"
  ${If} $SetupResult != 0
    SetErrorLevel 1
    Abort "离线运行环境解包失败。"
  ${EndIf}
  Delete "$INSTDIR\bridge-runtime.tar.gz"
  nsExec::ExecToStack '"$INSTDIR\runtime\node.exe" "$INSTDIR\payload\scripts\launcher.mjs" install'
  Pop $SetupResult
  Pop $R1
  DetailPrint "$R1"
  ${If} $TestMode == 0
    CreateDirectory "$SMPROGRAMS\${PRODUCT}"
    CreateShortcut "$SMPROGRAMS\${PRODUCT}\1 安装与配置.lnk" "$INSTDIR\run.cmd" "install"
    CreateShortcut "$SMPROGRAMS\${PRODUCT}\2 启动 DSH Web.lnk" "$INSTDIR\run.cmd" "start"
    CreateShortcut "$SMPROGRAMS\${PRODUCT}\打开网页.lnk" "$INSTDIR\run.cmd" "open"
    CreateShortcut "$SMPROGRAMS\${PRODUCT}\停止服务.lnk" "$INSTDIR\run.cmd" "stop"
    CreateShortcut "$SMPROGRAMS\${PRODUCT}\诊断.lnk" "$INSTDIR\run.cmd" "doctor"
    CreateShortcut "$SMPROGRAMS\${PRODUCT}\使用说明.lnk" "$INSTDIR\README.md"
    CreateShortcut "$DESKTOP\${PRODUCT}.lnk" "$INSTDIR\run.cmd" "start"
    WriteRegStr HKCU "${UNINST}" "DisplayName" "${PRODUCT}"
    WriteRegStr HKCU "${UNINST}" "DisplayVersion" "${VERSION}"
    WriteRegStr HKCU "${UNINST}" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "${UNINST}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
    WriteRegDWORD HKCU "${UNINST}" "NoModify" 1
    WriteRegDWORD HKCU "${UNINST}" "NoRepair" 1
  ${EndIf}
  ${If} $SetupResult != 0
    IfSilent +2
    MessageBox MB_ICONEXCLAMATION "文件已安装，但 MCP 注册未完成。请运行开始菜单的“安装与配置”查看具体原因。"
    SetErrorLevel 1
  ${EndIf}
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  GetFullPathName $R0 "$INSTDIR"
  FileOpen $R1 "$INSTDIR\install-root.txt" r
  FileReadUTF16LE $R1 $R2
  FileClose $R1
  ${If} "$R0" != "$R2"
    MessageBox MB_ICONSTOP "安装路径标记不匹配，拒绝删除。"
    Abort
  ${EndIf}
  nsExec::ExecToStack '"$INSTDIR\runtime\node.exe" "$INSTDIR\payload\scripts\launcher.mjs" uninstall'
  Pop $R0
  Pop $R1
  ${If} $R0 != 0
    DetailPrint "$R1"
    SetErrorLevel 1
    Abort
  ${EndIf}
  ReadRegStr $R0 HKCU "${UNINST}" "InstallLocation"
  ${If} "$R0" == "$INSTDIR"
    Delete "$DESKTOP\${PRODUCT}.lnk"
    RMDir /r "$SMPROGRAMS\${PRODUCT}"
    DeleteRegKey HKCU "${UNINST}"
  ${EndIf}
  RMDir /r "$INSTDIR"
SectionEnd
