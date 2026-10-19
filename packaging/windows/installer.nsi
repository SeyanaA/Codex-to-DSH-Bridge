Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"
!define PRODUCT "Codex-to-DSH Bridge"
!define VERSION "0.3.0-preview.2"
!ifndef BRIDGE_SURFACE
!define BRIDGE_SURFACE "desktop"
!endif
!define UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexToDSHBridge"
Name "${PRODUCT} ${VERSION}"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Codex-to-DSH Bridge"
InstallDirRegKey HKCU "${UNINST}" "InstallLocation"
RequestExecutionLevel user
!ifndef BRIDGE_COMPRESSOR
!define BRIDGE_COMPRESSOR "lzma"
!endif
SetCompressor /SOLID ${BRIDGE_COMPRESSOR}
!if "${BRIDGE_COMPRESSOR}" == "lzma"
SetCompressorDictSize 32
!endif
SetDatablockOptimize on
CRCCheck force
VIProductVersion "0.3.0.2"
VIAddVersionKey /LANG=2052 "ProductName" "${PRODUCT}"
VIAddVersionKey /LANG=2052 "FileDescription" "Codex to DSH MCP Bridge Setup"
VIAddVersionKey /LANG=2052 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=2052 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=2052 "LegalCopyright" "MIT; third-party notices included"
Var TestMode
Var SetupResult
!define MUI_ABORTWARNING
!if "${BRIDGE_SURFACE}" == "web"
!define SURFACE_LABEL "DSH Web"
!define MUI_WELCOMEPAGE_TEXT "连接 Codex 与 DSH Web，同一对话持续委派。包含 Node.js 和 Web 离线运行环境。$\r$\n$\r$\n安装会备份并注册当前用户的 Codex MCP 配置。通信组件随包提供，无需启用 Crew 插件。模型任务使用对应服务的 API 用量。"
!else
!define SURFACE_LABEL "DSH Desktop"
!define MUI_WELCOMEPAGE_TEXT "连接 Codex 与已安装的 DSH Desktop，同一对话持续委派。包含 Node.js 和旧 Web 模式离线运行环境。$\r$\n$\r$\n安装会备份并注册当前用户的 Codex MCP 配置。请先安装并初始化 DSH Desktop；通信组件随包提供，无需另行启用 Crew。模型任务使用对应服务的 API 用量。"
!endif
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${STAGING}\payload\LICENSE"
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
  File "${STAGING}\run.cmd"
  File "${STAGING}\README.md"
  File "${STAGING}\THIRD_PARTY_NOTICES.md"
  File "${STAGING}\build-manifest.json"
  File "${STAGING}\SBOM.json"
  File "${STAGING}\RELEASE_NOTES.md"
  SetOutPath "$INSTDIR\docs"
  File /r "${STAGING}\docs\*"
  SetOutPath "$INSTDIR"
  File "${STAGING}\bridge-runtime.tar.gz"
  SetOutPath "$INSTDIR\runtime"
  File "${STAGING}\runtime\node.exe"
  File "${STAGING}\runtime\NODE-LICENSE.txt"
  File "${STAGING}\runtime\DSH-LICENSE.txt"
  SetOutPath "$INSTDIR\payload"
  File "${STAGING}\payload\LICENSE"
  File "${STAGING}\payload\package.json"
  File "${STAGING}\payload\README.md"
  File "${STAGING}\payload\RELEASE_NOTES.md"
  SetOutPath "$INSTDIR\payload\scripts"
  File "${STAGING}\payload\scripts\*.mjs"
  SetOutPath "$INSTDIR\payload\extensions"
  File "${STAGING}\payload\extensions\*.mjs"
  SetOutPath "$INSTDIR\payload\vendor\yaml"
  File /r "${STAGING}\payload\vendor\yaml\*"
  SetOutPath "$INSTDIR\payload\vendor"
  File "${STAGING}\payload\vendor\zseven-w-dsh-crew-0.1.0-rc.14.tgz"
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
  nsExec::ExecToStack '"$INSTDIR\runtime\node.exe" "$INSTDIR\payload\scripts\desktop-launcher.mjs" install --surface ${BRIDGE_SURFACE}'
  Pop $SetupResult
  Pop $R1
  DetailPrint "$R1"
  ${If} $TestMode == 0
    CreateDirectory "$SMPROGRAMS\${PRODUCT}"
    CreateShortcut "$SMPROGRAMS\${PRODUCT}\1 安装与配置.lnk" "$INSTDIR\run.cmd" "install"
    CreateShortcut "$SMPROGRAMS\${PRODUCT}\2 打开 ${SURFACE_LABEL}.lnk" "$INSTDIR\run.cmd" "start"
    CreateShortcut "$SMPROGRAMS\${PRODUCT}\打开 ${SURFACE_LABEL}.lnk" "$INSTDIR\run.cmd" "open"
    CreateShortcut "$SMPROGRAMS\${PRODUCT}\旧 Web 兼容入口.lnk" "$INSTDIR\run.cmd" "web-start"
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
  nsExec::ExecToStack '"$INSTDIR\runtime\node.exe" "$INSTDIR\payload\scripts\desktop-launcher.mjs" uninstall'
  Pop $R0
  Pop $R1
  ${If} $R0 != 0
    SetErrorLevel 1
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
