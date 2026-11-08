; Picked up by electron-builder's NSIS target (buildResources/installer.nsh).

; Uninstalling removes the wanheda:// handler main.ts writes at every start.
; An update runs the old uninstaller too, and must keep it.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegKey HKCU "Software\Classes\wanheda"
  ${endIf}
!macroend
