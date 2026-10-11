Unicode true
!include "MUI2.nsh"
Name "Codex-to-DSH Bridge Preview"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Codex-to-DSH Bridge"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${SOURCE}/LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "安装启动器"
  SetOutPath "$INSTDIR"
  File /r "${STAGING}/*"
  CreateDirectory "$SMPROGRAMS\Codex-to-DSH Bridge"
  CreateShortcut "$DESKTOP\Codex-to-DSH Bridge.lnk" "$INSTDIR\run.cmd" "start" "$SYSDIR\shell32.dll" 14
  CreateShortcut "$SMPROGRAMS\Codex-to-DSH Bridge\1 安装与配置.lnk" "$INSTDIR\run.cmd" "install"
  CreateShortcut "$SMPROGRAMS\Codex-to-DSH Bridge\2 启动 DSH Web.lnk" "$INSTDIR\run.cmd" "start"
  CreateShortcut "$SMPROGRAMS\Codex-to-DSH Bridge\打开网页.lnk" "$INSTDIR\run.cmd" "open"
  CreateShortcut "$SMPROGRAMS\Codex-to-DSH Bridge\停止本程序的服务.lnk" "$INSTDIR\run.cmd" "stop"
  CreateShortcut "$SMPROGRAMS\Codex-to-DSH Bridge\诊断.lnk" "$INSTDIR\run.cmd" "doctor"
  CreateShortcut "$SMPROGRAMS\Codex-to-DSH Bridge\使用说明.lnk" "$INSTDIR\payload\README.md"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexToDSHBridge" "DisplayName" "Codex-to-DSH Bridge Preview"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexToDSHBridge" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexToDSHBridge" "DisplayVersion" "0.1.0-preview.1"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexToDSHBridge" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexToDSHBridge" "NoRepair" 1
SectionEnd

Section "Uninstall"
  MessageBox MB_OKCANCEL "请先停止本启动器的服务。卸载只删除程序文件和快捷方式；Codex/DSH 配置和备份会保留，需要你自行检查后恢复。继续卸载？" IDOK continue IDCANCEL cancel
  cancel:
    Abort
  continue:
  Delete "$DESKTOP\Codex-to-DSH Bridge.lnk"
  RMDir /r "$SMPROGRAMS\Codex-to-DSH Bridge"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexToDSHBridge"
  RMDir /r "$INSTDIR"
SectionEnd
