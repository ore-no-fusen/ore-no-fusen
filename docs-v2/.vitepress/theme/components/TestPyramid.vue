<template>
  <div class="pyramid-wrap">
    <div
      v-for="tier in tiers"
      :key="tier.label"
      class="pyramid-block"
      :style="{ width: tier.width, backgroundColor: tier.color }"
    >
      {{ tier.icon }} {{ tier.label }}
      <span class="pyramid-sub">{{ tier.sub }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const tiers = [
  {
    icon: '🎭',
    label: 'E2E テスト（Playwright）',
    sub: '3 ファイル / ブラウザ + Tauri 実アプリ',
    width: '38%',
    color: '#7c3aed',
  },
  {
    icon: '⚡',
    label: 'ユニットテスト（Vitest）',
    sub: '11 ファイル / jsdom 環境',
    width: '64%',
    color: '#2563eb',
  },
  {
    icon: '🦀',
    label: 'Rust ユニットテスト（cargo test）',
    sub: 'gdrive.rs / webpush.rs / logic.rs 等 / インプロセス',
    width: '90%',
    color: '#059669',
  },
]
</script>

<style>
.pyramid-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin: 24px auto;
  max-width: 600px;
}
.pyramid-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 20px;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.95em;
  text-align: center;
  color: #fff;
}
.pyramid-sub {
  font-size: 0.78em;
  font-weight: 400;
  margin-top: 4px;
  opacity: 0.9;
  display: block;
}
</style>
