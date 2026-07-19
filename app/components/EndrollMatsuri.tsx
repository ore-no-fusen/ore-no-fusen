import React from 'react';

export type Supporter = {
    name: string;
    joinedAt: number;
    amount?: number;
    comment?: string;
};

interface Props {
    supporters?: Supporter[];
    language?: 'ja' | 'en';
}

const defaultSupporters: Supporter[] = [
    { name: '佐藤はるか', joinedAt: 1704067200000, amount: 5000, comment: '一番槍、応援しています' },
    { name: 'Kenji Mori', joinedAt: 1704153600000, amount: 1200 },
    { name: '山本灯', joinedAt: 1704240000000, amount: 3000, comment: '開発の灯りに' },
    { name: 'Aoi Tanaka', joinedAt: 1704326400000, amount: 800 },
    { name: '中村しおり', joinedAt: 1704412800000, amount: 1500 },
    { name: 'Mika K.', joinedAt: 1704499200000, amount: 500, comment: 'いつも使っています' },
    { name: '伊藤直人', joinedAt: 1704585600000, amount: 2500 },
    { name: 'Ryo Watanabe', joinedAt: 1704672000000, amount: 1000 },
    { name: '小林ゆめ', joinedAt: 1704758400000, amount: 3500, comment: '次の更新も楽しみです' },
    { name: 'Sakura N.', joinedAt: 1704844800000, amount: 700 },
    { name: '加藤みのり', joinedAt: 1704931200000, amount: 2000 },
    { name: 'Daichi', joinedAt: 1705017600000, amount: 100 },
    { name: '森田さち', joinedAt: 1705104000000, amount: 4500, comment: '感謝を込めて' },
    { name: 'Hana Ito', joinedAt: 1705190400000, amount: 600 },
    { name: '鈴木航', joinedAt: 1705276800000, amount: 1800 },
    { name: 'Yuki Sato', joinedAt: 1705363200000, amount: 900, comment: '小さく支援' },
    { name: '高橋まこと', joinedAt: 1705449600000, amount: 4000 },
    { name: 'Naomi', joinedAt: 1705536000000, amount: 1300 },
];

function getRankStyle(rank: number): React.CSSProperties {
    if (rank <= 1) {
        return { color: '#f6d878', fontSize: '280px', fontWeight: 500 };
    }
    if (rank <= 4) {
        return { color: '#f3e7c4', fontSize: '240px', fontWeight: 500 };
    }
    if (rank <= 8) {
        return { color: '#ece0b8', fontSize: '210px', fontWeight: 400 };
    }
    if (rank <= 13) {
        return { color: '#dccfa3', fontSize: '185px', fontWeight: 400 };
    }
    return { color: '#cdbf91', fontSize: '168px', fontWeight: 400 };
}

function formatAmount(amount: number): string {
    return `¥${Math.round(amount).toLocaleString()}`;
}

function formatJoinedDate(joinedAt: number): string {
    const date = new Date(joinedAt);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function Lantern() {
    return (
        <span
            aria-hidden="true"
            style={{
                width: '18px',
                height: '26px',
                borderRadius: '8px',
                backgroundColor: '#d23b2a',
                border: '1px solid #f0a93a',
                boxShadow: '0 0 14px rgba(210, 59, 42, 0.35)',
                display: 'inline-block',
                position: 'relative',
            }}
        />
    );
}

export default function EndrollMatsuri({ supporters = defaultSupporters, language = 'ja' }: Props) {
    const isEnglish = language === 'en';
    const sortedSupporters = [...supporters].sort((a, b) => a.joinedAt - b.joinedAt);
    const count = sortedSupporters.length;
    const hasSupporters = count > 0;

    const rollContent = (
        <>
            {sortedSupporters.map((supporter, rank) => (
                <div
                    key={`${supporter.joinedAt}-${supporter.name}-${rank}`}
                    style={{
                        textAlign: 'center',
                        width: '100%',
                        padding: rank <= 1 ? '12px 8px 16px' : '8px',
                    }}
                >
                    {rank <= 1 && (
                        <div
                            style={{
                                color: '#f0a93a',
                                fontSize: '42px',
                                fontWeight: 500,
                                lineHeight: 1.4,
                                marginBottom: '4px',
                                display: 'block',
                                width: '100%',
                                textAlign: 'center',
                            }}
                        >
                            {isEnglish ? 'Founding supporter' : '創設メンバー'}
                        </div>
                    )}
                    <div
                        style={{
                            ...getRankStyle(rank),
                            lineHeight: 1.25,
                            whiteSpace: 'nowrap',
                            display: 'block',
                            width: '100%',
                            textAlign: 'center',
                        }}
                    >
                        {supporter.name}
                    </div>
                    {supporter.amount !== undefined && (
                        <div
                            style={{
                                color: '#e7c97a',
                                fontSize: '60px',
                                lineHeight: 1.45,
                                marginTop: '4px',
                                display: 'block',
                                width: '100%',
                                textAlign: 'center',
                            }}
                        >
                            {formatAmount(supporter.amount)}
                        </div>
                    )}
                    <div
                        style={{
                            color: '#bcae84',
                            fontSize: '52px',
                            lineHeight: 1.45,
                            marginTop: '2px',
                            display: 'block',
                            width: '100%',
                            textAlign: 'center',
                        }}
                    >
                        {formatJoinedDate(supporter.joinedAt)}
                    </div>
                    {supporter.comment && (
                        <div
                            style={{
                                color: '#bcae84',
                                fontSize: '52px',
                                lineHeight: 1.45,
                                marginTop: '2px',
                                whiteSpace: 'nowrap',
                                display: 'block',
                                width: '100%',
                                textAlign: 'center',
                            }}
                        >
                            {supporter.comment}
                        </div>
                    )}
                </div>
            ))}
            <div
                style={{
                    textAlign: 'center',
                    width: '100%',
                    padding: '28px 8px 36px',
                }}
            >
                <div
                    style={{
                        color: '#f0a93a',
                        fontSize: '20px',
                        fontWeight: 500,
                        lineHeight: 1.4,
                        display: 'block',
                        width: '100%',
                        textAlign: 'center',
                    }}
                >
                    {isEnglish ? `${count} supporters` : `${count}人が応援`}
                </div>
                <div
                    style={{
                        color: '#f3cf6b',
                        fontSize: '13px',
                        lineHeight: 1.6,
                        marginTop: '8px',
                        display: 'block',
                        width: '100%',
                        textAlign: 'center',
                    }}
                >
                    {isEnglish
                        ? 'Your name can be here too—larger and closer to the top while the roll is young.'
                        : 'あなたの名前も、ここに。今なら大きく、上に。'}
                </div>
            </div>
        </>
    );

    return (
        <section
            aria-label={isEnglish ? 'Roll of supporters' : '応援してくれた人たちの奉納帳'}
            style={{
                maxWidth: '100%',
                margin: '0 auto',
                padding: '22px 20px 20px',
                borderRadius: '16px',
                border: '1px solid #c79a3e',
                backgroundColor: '#161d36',
                color: '#ece0b8',
                boxShadow: '0 18px 44px rgba(0, 0, 0, 0.28)',
                fontFamily: 'ui-serif, "Yu Mincho", "Hiragino Mincho ProN", serif',
            }}
        >
            <style>
                {`
                    @keyframes endrollMatsuriScroll {
                        from { transform: rotateX(14deg) translateY(0); }
                        to { transform: rotateX(14deg) translateY(-50%); }
                    }

                    .endrollMatsuriRoll {
                        animation: endrollMatsuriScroll 18s linear infinite;
                        transform: rotateX(14deg) translateY(0);
                        transform-origin: 50% 100%;
                        transform-style: preserve-3d;
                        will-change: transform;
                        text-align: center;
                        width: 100%;
                    }

                `}
            </style>
            <header
                style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 1fr 32px',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'center',
                    paddingBottom: '18px',
                }}
            >
                <Lantern />
                <div>
                    <div
                        style={{
                            color: '#b9b08f',
                            fontSize: '13px',
                            lineHeight: 1.4,
                        }}
                    >
                        {isEnglish ? 'Ore No Fusen' : '俺の付箋'}
                    </div>
                    <h2
                        style={{
                            color: '#f3cf6b',
                            fontSize: '26px',
                            fontWeight: 500,
                            lineHeight: 1.25,
                            margin: '2px 0 0',
                        }}
                    >
                        {isEnglish ? 'Supporter Roll' : '奉納帳'}
                    </h2>
                </div>
                <Lantern />
            </header>
            <div
                className="endrollMatsuriViewport"
                style={{
                    position: 'relative',
                    height: '400px',
                    overflow: 'hidden',
                    borderTop: '1px solid #2c3556',
                    paddingTop: '10px',
                    perspective: '600px',
                    perspectiveOrigin: '50% 100%',
                    WebkitMaskImage: 'linear-gradient(to top, #000 55%, transparent)',
                    maskImage: 'linear-gradient(to top, #000 55%, transparent)',
                }}
            >
                {hasSupporters ? (
                    <div className="endrollMatsuriRoll">
                        <div style={{ width: '100%', textAlign: 'center' }}>{rollContent}</div>
                        <div
                            className="endrollMatsuriLoopCopy"
                            aria-hidden="true"
                            style={{ width: '100%', textAlign: 'center' }}
                        >
                            {rollContent}
                        </div>
                    </div>
                ) : (
                    <div
                        style={{
                            minHeight: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            padding: '18px 8px 28px',
                        }}
                    >
                        <div
                            style={{
                                color: '#9a936f',
                                fontSize: '13px',
                                lineHeight: 1.6,
                            }}
                        >
                            {isEnglish ? 'The supporter roll is still blank.' : '奉納帳は、まだ まっさらです'}
                        </div>
                        <div
                            style={{
                                color: '#f6d878',
                                fontSize: '24px',
                                fontWeight: 500,
                                lineHeight: 1.35,
                                marginTop: '10px',
                                maxWidth: '320px',
                            }}
                        >
                            {isEnglish ? 'Be the first light.' : 'あなたが、最初の灯に。'}
                        </div>
                        <div
                            style={{
                                color: '#b9b08f',
                                fontSize: '12.5px',
                                lineHeight: 1.7,
                                marginTop: '12px',
                                maxWidth: '340px',
                            }}
                        >
                            {isEnglish
                                ? 'The first supporter’s name will remain the largest and at the very top.'
                                : '一番乗りの名前は、いちばん大きく・いちばん上に・ずっと。'}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
