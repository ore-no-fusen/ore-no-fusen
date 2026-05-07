'use client';

import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#EDE4D3] text-[#2C1F0E] py-20 px-6 font-sans">
      <div className="max-w-3xl mx-auto bg-white/70 p-8 sm:p-12 rounded-2xl shadow-sm border border-[#C8B89A]/50">
        <Link href="/landing" className="text-[#5C7A3E] text-sm font-bold mb-8 inline-block hover:underline">
          &larr; ホームへ戻る
        </Link>
        
        <h1 className="text-3xl font-bold mb-2">利用規約</h1>
        <p className="text-sm text-[#8A7055] mb-8">利用規約 v1.1 / 2026-05-06</p>

        <div className="space-y-8 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold border-b border-[#C8B89A] pb-2 mb-4">1 適用</h2>
            <p>本規約は、俺の付箋の PC アプリ、iPhone PWA、関連ドキュメント、関連機能の利用に適用されます。</p>
            <p className="mt-2">ユーザーは、本アプリを利用することで、本規約に同意したものとみなされます。</p>
          </section>

          <section>
            <h2 className="text-xl font-bold border-b border-[#C8B89A] pb-2 mb-4">2 アプリの概要</h2>
            <p>俺の付箋は、PC 上で付箋形式のメモを作成・編集・検索できるアプリです。iPhone 連携を有効にした場合、ユーザー自身の Google Drive を中継場所として使用し、PC と iPhone の間でメモを送受信できます。</p>
          </section>

          <section>
            <h2 className="text-xl font-bold border-b border-[#C8B89A] pb-2 mb-4">3 利用条件</h2>
            <p>ユーザーは、自己の責任で本アプリを利用するものとします。法令違反、他者の権利侵害、サービスの妨害行為などは禁止します。</p>
          </section>

          <section>
            <h2 className="text-xl font-bold border-b border-[#C8B89A] pb-2 mb-4">4 Google Drive 連携</h2>
            <p>本アプリは、Google Drive 連携のために OAuth スコープ `drive.file` を使用します。ユーザーは、Google Drive 内の `ore-no-fusen` フォルダやファイルを第三者に共有・公開しないでください。</p>
          </section>

          <section>
            <h2 className="text-xl font-bold border-b border-[#C8B89A] pb-2 mb-4">5 免責事項</h2>
            <p>開発者は、本アプリが常に正確、完全、安全に動作することを保証しません。本アプリの利用により発生した損害について、開発者は法律上認められる範囲で責任を負いません。重要なデータは自己の責任でバックアップを行ってください。</p>
          </section>

          <section>
            <h2 className="text-xl font-bold border-b border-[#C8B89A] pb-2 mb-4">6 知的財産権</h2>
            <p>本アプリのソースコード、ロゴ、ドキュメントに関する権利は、各権利者に帰属します。ソースコードは GitHub にて公開されているライセンス条件に従って利用できます。</p>
          </section>

          <section>
            <h2 className="text-xl font-bold border-b border-[#C8B89A] pb-2 mb-4">7 問い合わせ</h2>
            <p>本規約に関する問い合わせは、GitHub Issues またはアプリ公開ページに記載されたサポート窓口から連絡してください。</p>
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
