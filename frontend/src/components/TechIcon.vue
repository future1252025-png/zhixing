<script setup lang="ts">
defineProps<{
  name:
    | 'orbit' | 'calendar' | 'route' | 'user' | 'scan' | 'upload' | 'arrow' | 'spark'
    | 'aim' | 'chevron-down' | 'to-top' | 'certificate' | 'chat' | 'contact' | 'close'
    | 'edit' | 'flag' | 'guide' | 'location' | 'notes' | 'plus' | 'refresh' | 'check'
    | 'home' | 'users' | 'bell' | 'search' | 'building'
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
    <template v-if="name === 'search'">
      <circle cx="10.5" cy="10.5" r="6.75" /><path d="m15.5 15.5 5 5" />
    </template>
    <template v-else-if="name === 'building'">
      <path d="M4 21V4l10-2v19M14 8h6v13M2 21h20M8 7h2M8 11h2M8 15h2M17 12h1M17 16h1" />
    </template>
    <template v-else-if="name === 'orbit'">
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
    <template v-else-if="name === 'bell'">
      <path d="M18 9a6 6 0 0 0-12 0v5l-2 3h16l-2-3V9Z" />
      <path d="M10 20a2 2 0 0 0 4 0M12 2v1" />
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
    <template v-else-if="name === 'aim'">
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2.75v2.5M12 18.75v2.5M2.75 12h2.5M18.75 12h2.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'chevron-down'">
      <path d="m6.25 9.5 5.75 5.75L17.75 9.5" />
    </template>
    <template v-else-if="name === 'to-top'">
      <path d="M5.5 3.75h13" />
      <path d="M12 20.5V8M7.7 12.3 12 8l4.3 4.3" />
    </template>
    <template v-else-if="name === 'certificate'">
      <circle cx="12" cy="9.5" r="5.25" />
      <path d="m9.4 14 -1.7 6.25 4.3-2.3 4.3 2.3L14.6 14" />
      <circle cx="12" cy="9.5" r="1.6" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'chat'">
      <path d="M12 3.9c4.8 0 8.5 2.9 8.5 6.7 0 3.8-3.7 6.8-8.5 6.8-.9 0-1.8-.1-2.6-.3l-4 2.7.9-3.6c-1.7-1.3-2.8-3.3-2.8-5.6 0-3.8 3.7-6.7 8.5-6.7Z" />
      <circle cx="8.6" cy="10.6" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.6" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.4" cy="10.6" r="1" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'contact'">
      <rect x="2.75" y="4.75" width="18.5" height="14.5" rx="3" />
      <circle cx="8.6" cy="10.3" r="2" />
      <path d="M5.6 15.9c.4-1.6 1.5-2.4 3-2.4s2.6.8 3 2.4" />
      <path d="M14.75 9.5h3.75M14.75 13h3.75" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="m7 7 10 10M17 7 7 17" />
    </template>
    <template v-else-if="name === 'edit'">
      <path d="m4.9 19.1.9-3.9L15.9 5.1a2.05 2.05 0 0 1 2.9 0l.1.1a2.05 2.05 0 0 1 0 2.9L8.8 18.2l-3.9.9Z" />
      <path d="m13.9 7.1 3 3" />
    </template>
    <template v-else-if="name === 'flag'">
      <path d="M5.5 21V3.75" />
      <path d="M5.5 4.6c2.2-1.2 4.3-1.2 6.5 0s4.3 1.2 6.5 0v7.9c-2.2 1.2-4.3 1.2-6.5 0s-4.3-1.2-6.5 0Z" />
    </template>
    <template v-else-if="name === 'guide'">
      <path d="M20.1 3.9 13 20.3c-.3.7-1.3.6-1.5-.1l-1.6-6.2-6.2-1.6c-.7-.2-.8-1.2-.1-1.5Z" />
      <path d="M20.1 3.9 9.9 14.1" />
    </template>
    <template v-else-if="name === 'location'">
      <path d="M12 21.25S5 15.2 5 10a7 7 0 0 1 14 0c0 5.2-7 11.25-7 11.25Z" />
      <circle cx="12" cy="10" r="2.4" />
    </template>
    <template v-else-if="name === 'notes'">
      <rect x="4.75" y="3.25" width="14.5" height="17.5" rx="3" />
      <path d="M8.5 8.25h7M8.5 12h7M8.5 15.75h4" />
      <circle cx="15.2" cy="15.75" r="1.05" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5.25v13.5M5.25 12h13.5" />
    </template>
    <template v-else-if="name === 'refresh'">
      <path d="M19.5 12a7.5 7.5 0 1 1-7.5-7.5c2.1 0 4.1.8 5.6 2.3l1.9 1.9" />
      <path d="M19.5 4.5v4.2h-4.2" />
    </template>
    <template v-else-if="name === 'check'">
      <path d="m4.75 12.5 4.75 4.75L19.25 7" />
    </template>
    <template v-else-if="name === 'home'">
      <path d="m3.9 10.6 8.1-7 8.1 7" />
      <path d="M5.9 9v8.25A2.75 2.75 0 0 0 8.65 20h6.7a2.75 2.75 0 0 0 2.75-2.75V9" />
      <path d="M10.2 20v-3.2a1.8 1.8 0 0 1 3.6 0V20" />
    </template>
    <template v-else-if="name === 'users'">
      <circle cx="9" cy="8.5" r="3.1" />
      <path d="M3.4 19.5c.6-3.6 2.8-5.4 5.6-5.4s5 1.8 5.6 5.4" />
      <path d="M15.4 5.9a3.1 3.1 0 0 1 0 5.2" />
      <path d="M17.5 14.6c1.9.7 3 2.3 3.4 4.9" />
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
