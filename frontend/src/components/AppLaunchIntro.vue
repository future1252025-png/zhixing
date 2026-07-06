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
      translateY: [10, 0],
      opacity: [0, 1],
      delay: stagger(70),
      duration: 320
    })
    .add('.launch-route-path', {
      strokeDashoffset: [240, 0],
      opacity: [0, 1],
      duration: 620
    }, '-=110')
    .add('.launch-stop', {
      scale: [0.4, 1],
      opacity: [0, 1],
      delay: stagger(95),
      duration: 300
    }, '-=430')
    .add('.launch-copy > *', {
      translateY: [8, 0],
      opacity: [0, 1],
      delay: stagger(58),
      duration: 280
    }, '-=230')
    .add(rootElement, { opacity: [1, 0], duration: 260 }, '+=180')

  fallbackTimer = window.setTimeout(finishIntro, 1300)
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
    linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px) 0 0 / 28px 28px,
    linear-gradient(180deg, #11383a 0%, #092525 100%);
  color: #fff;
  will-change: opacity;
}

.launch-stage {
  width: min(86vw, 350px);
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
  border: 1px solid rgba(255, 255, 255, 0.38);
  border-radius: 8px;
  background: #0b766f;
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
  stroke: #62c8ba;
  stroke-dasharray: 240;
  stroke-linecap: round;
  stroke-width: 6;
  filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.2));
}

.launch-stop {
  fill: #11383a;
  opacity: 0;
  stroke: #fff;
  stroke-width: 5;
  transform-box: fill-box;
  transform-origin: center;
}

.launch-stop.middle {
  fill: #2b6fbe;
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
  color: #bcd1ce;
  font-size: 13px;
}
</style>
