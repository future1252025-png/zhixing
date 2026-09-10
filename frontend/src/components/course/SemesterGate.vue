<script setup lang="ts">
import type { SemesterStatus } from '@/types/semester'

defineProps<{
  status: SemesterStatus
  currentWeek?: number | null
}>()
</script>

<template>
  <div v-if="status === 'active'" class="semester-gate__content">
    <slot />
  </div>

  <section v-else class="semester-gate" :data-status="status" role="status">
    <span class="semester-gate__scene" aria-hidden="true">
      <i></i><i></i><i></i>
    </span>

    <template v-if="status === 'unconfigured'">
      <span class="semester-gate__eyebrow">先对齐真实教学周</span>
      <h2>请先设置学期</h2>
      <p>设置开学日期和总周数后，首页与课程提醒才会使用同一个真实教学周。</p>
      <RouterLink to="/courses#semester-settings">去课表设置学期</RouterLink>
    </template>

    <slot v-else-if="status === 'before_term'" name="before-term">
      <span class="semester-gate__eyebrow">课程还没开始</span>
      <h2>学期尚未开始</h2>
      <p>现在不会提前套用第 1 周课程。开学后会自动切换到真实教学周。</p>
      <RouterLink to="/courses#semester-settings">检查学期设置</RouterLink>
    </slot>

    <slot v-else name="after-term">
      <span class="semester-gate__eyebrow">这一学期走完了</span>
      <h2>本学期已结束</h2>
      <p>当前日期已超过教学周范围，可以在课表页设置新学期。</p>
      <RouterLink to="/courses#semester-settings">设置新学期</RouterLink>
    </slot>
  </section>
</template>

<style scoped>
.semester-gate__content { display: contents; }

.semester-gate {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--fresh-line);
  border-radius: 28px 28px 21px 28px;
  background: var(--fresh-paper);
  box-shadow: 0 14px 34px rgba(55, 78, 57, .08);
  color: var(--fresh-ink);
  padding: 24px 116px 24px 20px;
}

.semester-gate__eyebrow {
  color: #4e7557;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .04em;
}

.semester-gate h2 {
  margin: 7px 0 0;
  color: var(--fresh-ink);
  font-size: 22px;
  line-height: 1.35;
}

.semester-gate p {
  max-width: 430px;
  margin: 8px 0 16px;
  color: var(--fresh-text);
  font-size: 13px;
  line-height: 1.75;
}

.semester-gate a {
  position: relative;
  z-index: 1;
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  border-radius: var(--radius-pill);
  background: var(--fresh-green);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  padding: 0 17px;
  text-decoration: none;
}

.semester-gate__scene {
  position: absolute;
  right: 18px;
  bottom: 22px;
  width: 78px;
  height: 74px;
  pointer-events: none;
}

.semester-gate__scene::before {
  position: absolute;
  right: 5px;
  bottom: 0;
  width: 68px;
  height: 35px;
  border-radius: 50%;
  background: #e5efdf;
  content: '';
}

.semester-gate__scene i {
  position: absolute;
  z-index: 1;
  bottom: 18px;
  width: 21px;
  height: 40px;
  border-radius: 100% 0 100% 0;
  background: #91b08d;
  transform-origin: bottom center;
  animation: semester-leaf 2.8s ease-in-out infinite alternate;
}

.semester-gate__scene i:nth-child(1) { left: 8px; transform: rotate(-28deg); }
.semester-gate__scene i:nth-child(2) { left: 31px; height: 51px; animation-delay: 180ms; }
.semester-gate__scene i:nth-child(3) { right: 3px; transform: rotate(31deg); animation-delay: 360ms; }

@keyframes semester-leaf {
  from { translate: 0 2px; rotate: -2deg; }
  to { translate: 0 -3px; rotate: 3deg; }
}

@media (max-width: 390px) {
  .semester-gate { padding-right: 92px; }
  .semester-gate__scene { right: 8px; transform: scale(.82); transform-origin: right bottom; }
}

@media (prefers-reduced-motion: reduce) {
  .semester-gate__scene i { animation: none; }
}
</style>
