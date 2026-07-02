<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { animate, createTimeline, stagger } from 'animejs'

import type { LoginIntroSnapshot } from '@/utils/loginIntro'

const props = withDefaults(defineProps<{
  snapshot?: LoginIntroSnapshot | null
}>(), {
  snapshot: null
})
const emit = defineEmits<{ handoff: []; finish: [] }>()
const root = ref<HTMLElement | null>(null)
let timeline: ReturnType<typeof createTimeline> | null = null
let fallbackTimer: number | null = null
let handoffTimer: number | null = null
let handoffStarted = false
let finished = false

const ticketTitle = computed(() => props.snapshot?.courseName ?? '今日路线已接通')
const ticketMeta = computed(() => {
  if (!props.snapshot) {
    return '课表 · 地图 · 出发建议'
  }
  return `${props.snapshot.startTime} · ${props.snapshot.buildingName} ${props.snapshot.roomName}`
})

function startHomeHandoff() {
  if (handoffStarted) return
  handoffStarted = true
  emit('handoff')
}

function finishIntro() {
  if (finished) return
  startHomeHandoff()
  finished = true
  emit('finish')
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    startHomeHandoff()
    fallbackTimer = window.setTimeout(finishIntro, 260)
    return
  }
  const rootElement = root.value
  if (!rootElement) return finishIntro()

  timeline = createTimeline({ defaults: { ease: 'outCubic' }, onComplete: finishIntro })
  timeline
    .set('.intro-route', { strokeDashoffset: 280 })
    .add('.intro-brand', { translateY: [10, 0], opacity: [0, 1], duration: 360 })
    .add('.intro-route', { strokeDashoffset: [280, 0], opacity: [0, 1], duration: 900 }, '-=120')
    .add('.intro-node', { scale: [0.45, 1], opacity: [0, 1], delay: stagger(130), duration: 430 }, '-=620')
    .add('.intro-ticket', { translateY: [18, 0], opacity: [0, 1], duration: 480 }, '-=230')
    .add('.intro-copy > *', { translateY: [9, 0], opacity: [0, 1], delay: stagger(65), duration: 380 }, '-=300')
    .add(rootElement, { opacity: [1, 0], duration: 470 }, '+=260')

  handoffTimer = window.setTimeout(startHomeHandoff, 1480)
  fallbackTimer = window.setTimeout(finishIntro, 2350)
})

onBeforeUnmount(() => {
  timeline?.revert()
  if (fallbackTimer !== null) window.clearTimeout(fallbackTimer)
  if (handoffTimer !== null) window.clearTimeout(handoffTimer)
})
</script>

<template>
  <section ref="root" class="login-intro" aria-label="登录完成动画">
    <div class="intro-stage">
      <div class="intro-brand"><span>智</span><strong>智行 CampusMind</strong></div>
      <svg viewBox="0 0 320 170" role="img" aria-label="校园路线已连接">
        <path class="intro-route" d="M28 128 C78 65, 126 112, 171 58 S257 34, 294 57" pathLength="280" />
        <circle class="intro-node start" cx="28" cy="128" r="9" />
        <circle class="intro-node mid" cx="171" cy="58" r="10" />
        <circle class="intro-node end" cx="294" cy="57" r="9" />
      </svg>
      <article class="intro-ticket">
        <span>下一节课</span><strong>{{ ticketTitle }}</strong><small>{{ ticketMeta }}</small>
      </article>
      <div class="intro-copy"><strong>欢迎回来</strong><span>正在打开今天的校园路线</span></div>
    </div>
  </section>
</template>

<style scoped>
.login-intro { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; background: #11383a; color: #fff; will-change: opacity; }
.intro-stage { width: min(88vw, 360px); }
.intro-brand { display: flex; align-items: center; gap: 10px; opacity: 0; }
.intro-brand span { display: grid; width: 38px; height: 38px; place-items: center; border: 1px solid rgba(255,255,255,.35); border-radius: 8px; background: #0b766f; font-weight: 800; }
.intro-brand strong { font-size: 15px; }
.intro-stage svg { width: 100%; margin: 18px 0 4px; overflow: visible; }
.intro-route { fill: none; stroke: #62c8ba; stroke-width: 6; stroke-linecap: round; stroke-dasharray: 280; filter: drop-shadow(0 8px 16px rgba(0,0,0,.18)); }
.intro-node { fill: #11383a; stroke: #fff; stroke-width: 5; transform-box: fill-box; transform-origin: center; opacity: 0; }
.intro-node.mid { fill: #2b6fbe; }.intro-node.end { fill: #f2b84b; }
.intro-ticket { display: grid; gap: 4px; border-left: 4px solid #f2b84b; border-radius: 0 6px 6px 0; background: #fff; color: #17231f; padding: 13px 15px; opacity: 0; }
.intro-ticket span,.intro-ticket small { color: #6d7c76; font-size: 11px; }.intro-ticket strong { font-size: 18px; }
.intro-copy { display: grid; gap: 4px; margin-top: 22px; text-align: center; }
.intro-copy > * { opacity: 0; }.intro-copy strong { font-size: 22px; }.intro-copy span { color: #bcd1ce; font-size: 13px; }
</style>
