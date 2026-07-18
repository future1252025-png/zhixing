<script setup lang="ts">
defineProps<{
  name: 'orbit' | 'calendar' | 'route' | 'user' | 'scan' | 'upload' | 'arrow' | 'spark'
  size?: number
}>()
</script>

<template>
  <svg
    class="tech-icon"
    :width="size || 24"
    :height="size || 24"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <template v-if="name === 'orbit'">
      <circle cx="12" cy="12" r="2.25" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="12" rx="9" ry="4.8" />
      <ellipse cx="12" cy="12" rx="4.8" ry="9" transform="rotate(38 12 12)" />
      <circle cx="19.1" cy="9.1" r="1.1" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'calendar'">
      <rect x="3.25" y="4.75" width="17.5" height="16" rx="3.25" />
      <path d="M7.5 2.75v4M16.5 2.75v4M3.5 9.25h17" />
      <path d="M7.25 13h2.5v2.5h-2.5zM14.25 13h2.5v2.5h-2.5z" />
    </template>
    <template v-else-if="name === 'route'">
      <circle cx="5" cy="18.5" r="2.25" />
      <circle cx="18.5" cy="5.5" r="2.25" />
      <path d="M7.2 18.2c6.1-.4 1.2-7.3 7.3-8.2 2.8-.4 4-1.9 4-2.3" />
      <path d="m9 14 2.5 1.8L9.7 18" />
    </template>
    <template v-else-if="name === 'user'">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M4.5 20c.7-4.1 3.2-6.1 7.5-6.1s6.8 2 7.5 6.1" />
      <path d="M17.5 4.5h3M19 3v3" />
    </template>
    <template v-else-if="name === 'scan'">
      <path d="M8 3.5H5.5a2 2 0 0 0-2 2V8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 7v2M12 15v2M7 12h2M15 12h2" />
    </template>
    <template v-else-if="name === 'upload'">
      <path d="M12 15V3.5M7.8 7.8 12 3.5l4.2 4.3" />
      <path d="M4 13.5v4.25A2.25 2.25 0 0 0 6.25 20h11.5A2.25 2.25 0 0 0 20 17.75V13.5" />
    </template>
    <template v-else-if="name === 'arrow'">
      <path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" />
    </template>
    <template v-else>
      <path d="m12 2.8 1.5 5.1 5.2 1.4-5.2 1.5-1.5 5.1-1.5-5.1-5.2-1.5 5.2-1.4L12 2.8Z" />
      <path d="m18.5 15.2.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
    </template>
  </svg>
</template>

<style scoped>
.tech-icon {
  display: block;
  overflow: visible;
  stroke: currentColor;
  stroke-width: 1.55;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
