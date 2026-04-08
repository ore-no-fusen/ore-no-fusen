!include "MUI2.nsh"

Name "ore-no-fusen"
OutFile "{{{out_file}}}"
InstallDir "$LOCALAPPDATA\ore-no-fusen"

; CurrentUser向け (UAC昇格なし)
RequestExecutionLevel user

; アイコン・画像の設定 (tauri.conf.json側の設定を読み込むマクロ)
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "{{{header_image}}}"
!define MUI_WELCOMEFINISHPAGE_BITMAP "{{{sidebar_image}}}"

!define MUI_ABORTWARNING

; --- インストーラー ページ構成（最小構成3画面） ---
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; --- アンインストーラー ページ構成 ---
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; --- 日本語 ---
!insertmacro MUI_LANGUAGE "Japanese"

; --- 英語 ---
!insertmacro MUI_LANGUAGE "English"

LangString MUI_TEXT_WELCOME_INFO_TEXT ${LANG_JAPANESE} \
"ore-no-fusen をダウンロードいただき、ありがとうございます。$\r$\n$\r$\n思考を、デスクトップに貼り付けましょう。$\r$\n$\r$\n「インストール」をクリックしてインストールを開始してください。"

LangString MUI_TEXT_WELCOME_INFO_TEXT ${LANG_ENGLISH} \
"Thank you for downloading ore-no-fusen.$\r$\n$\r$\nPaste your thoughts onto the desktop.$\r$\n$\r$\nClick Install to begin the installation."

LangString MUI_TEXT_FINISH_INFO_TEXT ${LANG_JAPANESE} \
"インストールが完了しました。$\r$\n$\r$\nさっそく最初の付箋を作成しましょう。"

LangString MUI_TEXT_FINISH_INFO_TEXT ${LANG_ENGLISH} \
"Installation is complete.$\r$\n$\r$\nCreate your first sticky note now."

Section "Install"
  ; インストールディレクトリを設定
  SetOutPath "$INSTDIR"
  
  ; ★ アプリ全体をコピー (Tauriビルド後の実行ファイル)
  File "..\..\ore-no-fusen.exe"

  ; アンインストーラを生成
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; --- 旧バージョン名ショートカットを削除（バージョンなし名に統一するため）---
  FindFirst $0 $1 "$DESKTOP\ore-no-fusen *.lnk"
  loop_desktop:
    StrCmp $1 "" done_desktop
    Delete "$DESKTOP\$1"
    FindNext $0 $1
    Goto loop_desktop
  done_desktop:
  FindClose $0

  FindFirst $0 $1 "$SMPROGRAMS\ore-no-fusen *.lnk"
  loop_smprog:
    StrCmp $1 "" done_smprog
    Delete "$SMPROGRAMS\$1"
    FindNext $0 $1
    Goto loop_smprog
  done_smprog:
  FindClose $0

  ; --- ショートカット作成（バージョンなし・固定名）---
  CreateShortcut "$SMPROGRAMS\ore-no-fusen.lnk" "$INSTDIR\ore-no-fusen.exe"
  CreateShortcut "$DESKTOP\ore-no-fusen.lnk" "$INSTDIR\ore-no-fusen.exe"
SectionEnd

Section "Uninstall"
  ; ★ アンインストール時にファイルを削除
  Delete "$INSTDIR\ore-no-fusen.exe"

  ; ショートカットを削除
  Delete "$SMPROGRAMS\ore-no-fusen.lnk"
  Delete "$DESKTOP\ore-no-fusen.lnk"

  ; アンインストーラー自身を削除
  Delete "$INSTDIR\uninstall.exe"

  ; アプリが実行時に生成したファイルを削除
  Delete "$INSTDIR\app.log"

  ; WebViewキャッシュ（EBWebView）を削除
  RMDir /r "$INSTDIR\EBWebView"

  ; フォルダを完全削除（残ったファイルも含む）
  RMDir /r "$INSTDIR"
SectionEnd

