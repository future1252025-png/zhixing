<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import type { SemesterState, SemesterUpdate } from '@/types/semester'

const props = defineProps<{
  semester: SemesterState | null
  saving: boolean
}>()

const emit = defineEmits<{
  save: [payload: SemesterUpdate]
}>()

const editing = ref(!props.semester || props.semester.status === 'unconfigured')
const form = reactive({
  start_date: props.semester?.start_date ?? '',
  total_weeks: props.semester?.total_weeks ?? 20
})
const validationMessage = ref('')

const statusMessage = computed(() => {
  const semester = props.semester
  if (!semester || semester.status === 'unconfigured') {
    return '尚未设置学期，首页与出发建议暂不可用'
  }
  if (semester.status === 'active' && semester.current_week !== null) {
    return `真实当前周：第 ${semester.current_week} 周`
  }
  if (semester.status === 'before_term') return '学期尚未开始'
  return '本学期已结束'
})

function restoreForm(): void {
  form.start_date = props.semester?.start_date ?? ''
  form.total_weeks = props.semester?.total_weeks ?? 20
  validationMessage.value = ''
}

function isMonday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1
}

function validateStartDate(): boolean {
  if (!form.start_date) {
    validationMessage.value = '请选择学期开始日期'
    return false
  }
  if (!isMonday(form.start_date)) {
    validationMessage.value = '学期开始日期必须是周一'
    return false
  }
  validationMessage.value = ''
  return true
}

function handleSubmit(): void {
  if (!validateStartDate()) return
  const totalWeeks = Number(form.total_weeks)
  if (!Number.isInteger(totalWeeks) || totalWeeks < 1 || totalWeeks > 30) {
    validationMessage.value = '学期总周数必须在 1 到 30 之间'
    return
  }
  emit('save', { start_date: form.start_date, total_weeks: totalWeeks })
}

function startEditing(): void {
  restoreForm()
  editing.value = true
}

function cancelEditing(): void {
  restoreForm()
  editing.value = false
}

watch(
  () => props.semester,
  (semester) => {
    restoreForm()
    editing.value = !semester || semester.status === 'unconfigured'
  }
)
</script>

<template>
  <section id="semester-settings" class="semester-card fresh-card" aria-labelledby="semester-title">
    <header>
      <div>
        <span>教学周基准</span>
        <h2 id="semester-title">学期设置</h2>
      </div>
      <button
        v-if="semester && semester.status !== 'unconfigured' && !editing"
        data-testid="edit-semester"
        type="button"
        @click="startEditing"
      >
        修改
      </button>
    </header>

    <p class="semester-status" :class="`is-${semester?.status ?? 'unconfigured'}`">
      <i aria-hidden="true"></i>
      <strong>{{ statusMessage }}</strong>
    </p>

    <dl v-if="semester?.start_date && semester.total_weeks && !editing" class="semester-facts">
      <div><dt>开始日期</dt><dd>{{ semester.start_date }}</dd></div>
      <div><dt>学期长度</dt><dd>{{ semester.total_weeks }} 周</dd></div>
    </dl>

    <form v-if="editing" class="semester-form" @submit.prevent="handleSubmit">
      <label>
        <span>第一周周一</span>
        <input
          v-model="form.start_date"
          name="start_date"
          type="date"
          required
          @change="validateStartDate"
        />
      </label>
      <label>
        <span>学期总周数</span>
        <input
          v-model.number="form.total_weeks"
          name="total_weeks"
          type="number"
          min="1"
          max="30"
          inputmode="numeric"
          required
        />
      </label>
      <p v-if="validationMessage" class="semester-error" role="alert">
        {{ validationMessage }}
      </p>
      <div class="semester-form__actions">
        <button
          v-if="semester && semester.status !== 'unconfigured'"
          class="semester-cancel"
          type="button"
          :disabled="saving"
          @click="cancelEditing"
        >
          取消
        </button>
        <button class="semester-save" :disabled="saving" type="submit">
          <span class="semester-save__label">
            {{ saving ? '正在保存' : '保存学期设置' }}
          </span>
          <span v-if="saving" class="semester-save__spinner" aria-hidden="true"></span>
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.semester-card {
  display: grid;
  gap: 14px;
  padding: 18px;
  scroll-margin-top: 12px;
}

.semester-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.semester-card header span {
  color: var(--fresh-muted);
  font-size: 12px;
  font-weight: 600;
}

.semester-card h2 {
  margin: 3px 0 0;
  color: var(--fresh-ink);
  font-size: 20px;
}

.semester-card header button,
.semester-cancel {
  min-height: 42px;
  border: 1px solid var(--fresh-line);
  border-radius: 13px;
  background: var(--fresh-paper);
  color: var(--fresh-green-dark);
  font-weight: 700;
  padding: 0 15px;
}

.semester-status {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 10px;
  margin: 0;
  border-radius: 15px;
  background: var(--fresh-mint);
  color: #355b3d;
  font-size: 14px;
  line-height: 1.55;
  padding: 10px 13px;
}

.semester-status i {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #5d8d65;
  box-shadow: 0 0 0 5px rgba(93, 141, 101, 0.13);
}

.semester-status.is-unconfigured,
.semester-status.is-after_term {
  background: var(--cm-amber-soft);
  color: #74501d;
}

.semester-status.is-unconfigured i,
.semester-status.is-after_term i {
  background: #b27624;
  box-shadow: 0 0 0 5px rgba(178, 118, 36, 0.13);
}

.semester-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  margin: 0;
}

.semester-facts div {
  border: 1px solid var(--fresh-line);
  border-radius: var(--radius-sm);
  background: var(--fresh-paper-2);
  padding: 11px 12px;
}

.semester-facts dt {
  color: var(--fresh-muted);
  font-size: 12px;
}

.semester-facts dd {
  margin: 4px 0 0;
  color: var(--fresh-ink);
  font-size: 14px;
  font-weight: 700;
}

.semester-form {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(120px, .6fr);
  gap: 11px;
}

.semester-form label {
  display: grid;
  gap: 6px;
  color: var(--fresh-text);
  font-size: 12px;
  font-weight: 700;
}

.semester-form input {
  width: 100%;
  min-height: 46px;
  box-sizing: border-box;
  border: 1px solid var(--fresh-line-strong);
  border-radius: 13px;
  outline: none;
  background: var(--fresh-paper);
  color: var(--fresh-ink);
  font: inherit;
  font-size: 16px;
  padding: 0 12px;
}

.semester-form input:focus {
  border-color: #628c69;
  box-shadow: 0 0 0 3px rgba(98, 140, 105, .14);
}

.semester-error {
  grid-column: 1 / -1;
  margin: 0;
  border-radius: 12px;
  background: var(--cm-red-soft);
  color: #8f3f35;
  font-size: 13px;
  font-weight: 600;
  padding: 9px 11px;
}

.semester-form__actions {
  display: flex;
  grid-column: 1 / -1;
  justify-content: flex-end;
  gap: 9px;
}

.semester-save {
  display: inline-grid;
  min-width: 164px;
  min-height: 46px;
  grid-template-columns: minmax(0, 1fr) 18px;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--fresh-green);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  padding: 0 14px;
}

.semester-save__label {
  grid-column: 1;
  text-align: center;
}

.semester-save__spinner {
  width: 14px;
  height: 14px;
  grid-column: 2;
  border: 2px solid rgba(255, 255, 255, .42);
  border-top-color: #fff;
  border-radius: 50%;
  animation: semester-spin 900ms linear infinite;
}

.semester-save:disabled,
.semester-cancel:disabled {
  cursor: wait;
  opacity: .76;
}

@keyframes semester-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 460px) {
  .semester-form { grid-template-columns: 1fr; }
  .semester-form__actions { display: grid; grid-template-columns: 1fr; }
  .semester-save,
  .semester-cancel { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .semester-save__spinner { animation: none; }
}
</style>
