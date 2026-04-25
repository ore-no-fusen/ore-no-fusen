<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  type?: 'user' | 'dev' | 'infra'
  icon: string
  name: string
}>(), {
  type: 'user'
})

const colorClass = computed(() => {
  switch (props.type) {
    case 'dev': return 'green'
    case 'infra': return 'yellow'
    case 'user':
    default:
      return 'blue'
  }
})
</script>

<template>
  <div :class="['actor-card', colorClass]">
    <div class="actor-icon">{{ icon }}</div>
    <div class="actor-info">
      <div class="actor-name">{{ name }}</div>
      <div class="actor-desc"><slot></slot></div>
    </div>
  </div>
</template>
