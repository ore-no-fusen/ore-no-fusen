import EndrollMatsuri from '../components/EndrollMatsuri';

// 本番の限定解除版購入リンク（差し替え時はここを変える）
const DONATE_URL = 'https://buy.stripe.com/eVq14o16fe7Ocuu0iofQI02';

export const metadata = {
    title: '奉納帳',
};

export default function EndrollPage() {
    return (
        <main className="min-h-screen bg-neutral-100 px-6 py-10 flex flex-col items-center justify-center gap-6">
            {/* 既定モックを表示。空状態の確認時だけ supporters を差し替える */}
            <section className="text-center text-neutral-700">
                <p className="text-base leading-7">俺の付箋 限定解除版を購入してくれて、ありがとう。</p>
                <p className="text-sm leading-7">あなたの応援が、これからの開発を支えます。</p>
                <p className="mt-2 text-xs text-neutral-500">— hirobu</p>
            </section>
            <EndrollMatsuri supporters={[]} />
            <a
                href={DONATE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-amber-400 px-8 py-3 text-base font-semibold text-amber-950 shadow-md transition hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
            >
                限定解除版を購入
            </a>
        </main>
    );
}
