!macro customInstall
  StrCpy $R0 "$INSTDIR\resources\companion-setup.exe"
  ${If} ${FileExists} "$R0"
    ; Install companion silently
    ExecWait '"$R0" /S'
    ; Launch companion after install
    StrCpy $R1 "$LOCALAPPDATA\Programs\Omnyx Companion\Omnyx Companion.exe"
    ${If} ${FileExists} "$R1"
      Exec '"$R1"'
    ${EndIf}
  ${EndIf}
!macroend
