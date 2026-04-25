<script setup lang="ts">
defineProps<{
  id: string
  isNew?: boolean
  isDone?: boolean
  req: string
  reason: string
}>()
</script>

<template>
  <div :class="['req-card', { 'new': isNew, 'req': !isNew }]">
    <div class="req-row">
      <div class="req-label type-req">要求</div>
      <div class="req-content">
        <span :class="['req-id', { 'done': isDone }]">[{{ id }}]</span>
        <span class="req-text">{{ req }}</span>
      </div>
    </div>
    
    <div class="req-row">
      <div class="req-label type-reason">理由</div>
      <div class="req-content">{{ reason }}</div>
    </div>
    
    <div class="req-row">
      <div class="req-label type-spec">仕様</div>
      <div class="req-content">
        <slot></slot>
      </div>
    </div>
  </div>
</template>
