!define PROXYSWITCH_INSTALLER_HOOK_DIR "${__FILEDIR__}"
!include "x64.nsh"

!macro StopInstalledCaddy
  ; Use Tauri's existing prompt before stopping the main application. It must
  ; stop first, otherwise its recovery loop could restart Caddy during setup.
  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
  InitPluginsDir
  File /oname=$PLUGINSDIR\stop-installed-caddy.ps1 "${PROXYSWITCH_INSTALLER_HOOK_DIR}\stop-installed-caddy.ps1"
  ; The NSIS host is 32-bit. Use native PowerShell so executable paths of
  ; 64-bit Caddy processes can be inspected before any process is stopped.
  ${If} ${RunningX64}
    ${DisableX64FSRedirection}
  ${EndIf}
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\stop-installed-caddy.ps1" -InstallDirectory "$INSTDIR"'
  Pop $0
  Pop $1
  ${If} ${RunningX64}
    ${EnableX64FSRedirection}
  ${EndIf}
  ${If} $0 != 0
    DetailPrint "$1"
    Abort "Unable to stop the installed Caddy. Exit Moss ProxySwitch from its tray menu and retry."
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro StopInstalledCaddy
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro StopInstalledCaddy
!macroend
