<script setup lang="ts">
import { computed } from 'vue'

import type { Course } from '@/types/course'
import { formatCourseLocation } from '@/utils/course'
import { getWeekdayLabel } from '@/utils/course'

const props = withDefaults(
  defineProps<{
    course: Course
    compact?: boolean
    disabled?: boolean
  }>(),
  {
    compact: false,
    disabled: false
  }
)

const emit = defineEmits<{
  select: [courseId: number]
  edit: [courseId: number]
}>()

const fullLocation = computed(() => formatCourseLocation(props.course))
const sourceLabel = computed(() =>
  props.course.source_kind === 'import' ? '导入课程' : '手动添加'
)
</script>

<template>
  <article
    class="course-card"
    :class="{
      'course-card--compact': compact,
      'course-card--review': course.needs_location_review,
      'course-card--disabled': disabled
    }"
  >
    <button
      type="button"
      class="course-card__main"
      :disabled="disabled"
      @click="emit('select', course.id)"
    >
      <span class="course-card__heading">
        <span>
          <small>{{ getWeekdayLabel(course.weekday) }} · {{ course.start_time }}</small>
          <strong>{{ course.course_name }}</strong>
        </span>
        <time>{{ course.start_time }}—{{ course.end_time }}</time>
      </span>

      <span
        class="course-card__location"
        data-testid="course-location"
        :title="fullLocation"
      >
        <span class="course-card__pin" aria-hidden="true">⌖</span>
        <span>{{ fullLocation }}</span>
      </span>

      <span class="course-card__meta">
        <span>{{ course.weeks }}</span>
        <span v-if="course.teacher">{{ course.teacher }}</span>
        <span>{{ sourceLabel }}</span>
      </span>
    </button>

    <footer v-if="course.needs_location_review" class="course-card__review" role="status">
      <span><i aria-hidden="true">!</i> 地点需修正</span>
      <button
        type="button"
        data-testid="repair-location"
        :disabled="disabled"
        @click="emit('edit', course.id)"
      >
        补全地点
      </button>
    </footer>
  </article>
</template>

<style scoped>
.course-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #dce7da;
  border-radius: 20px 20px 16px 20px;
  background: #fffdf8;
  box-shadow: 0 10px 24px rgba(56, 79, 58, 0.08);
  transition:
    transform 360ms cubic-bezier(.2, .8, .2, 1),
    box-shadow 360ms cubic-bezier(.2, .8, .2, 1),
    border-color 360ms ease;
}

.course-card__main {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 11px;
  border: 0;
  background: transparent;
  color: #314236;
  cursor: pointer;
  padding: 15px;
  text-align: left;
}

.course-card__heading {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.course-card__heading > span {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.course-card__heading small {
  color: #66736a;
  font-size: 12px;
  line-height: 1.4;
}

.course-card__heading strong {
  color: #26392d;
  font-size: 16px;
  line-height: 1.38;
  overflow-wrap: anywhere;
}

.course-card__heading time {
  flex: 0 0 auto;
  border-radius: 10px;
  background: #edf3e8;
  color: #485a4c;
  font-size: 12px;
  font-weight: 720;
  padding: 6px 8px;
}

.course-card__location {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 7px;
  color: #375d42;
  font-size: 14px;
  font-weight: 750;
  line-height: 1.65;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.course-card__pin {
  display: grid;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 50%;
  background: #e4efdd;
  color: #50745a;
  font-size: 14px;
}

.course-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.course-card__meta > span {
  border-radius: 999px;
  background: #f4f1e7;
  color: #59645c;
  font-size: 12px;
  line-height: 1.35;
  padding: 5px 8px;
  overflow-wrap: anywhere;
}

.course-card__review {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid #edc9bd;
  background: #fff0ea;
  color: #873d31;
  padding: 10px 14px;
}

.course-card__review > span {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 800;
}

.course-card__review i {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 50%;
  background: #a64f40;
  color: #fff;
  font-style: normal;
}

.course-card__review button {
  min-height: 36px;
  border: 1px solid #a64f40;
  border-radius: 999px;
  background: #fffaf7;
  color: #77372e;
  cursor: pointer;
  font-size: 13px;
  font-weight: 800;
  padding: 7px 12px;
}

.course-card--review { border-color: #e2a997; }
.course-card--disabled { filter: grayscale(.35); opacity: .72; }

.course-card--compact .course-card__main {
  gap: 8px;
  padding: 11px;
}

.course-card--compact .course-card__heading time { display: none; }
.course-card--compact .course-card__heading strong { font-size: 14px; }
.course-card--compact .course-card__location { font-size: 12px; line-height: 1.5; }
.course-card--compact .course-card__meta > span { font-size: 11px; }

@media (hover: hover) and (pointer: fine) {
  .course-card:hover {
    border-color: #bfd1bb;
    box-shadow: 0 15px 32px rgba(56, 79, 58, 0.13);
    transform: translateY(-3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .course-card { transition: none; }
}
</style>
