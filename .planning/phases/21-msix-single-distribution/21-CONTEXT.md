# Phase 21 Context: MSIX正式版への一本化

## 目的

配布形式を Microsoft Store 向け MSIX に一本化する。Microsoft Store を主配布・唯一の自動更新経路とし、winget は継続する。既存 MSI/NSIS ユーザーのデータと利用継続を最優先する。

## 確定事項

- D-01: 正式版は MSIX のみとし、MSI/NSIS の新規公開を終了する。
- D-02: Microsoft Store を主配布経路とする。
- D-03: winget は継続し、最終的に `msstore` ソースの Store 製品へ寄せる。
- D-04: Store が唯一の自動更新経路となるため、各正式リリースを Store へ提出する。
- D-05: 自動起動は MSIX StartupTask を使う。Windows 設定でユーザーが無効化した状態はアプリから強制再有効化しない。
- D-06: 既存の付箋・画像・設定の保存場所を維持し、旧インストーラー版からの移行を検証する。
- D-07: GitHub Release はリリースノート用途を基本とし、未署名 MSIX を一般配布しない。
- D-08: x64 を先に正式化し、ARM64 は別課題とする。
- D-09: Phase 20 の実機確認を完了してから正式移行する。
- D-10: 実装前に Store の Product ID、Package Identity、Publisher、証明書情報を確定する。
- D-11: 5.0.0を移行開始版とし、NSIS・MSI・Store MSIXの3形式を最後に提供する。
- D-12: 5.0.0のNSIS/MSIにはTauri Updater経由でStore移行案内を届け、旧版を先に削除させない。
- D-13: 5.1.0を移行完了版とし、正式配布をStore MSIXだけにする。
- D-14: 5.1.0以降、GitHub Releaseはリリースノートと自動生成されるソースアーカイブだけを基本とする。
- D-15: 5.1.0以降のwingetは`msstore`ソースを使い、community wingetへの版ごとのPRを終了する。

## 対象外

- 新機能の追加
- ARM64 対応
- Store 外での独自自動更新
- MSI/NSIS と MSIX の恒久的な併売

## リリース判断

Phase 21-04 の Store署名版による実機検証が完了するまで、MSI/NSIS の公開停止を確定しない。5.0.0を最終ブリッジ版、5.1.0をMSIX一本化完了版とする。
