// 1つ上の階層にある「全体のスタイル」を読み込む
import "./test-styles.css"

export default function TestLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <section>
            {children}
        </section>
    )
}