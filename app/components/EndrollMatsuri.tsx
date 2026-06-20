import React from 'react';

export type Supporter = {
    name: string;
    joinedAt: number;
};

interface Props {
    supporters?: Supporter[];
}

const defaultSupporters: Supporter[] = [
    { name: '佐藤はるか', joinedAt: 1704067200000 },
    { name: 'Kenji Mori', joinedAt: 1704153600000 },
    { name: '山本灯', joinedAt: 1704240000000 },
    { name: 'Aoi Tanaka', joinedAt: 1704326400000 },
    { name: '中村しおり', joinedAt: 1704412800000 },
    { name: 'Mika K.', joinedAt: 1704499200000 },
    { name: '伊藤直人', joinedAt: 1704585600000 },
    { name: 'Ryo Watanabe', joinedAt: 1704672000000 },
    { name: '小林ゆめ', joinedAt: 1704758400000 },
    { name: 'Sakura N.', joinedAt: 1704844800000 },
    { name: '加藤みのり', joinedAt: 1704931200000 },
    { name: 'Daichi', joinedAt: 1705017600000 },
    { name: '森田さち', joinedAt: 1705104000000 },
    { name: 'Hana Ito', joinedAt: 1705190400000 },
    { name: '鈴木航', joinedAt: 1705276800000 },
    { name: 'Yuki Sato', joinedAt: 1705363200000 },
    { name: '高橋まこと', joinedAt: 1705449600000 },
    { name: 'Naomi', joinedAt: 1705536000000 },
];

function getRankStyle(rank: number): React.CSSProperties {
    if (rank <= 1) {
        return { color: '#f6d878', fontSize: '30px', fontWeight: 500 };
    }
    if (rank <= 4) {
        return { color: '#ece0b8', fontSize: '21px', fontWeight: 500 };
    }
    if (rank <= 8) {
        return { color: '#c9bd97', fontSize: '15px', fontWeight: 400 };
    }
    if (rank <= 13) {
        return { color: '#9d9374', fontSize: '12.5px', fontWeight: 400 };
    }
    return { color: '#7d7459', fontSize: '11px', fontWeight: 400 };
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

export default function EndrollMatsuri({ supporters = defaultSupporters }: Props) {
    const sortedSupporters = [...supporters].sort((a, b) => a.joinedAt - b.joinedAt);
    const count = sortedSupporters.length;

    const rollContent = (
        <>
            {sortedSupporters.map((supporter, rank) => (
                <div
                    key={`${supporter.joinedAt}-${supporter.name}-${rank}`}
                    style={{
                        textAlign: 'center',
                        padding: rank <= 1 ? '12px 8px 16px' : '8px',
                    }}
                >
                    {rank <= 1 && (
                        <div
                            style={{
                                color: '#f0a93a',
                                fontSize: '11px',
                                fontWeight: 500,
                                lineHeight: 1.4,
                                marginBottom: '4px',
                            }}
                        >
                            創設メンバー
                        </div>
                    )}
                    <div
                        style={{
                            ...getRankStyle(rank),
                            lineHeight: 1.25,
                            wordBreak: 'break-word',
                        }}
                    >
                        {supporter.name}
                    </div>
                </div>
            ))}
            <div
                style={{
                    textAlign: 'center',
                    padding: '28px 8px 36px',
                }}
            >
                <div
                    style={{
                        color: '#f0a93a',
                        fontSize: '20px',
                        fontWeight: 500,
                        lineHeight: 1.4,
                    }}
                >
                    {count}人が応援
                </div>
                <div
                    style={{
                        color: '#f3cf6b',
                        fontSize: '13px',
                        lineHeight: 1.6,
                        marginTop: '8px',
                    }}
                >
                    あなたの名前も、ここに。今なら大きく、上に。
                </div>
            </div>
        </>
    );

    return (
        <section
            aria-label="応援してくれた人たちの奉納帳"
            style={{
                maxWidth: '560px',
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
                        from { transform: translateY(0); }
                        to { transform: translateY(-50%); }
                    }

                    .endrollMatsuriRoll {
                        animation: endrollMatsuriScroll 18s linear infinite;
                    }

                    @media (prefers-reduced-motion: reduce) {
                        .endrollMatsuriViewport {
                            overflow-y: auto !important;
                        }

                        .endrollMatsuriRoll {
                            animation: none !important;
                        }

                        .endrollMatsuriLoopCopy {
                            display: none !important;
                        }
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
                        俺の付箋
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
                        奉納帳
                    </h2>
                </div>
                <Lantern />
            </header>
            <div
                className="endrollMatsuriViewport"
                style={{
                    position: 'relative',
                    height: '300px',
                    overflow: 'hidden',
                    borderTop: '1px solid #2c3556',
                    paddingTop: '10px',
                }}
            >
                <div className="endrollMatsuriRoll">
                    <div>{rollContent}</div>
                    <div className="endrollMatsuriLoopCopy" aria-hidden="true">
                        {rollContent}
                    </div>
                </div>
            </div>
        </section>
    );
}
