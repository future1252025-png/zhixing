<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { animate, createTimeline, stagger } from 'animejs'

const emit = defineEmits<{ finish: [] }>()
const root = ref<HTMLElement | null>(null)
let timeline: ReturnType<typeof createTimeline> | null = null
let fallbackTimer: number | null = null
let finished = false

function finishIntro() {
  if (finished) {
    return
  }
  finished = true
  emit('finish')
}

onMounted(() => {
  const rootElement = root.value
  if (!rootElement) {
    finishIntro()
    return
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    animate(rootElement, {
      opacity: [1, 0],
      duration: 220,
      ease: 'outQuad',
      onComplete: finishIntro
    })
    fallbackTimer = window.setTimeout(finishIntro, 320)
    return
  }

  timeline = createTimeline({ defaults: { ease: 'outCubic' }, onComplete: finishIntro })
  timeline
    .set('.launch-route-path', { strokeDashoffset: 240 })
    .add('.launch-brand > *', {
      translateY: [14, 0],
      opacity: [0, 1],
      delay: stagger(85),
      duration: 420
    })
    .add('.launch-route-path', {
      strokeDashoffset: [240, 0],
      opacity: [0, 1],
      duration: 760
    }, '-=150')
    .add('.launch-stop', {
      scale: [0.25, 1],
      opacity: [0, 1],
      delay: stagger(110),
      duration: 380
    }, '-=510')
    .add('.launch-copy > *', {
      translateY: [12, 0],
      opacity: [0, 1],
      delay: stagger(72),
      duration: 360
    }, '-=260')
    .add(rootElement, { opacity: [1, 0], scale: [1, 1.012], duration: 420, ease: 'inOutQuad' }, '+=220')

  fallbackTimer = window.setTimeout(finishIntro, 1900)
})

onBeforeUnmount(() => {
  timeline?.revert()
  if (fallbackTimer !== null) {
    window.clearTimeout(fallbackTimer)
  }
})
</script>

<template>
  <section ref="root" class="launch-intro" aria-label="智行启动动画">
    <div class="launch-stage">
      <div class="launch-brand">
        <span>智</span>
        <strong>智行 CampusMind</strong>
      </div>
      <svg viewBox="0 0 320 128" aria-hidden="true">
        <path
          class="launch-route-path"
          d="M24 92 C73 38, 126 98, 168 48 S250 23, 296 55"
          pathLength="240"
        />
        <circle class="launch-stop start" cx="24" cy="92" r="8" />
        <circle class="launch-stop middle" cx="168" cy="48" r="9" />
        <circle class="launch-stop end" cx="296" cy="55" r="8" />
      </svg>
      <div class="launch-copy">
        <strong>正在接入校园路线</strong>
        <span>课表、地图、留言与出发建议已准备好</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.launch-intro {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  background:
    linear-gradient(90deg, rgba(10, 125, 115, 0.07) 1px, transparent 1px) 0 0 / 28px 28px,
    linear-gradient(180deg, #fbfdf9 0%, #edf7f0 58%, #e8f3f1 100%);
  color: #17231f;
  will-change: opacity;
}

.launch-stage {
  width: min(86vw, 350px);
  border: 1px solid rgba(10, 125, 115, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 24px 64px rgba(30, 68, 55, 0.12);
  padding: 22px 20px 20px;
  backdrop-filter: blur(18px);
}

.launch-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.launch-brand > *,
.launch-copy > * {
  opacity: 0;
}

.launch-brand span {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid rgba(7, 86, 79, 0.18);
  border-radius: 8px;
  background: #0a7d73;
  color: #fff;
  box-shadow: 0 10px 24px rgba(10, 125, 115, 0.2);
  font-weight: 800;
}

.launch-brand strong {
  font-size: 16px;
}

.launch-stage svg {
  width: 100%;
  margin: 22px 0 14px;
  overflow: visible;
}

.launch-route-path {
  fill: none;
  stroke: #21a18f;
  stroke-dasharray: 240;
  stroke-linecap: round;
  stroke-width: 6;
  filter: drop-shadow(0 8px 15px rgba(10, 125, 115, 0.2));
}

.launch-stop {
  fill: #0a7d73;
  opacity: 0;
  stroke: #ffffff;
  stroke-width: 5;
  transform-box: fill-box;
  transform-origin: center;
}

.launch-stop.middle {
  fill: #4387c7;
}

.launch-stop.end {
  fill: #f2b84b;
}

.launch-copy {
  display: grid;
  gap: 5px;
  text-align: center;
}

.launch-copy strong {
  font-size: 21px;
}

.launch-copy span {
  color: #6d7c76;
  font-size: 13px;
}
</style>
