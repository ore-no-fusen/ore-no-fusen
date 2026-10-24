{
    "schema":  1,
    "verified":  true,
    "currentSha256":  "73e4fb6e6d7c3c3c9d048bd5d9a8d57a59abfb0f741a367cd3414da370675e23",
    "tasks":  [
                  {
                      "id":  "pre-release-security",
                      "state":  "in_progress",
                      "branch":  "codex/リリース前セキュリティ対策",
                      "worktree":  ".w/リリース前セキュリティ対策",
                      "next":  "Astra最終レビュー・最終ビルド・残存脆弱性の扱いを確認する。開発作業再開後にdevelop統合へ進む",
                      "completion":  "対策・検証・残存リスクを記録し、develop統合と常設環境の起動確認を完了する"
                  },
                  {
                      "id":  "version-6-release",
                      "state":  "pending",
                      "branch":  "main",
                      "worktree":  ".w/正式リリース",
                      "next":  "対策・同期改善を含む更新Dev MSIXを準備する。現行6.0.0.3を新修正版と扱わない",
                      "completion":  "docs/010_RELEASE.mdに従い実機検証と提出物を準備し、利用者承認後に正式リリースとStore更新確認を完了する"
                  },
                  {
                      "id":  "release-device-verification",
                      "state":  "pending",
                      "branch":  "codex/リリース前セキュリティ対策",
                      "next":  "更新MSIXで起動・復元・QL・写真と本文のPC/Web往復・再起動保持を確認する。更新PreviewのiPhone、Android写真・編集・往復・ホーム画面起動を確認する",
                      "completion":  "対象版を明記した画面証拠と保存データ照合がそろう。過去版の閲覧だけで合格にしない"
                  },
                  {
                      "id":  "performance-and-resource-verification",
                      "state":  "pending",
                      "branch":  "codex/リリース前セキュリティ対策",
                      "next":  "通常同期と初回同期を分けて測定し、17窓負荷・300ms基準・Webメモリと資源解放を確認する",
                      "completion":  "実測と証拠を記録する。通常1.3秒と初回6.3秒を区別し、初回3秒目標未達を解決または利用者と判断する"
                  },
                  {
                      "id":  "completed-worktree-cleanup",
                      "state":  "pending",
                      "branch":  "codex/同期進捗と速度改善",
                      "next":  "同期改善ブランチのdevelop未統合コミット0件を確認済み。対策完了後に資料・変更・プロセス・junctionを保全確認して完了ツリーと枝を整理する",
                      "completion":  "常設develop起動を確認し完了一時ツリーを削除する。正式mainツリーはStore更新確認まで保持する"
                  },
                  {
                      "id":  "post-release-trash-cleanup",
                      "state":  "pending",
                      "branch":  "未作成（Ver.6リリース後）",
                      "next":  "保存期間3か月案、初回確認、以後の自動整理設定を設計する",
                      "completion":  "移動日と画像参照を安全に判定して確認・復元・削除の試験を完了する。移動日不明の既存データは自動削除しない"
                  },
                  {
                      "id":  "historical-unfinished-work-reconciliation",
                      "state":  "pending",
                      "branch":  "複数の旧ブランチ（要照合）",
                      "next":  "旧記録の右上リサイズ・機能利用データ調査・内部簡素化などを後続記録と照合する。develop未包含の旧枝9本を保全し未完了か履歴差分かを判定する",
                      "completion":  "未完了・完了・保全用の区別を根拠付きで整理する。古い日付や枝の存在だけで不要と判断しない"
                  }
              ],
    "completed":  [
                      {
                          "evidence":  "my/保全/CURRENT自動整理-本運用導入-20261024",
                          "completedAt":  "2026-10-24T23:30:59.1623464+09:00",
                          "id":  "cockpit-current-maintenance"
                      }
                  ],
    "verifiedAt":  "2026-10-24T23:30:59.1815795+09:00",
    "reviewValidUntil":  "2026-10-25T23:30:59.1815795+09:00",
    "reviewedWorktrees":  "worktree D:/Users/uck/Documents/curry-project/ore-no-fusen\r\nHEAD eb23a189804e9e0545c8f5bd08d201fb6d99eddf\r\nbranch refs/heads/develop\r\n\r\nworktree D:/Users/uck/Documents/curry-project/ore-no-fusen/.w/リリース前セキュリティ対策\r\nHEAD eb23a189804e9e0545c8f5bd08d201fb6d99eddf\r\nbranch refs/heads/codex/リリース前セキュリティ対策\r\n\r\nworktree D:/Users/uck/Documents/curry-project/ore-no-fusen/.w/正式リリース\r\nHEAD 1cac29edc6f483ee7c910605817449b2ccc2bf05\r\nbranch refs/heads/main\r\n\r\n"
}
