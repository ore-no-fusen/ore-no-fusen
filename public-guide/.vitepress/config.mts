import { defineConfig } from 'vitepress';
import { htmlBaseLinks } from './html-links.mjs';

const base = '/ore-no-fusen-guide/';
const ja = [
  ['ヘルプトップ', ''], ['はじめに・インストール', 'install'], ['基本の使い方', 'basic'],
  ['くわしい使い方', 'advanced'], ['iPhone連携', 'iphone'], ['困ったときに', 'troubleshooting'], ['漫画で学ぶ', 'comic'], ['応援する・サポート', 'support'],
];
const en = [
  ['Help Home', ''], ['Install and Get Started', 'install'], ['Basic Use', 'basic'],
  ['Advanced Use', 'advanced'], ['iPhone Sync', 'iphone'], ['Troubleshooting', 'troubleshooting'], ['Comic Guide', 'comic'], ['Support', 'support'],
];
export default defineConfig({
  title: '俺の付箋 ユーザーガイド',
  description: '俺の付箋のマニュアル・漫画・よくある質問',
  base,
  cleanUrls: false,
  lastUpdated: false,
  srcExclude: ['README.md'],
  markdown: { config(md) { md.use(htmlBaseLinks, base); } },
  vite: { build: { sourcemap: false } },
  themeConfig: {
    nav: [
      { text: 'マニュアル', link: '/user-guide/' }, { text: 'English', link: '/en/user-guide/' },
      { text: 'FAQ', link: '/faq' }, { text: '更新情報', link: '/updates' }, { text: 'お問い合わせ', link: '/contact' },
    ],
    sidebar: {
      '/en/user-guide/': [{ text: 'User Guide', items: en.map(([text, name]) => ({ text, link: `/en/user-guide/${name}` })) }],
      '/': [{ text: 'マニュアル', items: ja.map(([text, name]) => ({ text, link: `/user-guide/${name}` })) },
        { text: 'サポート', items: [
          { text: 'よくある質問', link: '/faq' }, { text: '更新情報', link: '/updates' }, { text: 'お問い合わせ', link: '/contact' },
          { text: 'プライバシーポリシー', link: '/100_PRIVACY' }, { text: '利用規約', link: '/101_TERMS' },
        ] }],
    },
    search: { provider: 'local' },
    footer: { message: '使い方・お問い合わせはこのユーザーガイドをご利用ください。', copyright: '© 2026 ONF Studios' },
  },
});
