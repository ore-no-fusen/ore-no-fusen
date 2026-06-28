import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

// https://vitepress.dev/reference/site-config
export default withMermaid(defineConfig({
  title: '俺の付箋',
  description: 'DESIGN DOCS PORTAL',
  base: '/ore-no-fusen/',
  head: [
    ['script', { defer: '', src: 'https://cloud.umami.is/script.js', 'data-website-id': 'ab93c6f7-275c-43f5-a539-7f399e98e27f' }],
    ['meta', { name: 'google-site-verification', content: 'pofQfdwMUYp6bCxtOlqPb52NCLpYSF6LiUoRCCFbLWw' }]
  ],
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
    nav: [
      { text: 'ユーザーガイド', link: '/user-guide/' },
      { text: '設計書ポータル', link: '/' }
    ],

    sidebar: {
      '/user-guide/': [
        {
          text: 'ユーザーガイド',
          items: [
            { text: 'ヘルプトップ', link: '/user-guide/' },
            { text: 'はじめに・インストール', link: '/user-guide/install' },
            { text: '基本の使い方', link: '/user-guide/basic' },
            { text: 'くわしい使い方', link: '/user-guide/advanced' },
            { text: 'iPhone連携', link: '/user-guide/iphone' },
            { text: '困ったときに', link: '/user-guide/troubleshooting' },
            { text: '漫画で学ぶ', link: '/user-guide/comic' }
          ]
        }
      ],
      '/': [
        {
          text: '設計書一覧',
          items: [
            { text: 'INDEX', link: '/' },
            { text: '000-I Intention Layer', link: '/000_INTENTION_LAYER' },
            { text: '000 要求仕様', link: '/000_REQUIREMENTS' },
            { text: '001 システム全体像', link: '/001_OVERVIEW' },
            { text: '002 PC版設計', link: '/002_PC' },
            { text: '003 iPhone版設計', link: '/003_IPHONE' },
            { text: '004 テスト仕様', link: '/004_TEST' },
            { text: '005 用語集', link: '/005_GLOSSARY' },
            { text: '006 アーキテクチャ', link: '/006_ARCHITECTURE' },
            { text: '007 コミュニケーション設計', link: '/007_COMMUNICATION' },
            { text: '100 プライバシーポリシー', link: '/100_PRIVACY' },
            { text: '101 利用規約', link: '/101_TERMS' },
            { text: '200 Siri から PC に付箋を送る', link: '/200_SIRI_SETUP' }
          ]
        }
      ]
    },

    search: {
      provider: 'local'
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/ore-no-fusen/ore-no-fusen' }
    ]
  }
}))
