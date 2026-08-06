<script setup lang="ts">
import { computed } from 'vue'

import type { Building } from '@/api/buildings'
import BuildingPicker from '@/components/BuildingPicker.vue'
import type {
  ImportCandidate,
  ImportIssue,
  ImportResolutionDraft
} from '@/types/courseImport'

const props = withDefaults(
  defineProps<{
    candidate: ImportCandidate
    buildings: Building[]
    resolution: ImportResolutionDraft
    index: number
    serverIssues?: ImportIssue[]
    highlighted?: boolean
  }>(),
  {
    serverIssues: () => [],
    highlighted: false
  }
)

const emit = defineEmits<{
  'update:resolution': [resolution: ImportResolutionDraft]
}>()

const activeCandidateIssues = computed(() =>
  props.candidate.errors.filter((issue) => {
    if (issue.code === 'building_unrecognized') return !props.resolution.building_id
    if (issue.code === 'room_missing') return !props.resolution.room_name.trim()
    return true
  })
)
const allIssues = computed(() => [...activeCandidateIssues.value, ...props.serverIssues])
const statusLabel = computed(() => {
  if (props.highlighted || props.serverIssues.length) return '服务端需处理'
  if (allIssues.value.length || !props.resolution.building_id || !props.resolution.room_name.trim()) {
    return '需处理'
  }
  return '映射已完整'
})

function issuesFor(field: string): ImportIssue[] {
  return allIssues.value.filter((issue) => issue.field === field || issue.field === 'course')
}

function updateBuilding(value: number | null) {
  emit('update:resolution', {
    ...props.resolution,
    building_id: Number.isInteger(value) && Number(value) > 0 ? value : null
  })
}

function updateRoom(event: Event) {
  emit('update:resolution', {
    ...props.resolution,
    room_name: (event.target as HTMLInputElement).value
  })
}
</script>

<template>
  <article
    :id="`import-${candidate.row_ref}`"
    class="candidate-card"
    :class="{ 'is-highlighted': highlighted, 'has-issues': allIssues.length }"
    :data-row-ref="candidate.row_ref"
  >
    <header class="candidate-heading">
      <span class="candidate-index">{{ String(index + 1).padStart(2, '0') }}</span>
      <span>
        <small>文件行 {{ candidate.row_ref }}</small>
        <strong>{{ candidate.course_name || candidate.source.raw_course_name || '未识别课程名' }}</strong>
      </span>
      <b :class="{ ready: statusLabel === '映射已完整' }">
        <i aria-hidden="true">{{ statusLabel === '映射已完整' ? '✓' : '!' }}</i>
        {{ statusLabel }}
      </b>
    </header>

    <section class="source-panel" aria-label="文件原文">
      <div class="panel-title">
        <span>文件原文</span>
        <small>只读 · 不会修改</small>
      </div>
      <dl>
        <div>
          <dt>课程</dt>
          <dd class="source-value" data-testid="raw-course-name">{{ candidate.source.raw_course_name || '（空）' }}</dd>
        </div>
        <div>
          <dt>星期</dt>
          <dd class="source-value" data-testid="raw-weekday">{{ candidate.source.raw_weekday || '（空）' }}</dd>
        </div>
        <div>
          <dt>时间 / 节次</dt>
          <dd class="source-value" data-testid="raw-time-or-section">{{ candidate.source.raw_time_or_section || '（空）' }}</dd>
        </div>
        <div>
          <dt>教师</dt>
          <dd class="source-value" data-testid="raw-teacher">{{ candidate.source.raw_teacher || '（空）' }}</dd>
        </div>
        <div>
          <dt>周次</dt>
          <dd class="source-value" data-testid="raw-weeks">{{ candidate.source.raw_weeks || '（空）' }}</dd>
        </div>
        <div class="source-location-row">
          <dt>地点</dt>
          <dd class="source-value" data-testid="raw-location">{{ candidate.source.raw_location || '（空）' }}</dd>
        </div>
      </dl>
    </section>

    <section class="parsed-panel" aria-label="系统识别结果">
      <span>系统识别</span>
      <p>
        <b>{{ candidate.weekday ? `星期${'一二三四五六日'[candidate.weekday - 1]}` : '星期未识别' }}</b>
        <b>{{ candidate.start_time && candidate.end_time ? `${candidate.start_time}—${candidate.end_time}` : '时间未识别' }}</b>
        <b>{{ candidate.weeks || '周次未识别' }}</b>
      </p>
      <ul v-if="issuesFor('course_name').length || issuesFor('weekday').length || issuesFor('start_time').length || issuesFor('weeks').length" class="issue-list">
        <li
          v-for="issue in allIssues.filter((item) => ['course_name', 'weekday', 'start_time', 'end_time', 'weeks', 'course'].includes(item.field))"
          :key="`${issue.code}-${issue.field}`"
        >
          <i aria-hidden="true">!</i> {{ issue.message }}
        </li>
      </ul>
    </section>

    <fieldset class="mapping-panel">
      <legend>执行映射</legend>
      <p>这里只决定课程保存到哪个建筑与教室，不会改动上面的文件原文。</p>

      <label>
        <span>上课建筑 <em>必填</em></span>
        <BuildingPicker
          :model-value="resolution.building_id"
          :buildings="buildings"
          placeholder="请选择建筑"
          @update:model-value="updateBuilding"
        />
        <small v-if="candidate.suggested_building_name">
          文件地点建议：{{ candidate.suggested_building_name }}
        </small>
        <ul v-if="issuesFor('building_id').length" class="issue-list">
          <li v-for="issue in issuesFor('building_id')" :key="issue.code">
            <i aria-hidden="true">!</i> {{ issue.message }}
          </li>
        </ul>
      </label>

      <label>
        <span>完整教室 <em>必填</em></span>
        <input
          name="room_name"
          type="text"
          maxlength="120"
          :value="resolution.room_name"
          placeholder="按文件填写完整教室，不要省略楼层或房间名"
          @input="updateRoom"
        />
        <small>{{ resolution.room_name.length }}/120 字</small>
        <ul v-if="issuesFor('room_name').length" class="issue-list">
          <li v-for="issue in issuesFor('room_name')" :key="issue.code">
            <i aria-hidden="true">!</i> {{ issue.message }}
          </li>
        </ul>
      </label>
    </fieldset>
  </article>
</template>

<style scoped>
.candidate-card {
  display: grid;
  min-width: 0;
  gap: 14px;
  border: 1px solid var(--fresh-line);
  border-radius: var(--radius-lg) var(--radius-lg) 20px var(--radius-lg);
  background: var(--fresh-paper);
  box-shadow: 0 16px 38px rgba(59, 79, 57, .08);
  padding: 17px;
  scroll-margin-top: 18px;
  transition: border-color 420ms ease, box-shadow 420ms ease, transform 420ms cubic-bezier(.2,.8,.2,1);
}

.candidate-card.has-issues { border-color: #e2c59a; }
.candidate-card.is-highlighted {
  border-color: var(--cm-red);
  box-shadow: 0 0 0 4px rgba(180, 93, 78, .13), 0 18px 42px rgba(82, 58, 51, .12);
  transform: translateY(-2px);
}

.candidate-heading {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.candidate-index {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 50% 50% 42% 50%;
  background: var(--fresh-mint);
  color: #4e7053;
  font-family: ui-monospace, monospace;
  font-size: 13px;
  font-weight: 800;
}

.candidate-heading > span:nth-child(2) { display: grid; min-width: 0; gap: 2px; }
.candidate-heading small { color: var(--fresh-muted); font-size: 12px; }
.candidate-heading strong { color: var(--fresh-ink); font-size: 17px; overflow-wrap: anywhere; }
.candidate-heading > b {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: var(--radius-pill);
  background: var(--cm-amber-soft);
  color: #80551e;
  font-size: 12px;
  padding: 7px 9px;
}
.candidate-heading > b.ready { background: var(--fresh-mint); color: var(--fresh-green-dark); }
.candidate-heading > b i { font-style: normal; }

.source-panel {
  overflow: hidden;
  border: 1px solid #e5e3d8;
  border-radius: var(--radius-md);
  background: #faf8f1;
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px dashed #d9d6ca;
  padding: 10px 12px;
}
.panel-title span { color: #48554b; font-size: 13px; font-weight: 800; }
.panel-title small { color: var(--fresh-muted); font-size: 12px; }
.source-panel dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; }
.source-panel dl > div { min-width: 0; border-bottom: 1px solid #ebe8de; padding: 10px 12px; }
.source-panel dl > div:nth-child(odd) { border-right: 1px solid #ebe8de; }
.source-panel dl > div:nth-last-child(-n + 2) { border-bottom: 0; }
.source-panel dt { color: var(--fresh-muted); font-size: 11px; }
.source-value {
  margin: 3px 0 0;
  color: var(--fresh-ink);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.55;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.source-location-row { background: #f4f3ea; }

.parsed-panel {
  border-radius: 16px;
  background: var(--fresh-mint);
  padding: 11px 12px;
}
.parsed-panel > span { color: var(--fresh-muted); font-size: 12px; font-weight: 800; }
.parsed-panel p { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; }
.parsed-panel p b { border-radius: var(--radius-pill); background: var(--fresh-paper); color: #47594b; font-size: 12px; padding: 5px 8px; }

.mapping-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  min-width: 0;
  margin: 0;
  border: 1px solid var(--fresh-line-strong);
  border-radius: var(--radius-md);
  background: var(--fresh-paper-2);
  padding: 12px;
}
.mapping-panel legend { color: var(--fresh-green-dark); font-size: 14px; font-weight: 850; padding: 0 7px; }
.mapping-panel > p { grid-column: 1 / -1; margin: -3px 0 0; color: var(--fresh-muted); font-size: 12px; line-height: 1.55; }
.mapping-panel > label { display: grid; min-width: 0; align-content: start; gap: 7px; }
.mapping-panel label > span { color: #46564a; font-size: 13px; font-weight: 800; }
.mapping-panel em { color: #934b40; font-size: 11px; font-style: normal; }
.mapping-panel input {
  width: 100%;
  min-height: 46px;
  border: 1px solid var(--fresh-line-strong);
  border-radius: 12px;
  background: var(--fresh-paper);
  color: var(--fresh-ink);
  font: inherit;
  font-size: 16px;
  outline: none;
  padding: 0 11px;
}
.mapping-panel input:focus { border-color: #668e6b; box-shadow: 0 0 0 3px rgba(102,142,107,.13); }
.mapping-panel label > small { color: var(--fresh-muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.issue-list { display: grid; gap: 5px; margin: 7px 0 0; padding: 0; list-style: none; }
.issue-list li { display: flex; align-items: flex-start; gap: 6px; color: #833e34; font-size: 12px; line-height: 1.5; }
.issue-list i { display: grid; width: 17px; height: 17px; flex: 0 0 auto; place-items: center; border-radius: 50%; background: var(--cm-red); color: #fff; font-size: 11px; font-style: normal; font-weight: 900; }

@media (max-width: 560px) {
  .candidate-heading { grid-template-columns: auto minmax(0, 1fr); }
  .candidate-heading > b { grid-column: 1 / -1; justify-self: start; }
  .source-panel dl,
  .mapping-panel { grid-template-columns: 1fr; }
  .source-panel dl > div { border-right: 0 !important; border-bottom: 1px solid #ebe8de !important; }
  .source-panel dl > div:last-child { border-bottom: 0 !important; }
}

@media (prefers-reduced-motion: reduce) {
  .candidate-card { transition: none; }
}
</style>
