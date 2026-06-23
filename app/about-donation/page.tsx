import Link from 'next/link';

export const metadata = { title: '限定解除版について | 俺の付箋' };

export default function AboutDonationPage() {
    return (
        <main
            className="min-h-screen px-6 py-16 text-[#2C1F0E] sm:py-24"
            style={{
                backgroundColor: '#EDE4D3',
                fontFamily:
                    "'Helvetica Neue', 'Arial', 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif",
            }}
        >
            <div className="mx-auto max-w-3xl">
                <div
                    className="relative rounded-sm px-6 py-10 shadow-[4px_8px_28px_rgba(0,0,0,0.12)] sm:px-10 sm:py-12"
                    style={{ backgroundColor: '#FFF8E8', border: '1px solid #C8B89A' }}
                >
                    <div
                        className="absolute -top-3 left-1/2 h-5 w-16 -translate-x-1/2 -rotate-1 rounded-sm opacity-80"
                        style={{ backgroundColor: '#F0E0A0', border: '1px solid #D8C880' }}
                        aria-hidden="true"
                    />

                    <p className="mb-4 text-xs font-bold uppercase tracking-[0.28em] text-[#8A7055]">
                        Support
                    </p>
                    <h1 className="mb-8 text-3xl font-extrabold tracking-tight text-[#2C1F0E] sm:text-4xl">
                        限定解除版について
                    </h1>

                    <div className="space-y-5 text-base leading-8 text-[#5C4A32]">
                        <p>
                            「俺の付箋（限定解除版）」は、購入者向けの限定機能解除権を含む有料版です。
                        </p>
                        <p>
                            現時点で解除される内容は、奉納帳への名前掲載です。掲載は任意で、表示名が空欄の場合は掲載されません。
                        </p>
                        <p>
                            将来追加される限定機能（例：特別テーマ、追加機能等）も、追加料金なしで解除されます。
                        </p>
                        <p>
                            基本アプリは無料で全機能を利用できます。限定機能のみが、本購入の対象です。
                        </p>
                        <p>
                            金額はお客様が指定できます。応援の意味合いで、自由な金額をお選びください。
                        </p>
                        <p>
                            購入の性質上、返金は原則として受け付けていません。
                        </p>
                    </div>

                    <section className="mt-10 border-t border-[#C8B89A]/60 pt-8">
                        <h2 className="mb-4 text-lg font-bold text-[#2C1F0E]">連絡先</h2>
                        <dl className="space-y-3 text-sm leading-7 text-[#5C4A32] sm:text-base">
                            <div>
                                <dt className="font-bold text-[#8A7055]">開発者</dt>
                                <dd>hirobu</dd>
                            </div>
                            <div>
                                <dt className="font-bold text-[#8A7055]">連絡先メール</dt>
                                <dd>
                                    <a
                                        href="mailto:onfdev0@gmail.com"
                                        className="font-medium text-[#5C7A3E] underline-offset-4 hover:underline"
                                    >
                                        onfdev0@gmail.com
                                    </a>
                                </dd>
                            </div>
                        </dl>
                    </section>

                    <section className="mt-8 border-t border-[#C8B89A]/60 pt-8">
                        <h2 className="mb-4 text-lg font-bold text-[#2C1F0E]">配布元</h2>
                        <p className="text-sm leading-7 text-[#5C4A32] sm:text-base">
                            ウェブサイト:{' '}
                            <Link
                                href="https://ore-no-fusen.vercel.app"
                                className="font-medium text-[#5C7A3E] underline-offset-4 hover:underline"
                            >
                                https://ore-no-fusen.vercel.app
                            </Link>
                        </p>
                    </section>
                </div>
            </div>
        </main>
    );
}
