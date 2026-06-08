!macro customInstall
  ; Install Omnyx Companion silently alongside the main app
  StrCpy $R0 "$INSTDIR\resources\companion-setup.exe"
  ${If} ${FileExists} "$R0"
    ExecWait '"$R0" /S'
  ${EndIf}
!macroend
