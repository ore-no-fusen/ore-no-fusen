import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

// https://vitepress.dev/reference/site-config
export default withMermaid(defineConfig({
  title: "俺の付箋",
  description: "DESIGN DOCS PORTAL",
  base: '/ore-no-fusen/',
  mermaid: {
    sequence: {
      messageMargin: 12,
      mirrorActors: false,
      height: 28,
      boxMargin: 6,
      noteMargin: 8,
    }
  },
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: '📋 INDEX', link: '/' },
      { text: '000', link: '/000_REQUIREMENTS' },
      { text: '001', link: '/001_OVERVIEW' },
      { text: '002', link: '/002_PC' },
      { text: '003', link: '/003_IPHONE' },
      { text: '004', link: '/004_TEST' },
      { text: '005', link: '/005_GLOSSARY' },
      { text: '006', link: '/006_ARCHITECTURE' }
    ],

    sidebar: [
      {
        text: 'ドキュメント一覧',
        items: [
          { text: '📋 INDEX', link: '/' },
          { text: '000 要求仕様', link: '/000_REQUIREMENTS' },
          { text: '001 システム全体像', link: '/001_OVERVIEW' },
          { text: '002 PC版設計', link: '/002_PC' },
          { text: '003 iPhone版設計', link: '/003_IPHONE' },
          { text: '004 テスト仕様', link: '/004_TEST' },
          { text: '005 用語集', link: '/005_GLOSSARY' },
          { text: '006 アーキテクチャ', link: '/006_ARCHITECTURE' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/uck/ore-no-fusen' }
    ]
  }
})
)
