---
pageClass: user-guide-page
---

# はじめに・インストール

俺の付箋は、Markdownで書けるWindows向けデスクトップ付箋アプリです。

## インストール手順

| 手順 | やること |
|---|---|
| 1 | [Microsoft Store](https://apps.microsoft.com/detail/9N4MW0V2MVVG) を開く |
| 2 | 「入手」または「インストール」を選ぶ |
| 3 | Storeによるインストール完了を待つ |
| 4 | スタートメニューから「俺の付箋」を起動 |

コマンドで導入する場合は、Microsoft Storeと同じ正式版をwingetからインストールできます。

```powershell
winget install --id 9N4MW0V2MVVG --source msstore
```

::: info
更新はMicrosoft Storeから自動的に配信されます。GitHub ReleaseのMSI・NSISは5.0.0の既存利用者向け移行版が最後です。
:::

## 旧MSI・NSIS版から移行する

1. 旧版をアンインストールせず、先にMicrosoft Store版をインストールします。
2. 旧版を終了してからStore版を起動します。
3. 付箋、画像、タグ、保存先、設定が引き継がれていることを確認します。
4. Store版を終了し、Windowsの「インストールされているアプリ」から旧版をアンインストールします。
5. Store版を再起動し、データが残っていることを確認します。

::: warning
旧版とStore版は同時起動できません。旧版を先にアンインストールせず、Store版でデータを確認してから削除してください。
:::

## 初回に見る設定

| 項目 | おすすめ |
|---|---|
| 自動起動 | 毎日使うならオン |
| 効果音 | 完了音が欲しいならオン |
| データ保存場所 | こだわりがなければ初期値 |

付箋データは、PCローカルのMarkdownファイルとして保存されます。初期値は次の場所です。設定で別のフォルダを選んだ場合は、そのフォルダを確認してください。

```txt
C:\Users\[ユーザー名]\Documents\OreNoFusen
```

次: [基本の使い方](./basic.html)
