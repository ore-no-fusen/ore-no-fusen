'use client';

import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#EDE4D3] text-[#2C1F0E] py-20 px-6 font-sans">
      <div className="max-w-3xl mx-auto bg-white/70 p-8 sm:p-12 rounded-2xl shadow-sm border border-[#C8B89A]/50">
        <Link href="/landing" className="text-[#5C7A3E] text-sm font-bold mb-8 inline-block hover:underline">
          &larr; ホームへ戻る
        </Link>
        
        <h1 className="text-3xl font-bold mb-2">プライバシーポリシー</h1>
        <p className="text-sm text-[#8A7055] mb-8">プライバシーポリシー v1.1 / 2026-05-06</p>

        <div className="space-y-8 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold border-b border-[#C8B89A] pb-2 mb-4">1 基本方針</h2>
            <p>俺の付箋は、ユーザーのメモをできるだけユーザー自身の管理下に置くことを重視します。</p>
            <p className="mt-2">PC 版の付箋データは、ユーザーの PC 上のローカルフォルダに保存されます。iPhone 連携を利用する場合のみ、PC と iPhone の間でデータを受け渡すために、ユーザー自身の Google Drive を使用します。</p>
            <p className="mt-2">開発者が管理するサーバーには、付箋本文、添付画像、ユーザーの Google Drive 内ファイルの内容を保存しません。</p>
          </section>

          <section>
            <h2 className="text-xl font-bold border-b border-[#C8B89A] pb-2 mb-4">2 取得・保存する情報</h2>
            <h3 className="font-bold mt-4 mb-2">2.1 PC 版アプリ</h3>
            <p>PC 版アプリは、以下の情報をユーザーの PC 上に保存します。付箋データ（メモ本文、タグ、表示設定など）、アプリ設定、技術ログが含まれます。</p>
            
            <h3 className="font-bold mt-4 mb-2">2.2 iPhone 連携</h3>
            <p>iPhone 連携を利用する場合、以下の情報をユーザー自身の Google Drive に保存します：中継用JSONファイル（`notes_to_iphone.json` など）、Web Push 用の端末情報および鍵、添付画像ファイル。</p>
          </section>

          <section>
            <h2 className="text-xl font-bold border-b border-[#C8B89A] pb-2 mb-4">3 Google Drive の利用</h2>
            <p>俺の付箋は、Google Drive API を使用して、ユーザー自身の Google Drive に同期用ファイルを作成・読み書きします。使用するスコープは `drive.file` であり、アプリが作成したファイルのみを扱います。</p>
          </section>

          <section>
            <h2 className="text-xl font-bold border-b border-[#C8B89A] pb-2 mb-4">4 Vercel の利用</h2>
            <p>iPhone PWA は Vercel 上で配信されます。Vercel は OAuth トークンの交換および更新のために使用されますが、トークンそのものや付箋データは Vercel 上には保存されません。</p>
          </section>

          <section>
            <h2 className="text-xl font-bold border-b border-[#C8B89A] pb-2 mb-4">5 第三者提供</h2>
            <p>開発者は、ユーザーの付箋本文、添付画像、Google Drive 内の同期ファイルの内容を第三者へ販売、貸与、共有しません。</p>
          </section>

          <section>
            <h2 className="text-xl font-bold border-b border-[#C8B89A] pb-2 mb-4">6 データの削除</h2>
            <p>ユーザーは、PC 上のデータ削除、Drive 上のファイル削除、および Google アカウントのアクセス権削除を通じて、いつでもデータを削除できます。</p>
          </section>

          <section>
            <h2 className="text-xl font-bold border-b border-[#C8B89A] pb-2 mb-4">7 セキュリティ</h2>
            <p>Google OAuth の `client_secret` は開発者が安全に管理します。ユーザーは、自身の Google Drive 内の `ore-no-fusen` フォルダを第三者に共有しないよう注意してください。</p>
          </section>

          <section>
            <h2 className="text-xl font-bold border-b border-[#C8B89A] pb-2 mb-4">10 問い合わせ</h2>
            <p>プライバシーに関する問い合わせは、GitHub Issues またはアプリ公開ページに記載されたサポート窓口から連絡してください。</p>
            <p className="mt-2">GitHub: <a href="https://github.com/ore-no-fusen/ore-no-fusen" className="text-[#5C7A3E] underline">https://github.com/ore-no-fusen/ore-no-fusen</a></p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-[#C8B89A]">
          <Link href="/landing" className="text-[#5C7A3E] font-bold hover:underline">
            &larr; ホームへ戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
