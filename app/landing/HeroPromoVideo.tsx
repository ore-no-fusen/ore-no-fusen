export default function HeroPromoVideo({ isEn = false }: { isEn?: boolean }) {
    return (
        <div className="relative mt-12 max-w-lg mx-auto" aria-labelledby="promo-video-title">
            <h2 id="promo-video-title" className="text-xl sm:text-2xl font-bold text-[#2C1F0E] mb-3">
                {isEn ? 'Meet FUSEN in 30 seconds' : '30秒でわかる「俺の付箋」'}
            </h2>
            <p className="text-sm text-[#6A5540] leading-relaxed mb-5">
                {isEn
                    ? 'Fold long notes, put them away, and bring them back. Ask the maker when you need help.'
                    : '折りたたむ。しまって呼び出す。困ったら、作った人に聞ける。'}
            </p>
            <div className="overflow-hidden rounded-xl border border-[#C8B898] bg-[#F6F5FC] shadow-lg">
                <video
                    controls
                    playsInline
                    preload="none"
                    poster="/screenshots/fusen-intro-30s-poster.jpg"
                    width={1080}
                    height={1080}
                    className="w-full h-auto block aspect-square"
                    aria-label={isEn ? 'FUSEN 30-second introduction, Japanese captions, no audio' : '俺の付箋の30秒紹介動画（字幕付き・音声なし）'}
                >
                    <source src="/screenshots/fusen-intro-30s.mp4" type="video/mp4" />
                    <a href="/screenshots/fusen-intro-30s.mp4">
                        {isEn ? 'Open the introduction video' : '紹介動画を開く'}
                    </a>
                </video>
            </div>
            <p className="mt-3 text-xs text-[#7A6A50]">
                {isEn ? 'Japanese captions · No audio · Press play to watch' : '字幕付き・音声なし／再生ボタンでご覧ください'}
            </p>
        </div>
    );
}
