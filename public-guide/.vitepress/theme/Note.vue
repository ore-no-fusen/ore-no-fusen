<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  type?: 'info' | 'warning' | 'success' | 'danger'
}>(), {
  type: 'info'
})

const colorClass = computed(() => {
  switch (props.type) {
    case 'warning': return 'note-yellow'
    case 'success': return 'note-green'
    case 'danger': return 'note-red'
    case 'info':
    default:
      return 'note-blue'
  }
})
</script>

<template>
  <div :class="['note-box', colorClass]">
    <slot></slot>
  </div>
</template>
