<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import TechIcon from '@/components/TechIcon.vue'
import { useCampusClock } from '@/composables/useCampusClock'
import { useAuthStore } from '@/stores/auth'
import { useCoursesStore } from '@/stores/courses'
import { useSemesterStore } from '@/stores/semester'
import { useRemindersStore } from '@/stores/reminders'
import type { ReminderItem, ReminderMode, ReminderPlan } from '@/types/reminder'
import { campusTime, semesterAt } from '@/utils/campusTime'
import { isCourseActiveInWeek } from '@/utils/course'
import { addCalendarDays, buildReminderOccurrences, customOccurrences, formatReminderAt, nextCustomOccurrence,
  reminderInstant, validateReminder } from '@/utils/reminders'
import { openExactReminderSettings, reminderCapability, testReminderNotification } from '@/services/reminderNotifications'
import { useKeyboardAwarePage } from '@/utils/keyboardInset'

const auth = useAuthStore()
const courses = useCoursesStore()
const semester = useSemesterStore()
const store = useRemindersStore()
const route = useRoute()
const router = useRouter()
const now = useCampusClock()
const editing = ref(false)
const editingId = ref<string | null>(null)
const editingRevision = ref(0)
const formError = ref('')
const permissionBusy = ref(false)
const permissionError = ref('')
const filter = ref<'active' | 'all'>('active')
const editor = ref<HTMLElement | null>(null)
const { pageStyle, onFieldFocus } = useKeyboardAwarePage({ basePaddingPx: 95 })
const modes: { value: ReminderMode; label: string }[] = [
  { value: 'vibrate', label: '震动 + 通知' }, { value: 'sound', label: '声音 + 震动' }, { value: 'silent', label: '静默通知' }
]
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
function newDraft(): ReminderItem {
  const next = campusTime(new Date(Date.now() + 10 * 60_000))
  return { id: crypto.randomUUID(), title: '', note: '', date: next.date,
    time: `${Math.floor(next.minutes / 60).toString().padStart(2, '0')}:${(next.minutes % 60).toString().padStart(2, '0')}`,
    repeat: 'once', weekdays: [next.weekday], end_date: null, mode: 'vibrate', enabled: true, completed_dates: [] }
}
const draft = ref<ReminderItem>(newDraft())
const today = computed(() => campusTime(now.value).date)
const occurrences = computed(() => buildReminderOccurrences(store.plan, courses.courses, semester.semester, today.value))
const upcoming = computed(() => occurrences.value.filter((item) => Date.parse(item.at) > now.value.getTime()))
const nextReminder = computed(() => upcoming.value[0])
const todayCount = computed(() => upcoming.value.filter((item) => campusTime(new Date(item.at)).date === today.value).length)
const pendingCourses = computed(() => {
  const week = semesterAt(semester.semester, now.value).current_week
  const weekday = campusTime(now.value).weekday
  return week ? courses.courses.filter(item => item.weekday === weekday && isCourseActiveInWeek(item.weeks, week)
    && (!item.start_time || !item.end_time || item.end_time <= item.start_time)).length : 0
})
const visibleItems = computed(() => store.plan.items.filter((item) => filter.value === 'all' || Boolean(nextCustomOccurrence(item, now.value))))
const permissionLabel = computed(() => {
  if (store.scheduling) return '正在安排本机通知'
  if (store.scheduleError) return '本机通知需要检查'
  if (!store.deviceEnabled) return '尚未开启本机通知'
  if (store.capability.permission !== 'granted') return '通知权限尚未允许'
  if (store.capability.platform === 'web') return '网页通知已开启'
  return store.capability.exact ? '本机提醒已开启' : '已开启 · 时间可能延迟'
})
const planCopy = (): ReminderPlan => JSON.parse(JSON.stringify(store.plan))
async function savePlan(plan: ReminderPlan) {
  try { await store.save(plan); return true }
  catch { showFailToast(store.error || '保存失败，请稍后重试'); return false }
}
async function refresh() {
  const userId = auth.currentUser?.id
  if (!userId) return
  await store.load(userId, true)
  window.dispatchEvent(new Event('campusmind:sync-reminders'))
}
async function edit(item?: ReminderItem) {
  editingId.value = item?.id ?? null
  editingRevision.value = store.plan.revision
  draft.value = item ? JSON.parse(JSON.stringify(item)) : newDraft()
  if (!item && typeof route.query.title === 'string') draft.value.title = route.query.title.slice(0, 100)
  formError.value = ''
  editing.value = true
  await nextTick()
  editor.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
function repeatChanged() {
  draft.value.end_date = draft.value.repeat === 'once' ? null : addCalendarDays(draft.value.date, 30)
}
function toggleWeekday(day: number) {
  draft.value.weekdays = draft.value.weekdays.includes(day)
    ? draft.value.weekdays.filter((value) => value !== day) : [...draft.value.weekdays, day].sort()
}
async function saveDraft() {
  if (editingRevision.value !== store.plan.revision) {
    formError.value = '提醒已在其他页面或设备更新，请关闭后重新编辑，以免覆盖最新内容'; return
  }
  formError.value = validateReminder(draft.value)
  if (formError.value) return
  if (!editingId.value && !customOccurrences(draft.value).some((item) => Date.parse(item.at) > Date.now())) {
    formError.value = '提醒时间已经过去，请选择未来的时间'; return
  }
  const plan = planCopy()
  const item = { ...draft.value, title: draft.value.title.trim(), note: draft.value.note.trim() }
  const index = plan.items.findIndex((entry) => entry.id === editingId.value)
  if (index >= 0) {
    const original = plan.items[index]!
    if (original.date !== item.date || original.time !== item.time || original.repeat !== item.repeat) item.completed_dates = []
    plan.items[index] = item
  }
  else if (editingId.value) { formError.value = '这条提醒已被其他页面删除，请重新添加'; return }
  else if (plan.items.length >= 100) { formError.value = '最多保存 100 个事项，请先删除不再需要的提醒'; return }
  else plan.items.push(item)
  if (await savePlan(plan)) { editing.value = false; showSuccessToast('已保存') }
}
async function courseSetting(field: 'enabled' | 'lead_minutes' | 'mode', value: boolean | number | ReminderMode) {
  const plan = planCopy()
  plan.course_settings = { ...plan.course_settings, [field]: value }
  await savePlan(plan)
}
async function toggleItem(item: ReminderItem) {
  const plan = planCopy()
  plan.items = plan.items.map((value) => value.id === item.id ? { ...value, enabled: !value.enabled } : value)
  await savePlan(plan)
}
async function removeItem(item: ReminderItem) {
  try { await showConfirmDialog({ title: '删除提醒', message: `删除“${item.title}”并取消它之后的本机通知？`, confirmButtonText: '删除', cancelButtonText: '保留' }) }
  catch { return }
  const plan = planCopy()
  plan.items = plan.items.filter((value) => value.id !== item.id)
  await savePlan(plan)
}
async function finish(item: ReminderItem, snooze = false) {
  const occurrence = nextCustomOccurrence(item, now.value)
  if (!occurrence) return
  const plan = planCopy()
  const target = plan.items.find((value) => value.id === item.id)!
  target.completed_dates = [...new Set([...target.completed_dates, occurrence.date])]
  if (snooze) {
    if (plan.items.length >= 100) { showFailToast('事项已达上限，请先清理已完成的提醒'); return }
    plan.items.push({ ...newDraft(), title: item.title, note: item.note, mode: item.mode })
  }
  await savePlan(plan)
}
async function enableDevice() {
  if (permissionBusy.value) return
  const userId = store.userId
  permissionBusy.value = true
  permissionError.value = ''
  try {
    const capability = await reminderCapability(true)
    if (store.userId !== userId) return
    store.capability = capability
    if (store.capability.permission !== 'granted') {
      permissionError.value = '尚未获得通知权限，请在系统或浏览器设置中允许智行发送通知后重试'
      return
    }
    store.setDeviceEnabled(true)
    window.dispatchEvent(new Event('campusmind:sync-reminders'))
  } catch (error) {
    if (store.userId === userId) permissionError.value = error instanceof Error ? error.message : '无法开启通知，请检查系统权限设置'
  }
  finally { permissionBusy.value = false }
}
async function testNotification() {
  try { await testReminderNotification(); showSuccessToast(store.capability.platform === 'android' ? '5 秒后发送测试提醒' : '已发送测试提醒') }
  catch (error) { showFailToast(error instanceof Error ? error.message : '测试提醒失败') }
}
async function exactSettings() {
  try { await openExactReminderSettings() } catch { showFailToast('请到系统设置 → 智行 → 闹钟和提醒中开启') }
}
function itemStatus(item: ReminderItem): string {
  if (!item.enabled) return '已暂停'
  const occurrence = nextCustomOccurrence(item, now.value)
  if (!occurrence) return item.repeat === 'once' ? '已完成' : '本轮已结束'
  return Date.parse(occurrence.at) < now.value.getTime() ? '已到时间' : '待提醒'
}
onMounted(async () => {
  const userId = auth.currentUser?.id
  // Checking local permissions does not depend on fetching server-side rules.
  void reminderCapability().then(capability => {
    if (auth.currentUser?.id === userId) store.capability = capability
  }).catch(() => { /* status panel retains a safe default */ })
  if (userId) await Promise.allSettled([store.load(userId), courses.ensureLoaded(),
    semester.loadedForUserId === userId ? Promise.resolve() : semester.load(userId)])
  if (typeof route.query.title === 'string') await edit()
})
</script>

<template>
  <section class="page reminders-page">
    <van-nav-bar title="提醒" />
    <main class="page-content reminders-content" :style="pageStyle" @focusin="onFieldFocus">
      <header class="reminder-hero">
        <div><span class="fresh-kicker">给校园日常，留一点从容</span><h1>要紧的事，<br />到点轻轻提醒。</h1>
          <p>上课、开会、交作业……不用一直记在心里。</p></div>
        <div class="bell-art" aria-hidden="true"><TechIcon name="bell" :size="64" /><i></i><b></b></div>
        <footer><span><strong>{{ todayCount }}</strong> 今天待提醒</span><button type="button" class="reminder-primary" :disabled="!store.loaded || store.saving" data-testid="new-reminder" @click="edit()"><TechIcon name="plus" :size="18" />新建提醒</button></footer>
      </header>

      <section class="device-notice" :class="{ ready: store.deviceEnabled && store.capability.permission === 'granted' }" aria-label="本机提醒状态">
        <header><TechIcon name="bell" :size="20" /><strong>{{ permissionLabel }}</strong></header>
        <p v-if="store.capability.platform === 'web'">网页只在打开且浏览器允许运行时提醒；关闭网页、休眠或系统限制可能导致漏提醒。重要事项请使用安卓 App。</p>
        <p v-else>通知由本机系统安排，无需平板持续在线。请允许通知与“闹钟和提醒”；震动、声音仍遵循勿扰和省电设置，强行停止 App 后需重新打开。分项声音/震动模式需 Android 8 及以上，旧系统使用系统默认通知方式。</p>
        <p v-if="store.scheduleError" class="reminder-error" role="alert">{{ store.scheduleError }}</p>
        <p v-if="permissionError" class="reminder-error" role="alert">{{ permissionError }}</p>
        <small v-if="store.deviceEnabled && store.capability.permission === 'granted'">{{ store.capability.platform === 'android' ? '本机已安排' : '网页待提醒' }} {{ store.scheduledCount }} 条<span v-if="store.coverageUntil"> · 最晚 {{ formatReminderAt(store.coverageUntil) }}</span></small>
        <p v-if="store.truncated" class="reminder-error">当前只安排了最近 400 条。后续提醒尚未登记到系统，请在覆盖时间结束前再次打开 App 继续安排。</p>
        <div class="device-actions">
          <button v-if="!store.deviceEnabled || store.capability.permission !== 'granted'" type="button" :disabled="permissionBusy" @click="enableDevice">{{ permissionBusy ? '正在等待授权…' : '开启本机通知' }}</button>
          <button v-else type="button" @click="store.setDeviceEnabled(false)">暂停本机通知</button>
          <button v-if="store.capability.platform === 'android' && !store.capability.exact" type="button" @click="exactSettings">设置准时提醒</button>
          <button type="button" :disabled="!store.deviceEnabled || store.capability.permission !== 'granted'" @click="testNotification">发送测试提醒</button>
          <button type="button" :disabled="store.loading || store.saving" @click="refresh">重新同步</button>
        </div>
        <small>提醒规则随账号同步；每台设备需单独开启通知。其他设备的修改会在本机联网并打开 App 后更新。</small>
      </section>

      <p v-if="store.error" class="reminder-error" role="alert">{{ store.offline ? '暂未连接服务器，显示本机缓存；修改需联网保存。' : '' }}{{ store.error }}</p>
      <p v-if="store.loading && !store.loaded" role="status">正在取回你的提醒…</p>

      <form v-if="editing" ref="editor" class="reminder-editor" aria-label="编辑提醒" @submit.prevent="saveDraft">
        <header><div><span class="fresh-kicker">按你的节奏来</span><h2>{{ editingId ? '编辑提醒' : '添加一件要紧事' }}</h2></div><button type="button" aria-label="关闭提醒编辑" @click="editing = false"><TechIcon name="close" :size="20" /></button></header>
        <fieldset :disabled="store.saving">
          <label class="full">提醒事项<input v-model="draft.title" name="reminder-title" maxlength="100" placeholder="例如：提交算法作业" required /></label>
          <label>{{ draft.repeat === 'once' ? '提醒日期' : '开始日期' }}<input v-model="draft.date" type="date" name="reminder-date" required /></label>
          <label>提醒时间<input v-model="draft.time" type="time" name="reminder-time" step="60" required /><small>北京时间 · 24 小时制</small></label>
          <label>重复方式<select v-model="draft.repeat" name="reminder-repeat" @change="repeatChanged"><option value="once">仅这一次</option><option value="daily">每天</option><option value="weekly">每周指定日期</option></select></label>
          <label>提醒方式<select v-model="draft.mode" name="reminder-mode"><option v-for="mode in modes" :key="mode.value" :value="mode.value">{{ mode.label }}</option></select></label>
          <div v-if="draft.repeat === 'weekly'" class="full weekday-picker" role="group" aria-label="重复星期"><button v-for="(day, index) in weekdays" :key="day" type="button" :aria-label="`星期${day}`" :aria-pressed="draft.weekdays.includes(index + 1)" @click="toggleWeekday(index + 1)">{{ day }}</button></div>
          <label v-if="draft.repeat !== 'once'" class="full">结束日期<input v-model="draft.end_date" type="date" name="reminder-end-date" :min="draft.date" :max="addCalendarDays(draft.date, 366)" required /><small>避免毕业、放假后还在提醒，最多重复一年。</small></label>
          <label class="full">备注（可选）<textarea v-model="draft.note" name="reminder-note" rows="2" maxlength="300" placeholder="地点、需要带的东西，或给自己的小提示" /></label>
        </fieldset>
        <p v-if="formError" class="reminder-error" role="alert">{{ formError }}</p>
        <footer><span>保存事项 ≠ 已开启本机通知，请查看上方状态。</span><button class="reminder-primary" type="submit" :disabled="store.saving">{{ store.saving ? '正在保存…' : '保存提醒' }}</button></footer>
      </form>

      <section class="course-reminder-panel" aria-label="课程提醒设置">
        <header><span class="section-icon"><TechIcon name="calendar" :size="25" /></span><div><h2>课程提醒</h2><p>只提醒今天要上的课。</p></div><button class="reminder-switch" type="button" role="switch" aria-label="课程提醒" :aria-checked="store.plan.course_settings.enabled" :disabled="!store.loaded || store.saving" @click="courseSetting('enabled', !store.plan.course_settings.enabled)"><i></i></button></header>
        <div v-if="store.plan.course_settings.enabled" class="course-reminder-options">
          <label>提前多久<select :value="store.plan.course_settings.lead_minutes" :disabled="store.saving" aria-label="课程提前提醒" @change="courseSetting('lead_minutes', Number(($event.target as HTMLSelectElement).value))"><option :value="0">上课时</option><option v-for="minutes in [5, 10, 15, 20, 30, 60, 120]" :key="minutes" :value="minutes">提前 {{ minutes }} 分钟</option></select></label>
          <label>提醒方式<select :value="store.plan.course_settings.mode" :disabled="store.saving" aria-label="课程提醒方式" @change="courseSetting('mode', ($event.target as HTMLSelectElement).value as ReminderMode)"><option v-for="mode in modes" :key="mode.value" :value="mode.value">{{ mode.label }}</option></select></label>
        </div>
        <p class="panel-tip">仅按北京时间今天的课表、实际上课周次和保存的时间生成，不展示或预排后几天的课程。浏览其他周次不会改变提醒。</p>
        <p class="panel-tip">每天打开一次 App 即可安排当天课程通知；保持打开跨天时会自动切换。若 App 已关闭或被系统冻结，需要再次打开才会安排新一天的课程。自定义事项仍按设置的日期和重复规则提醒。</p>
        <p v-if="!semester.semester?.start_date" class="panel-tip"><router-link to="/courses#semester-settings">先设置开学日期</router-link>，再生成课程提醒；自定义事项不受影响。</p>
        <p v-if="pendingCourses" class="panel-tip">今天有 {{ pendingCourses }} 门课程需要补全正确的起止时间，暂不提醒。<router-link to="/courses">去补全时间</router-link></p>
        <p v-if="courses.errorMessage" class="reminder-error">课表暂未同步成功，课程通知未重新安排，请检查网络后重新同步。</p>
      </section>

      <section class="next-reminders" aria-label="即将提醒">
        <header><h2>接下来</h2><small>{{ nextReminder ? '今日课程 · 自定义事项' : '今天不再有待提醒的课程' }}</small></header>
        <div v-if="!upcoming.length" class="reminder-empty"><TechIcon name="notes" :size="32" /><p>暂时没有新的提醒</p><small>课程只看今天，也可以添加一件自己的事。</small></div>
        <ol v-else><li v-for="occurrence in upcoming.slice(0, 6)" :key="occurrence.key"><span class="timeline-dot" :class="occurrence.kind"></span><div><time>{{ formatReminderAt(occurrence.at) }}</time><strong>{{ occurrence.title }}</strong><p>{{ occurrence.body }}</p></div><span class="kind-label">{{ occurrence.kind === 'course' ? '课程' : '事项' }}</span></li></ol>
      </section>

      <section class="my-reminders" aria-label="我的事项">
        <header><div><h2>我的事项</h2><small>{{ store.plan.items.length }} 个事项 · 可编辑、暂停或完成</small></div><div class="reminder-filter" role="group" aria-label="事项筛选"><button type="button" :aria-pressed="filter === 'active'" @click="filter = 'active'">待办</button><button type="button" :aria-pressed="filter === 'all'" @click="filter = 'all'">全部</button></div></header>
        <p v-if="!visibleItems.length" class="reminder-empty">{{ filter === 'active' ? '待办都处理好了，也可以添加新的提醒。' : '还没有自定义事项，点击上方“新建提醒”。' }}</p>
        <article v-for="item in visibleItems" :key="item.id" class="reminder-item" :data-reminder-id="item.id" :class="{ paused: !item.enabled }">
          <header><strong>{{ item.title }}</strong><span>{{ itemStatus(item) }}</span></header>
          <time>{{ formatReminderAt(nextCustomOccurrence(item, now)?.at || reminderInstant(item.date, item.time)) }}</time>
          <p v-if="item.note">{{ item.note }}</p><small>{{ item.repeat === 'once' ? '单次' : item.repeat === 'daily' ? '每天' : `每周${item.weekdays.map(day => weekdays[day - 1]).join('、')}` }} · {{ modes.find(mode => mode.value === item.mode)?.label }}<template v-if="item.end_date"> · 至 {{ item.end_date }}</template></small>
          <footer><button v-if="nextCustomOccurrence(item, now)" type="button" :disabled="store.saving" @click="finish(item)">{{ item.repeat === 'once' ? '完成' : '完成本次' }}</button><button v-if="nextCustomOccurrence(item, now)" type="button" :disabled="store.saving" @click="finish(item, true)">10 分钟后提醒</button><button type="button" :disabled="store.saving" @click="edit(item)">编辑</button><button type="button" :disabled="store.saving" @click="toggleItem(item)">{{ item.enabled ? '暂停' : '恢复' }}</button><button type="button" class="delete-reminder" :disabled="store.saving" @click="removeItem(item)">删除</button></footer>
        </article>
      </section>
    </main>
  </section>
</template>

<style scoped>
.reminders-page { --page-max: 920px; }
.reminders-content { display: grid; gap: 22px; max-width: 860px; margin: auto; }
.reminder-hero { position: relative; overflow: hidden; display: grid; grid-template-columns: 1fr auto; gap: 24px; padding: 28px; border-radius: 28px 28px 52px 28px; background: linear-gradient(130deg,#f7efd9,#e4efdf 75%); border: 1px solid #e3e7d9; }
.reminder-hero h1 { margin: 15px 0 12px; font-size: clamp(28px,5vw,40px); line-height: 1.35; letter-spacing: -.04em; color: #344d3b; }
.reminder-hero p { color: #64705f; font-size: 13px; line-height: 1.7; max-width: 310px; margin: 0; }
.reminder-hero footer { grid-column: 1/-1; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.reminder-hero footer > span { color: #5b6c55; font-size: 12px; }
.reminder-hero footer strong { font-size: 30px; font-weight: 700; margin-right: 6px; }
.bell-art { position: relative; align-self: center; color: #66815c; display: grid; place-items: center; width: 130px; height: 130px; border-radius: 50%; background: rgba(255,254,247,.7); box-shadow: 0 0 0 15px rgba(255,255,255,.2); transform: rotate(10deg); }
.bell-art i { position: absolute; width: 17px; height: 17px; background: #e9c77c; top: -3px; right: 9px; border-radius: 50%; }
.bell-art b { position: absolute; bottom: -5px; right: -5px; width: 23px; height: 42px; background: #aac396; border-radius: 85% 0 85% 0; transform: rotate(20deg); }
button { cursor: pointer; color: inherit; font: inherit; }
button:disabled { opacity: .48; cursor: not-allowed; }
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid #4f7558; outline-offset: 3px; }
.reminder-primary { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 0; min-height: 46px; border-radius: 16px; background: #496a50; color: #fff; padding: 10px 19px; font-size: 14px; font-weight: 700; white-space: nowrap; }
.device-notice { padding: 18px; border: 1px solid #e5d9ba; background: #fbf7e9; border-radius: 20px; }
.device-notice.ready { border-color: #d3dfcf; background: #edf3e8; }
.device-notice header { display: flex; align-items: center; gap: 9px; color: #4b6248; font-size: 14px; }
.device-notice p,.panel-tip { font-size: 12px; color: #636b5f; line-height: 1.8; margin: 10px 0; }
.device-notice small { display: block; color: #636b5f; line-height: 1.7; font-size: 11px; }
.device-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.device-actions button,.reminder-item footer button { border: 1px solid #d9e0d3; border-radius: 12px; background: #fffef8; min-height: 42px; padding: 8px 12px; font-size: 12px; font-weight: 650; }
.reminder-editor,.course-reminder-panel,.next-reminders,.my-reminders { padding: 22px; background: #fffef9; border: 1px solid #e3e8dd; border-radius: 24px; box-shadow: 0 9px 28px rgba(52,73,48,.04); }
.reminder-editor { scroll-margin-top: 85px; border-color: #aabea0; }
.reminder-editor > header,.course-reminder-panel > header,.next-reminders > header,.my-reminders > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h2 { color: #3d5441; font-size: 20px; margin: 0; }
header small { font-size: 11px; color: #6c7566; }
.reminder-editor header button { display: grid; place-items: center; border: 0; background: #eef2e7; width: 44px; height: 44px; border-radius: 50%; }
.reminder-editor h2 { margin-top: 7px; }
.reminder-editor fieldset { border: 0; padding: 0; margin: 22px 0; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 18px 14px; min-width: 0; }
.reminder-editor label,.course-reminder-options label { display: grid; align-content: start; min-width: 0; gap: 8px; color: #4e5e4d; font-size: 13px; font-weight: 650; }
input,select,textarea { width: 100%; min-width: 0; box-sizing: border-box; font-family: inherit; font-size: 16px; color: #334a38; background: #f7f8f0; border: 1px solid #dce4d5; border-radius: 13px; padding: 11px; min-height: 48px; }
textarea { resize: vertical; }
input[type=date] { font-size: 14px; padding-inline: 9px; }
input[type=date]::-webkit-calendar-picker-indicator { margin-left: 0; padding: 0; width: 18px; }
label small { font-size: 11px; color: #6d7666; font-weight: 400; line-height: 1.6; }
.full { grid-column: 1/-1; }
.weekday-picker { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); gap: 6px; }
.weekday-picker button { border: 1px solid #d8e1d1; border-radius: 11px; min-height: 44px; background: #f6f8ef; }
.weekday-picker button[aria-pressed=true] { color: #fff; background: #577751; border-color: #577751; }
.reminder-editor footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.reminder-editor footer span { font-size: 11px; color: #6d7666; line-height: 1.6; }
.section-icon { display: grid; place-items: center; width: 48px; height: 48px; flex-shrink: 0; border-radius: 17px; background: #ede8f3; color: #7b6a95; }
.course-reminder-panel header > div { flex: 1; }
.course-reminder-panel header p { margin: 5px 0 0; font-size: 12px; color: #6d7666; line-height: 1.5; }
.reminder-switch { position: relative; width: 48px; height: 30px; min-height: 44px; border: 0; background: transparent; flex-shrink: 0; }
.reminder-switch::before { content: ''; position: absolute; inset: 7px 0; background: #d7ddcf; border-radius: 25px; }
.reminder-switch i { position: absolute; left: 3px; top: 10px; height: 24px; width: 24px; border-radius: 50%; background: #fff; box-shadow: 0 2px 4px #0002; transition: transform .2s; }
.reminder-switch[aria-checked=true]::before { background: #658661; }
.reminder-switch[aria-checked=true] i { transform: translateX(18px); }
.course-reminder-options { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; margin-top: 20px; }
.panel-tip a { color: #426349; text-decoration: underline; text-underline-offset: 3px; }
.next-reminders ol { margin: 20px 0 0; padding: 0; list-style: none; }
.next-reminders li { position: relative; display: flex; gap: 13px; padding: 5px 0 21px; }
.timeline-dot { width: 11px; height: 11px; border-radius: 50%; background: #c5a669; margin-top: 5px; flex-shrink: 0; }
.timeline-dot.course { background: #a592ba; }
.next-reminders li > div { flex: 1; min-width: 0; }
.next-reminders time { font-size: 12px; color: #69785f; }
.next-reminders strong { display: block; margin-top: 5px; line-height: 1.5; font-size: 14px; color: #3d5140; overflow-wrap: anywhere; }
.next-reminders p { margin: 4px 0 0; color: #5f7057; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.kind-label { font-size: 11px; align-self: flex-start; background: #f0f3e9; color: #596c50; padding: 4px 7px; border-radius: 7px; }
.reminder-empty { display: grid; justify-items: center; gap: 10px; color: #5f7057; text-align: center; font-size: 13px; padding: 24px 0 10px; line-height: 1.7; }
.reminder-empty p { margin: 0; }
.reminder-filter { display: flex; padding: 3px; border-radius: 13px; background: #f0f3e8; }
.reminder-filter button { border: 0; background: transparent; min-height: 42px; min-width: 47px; border-radius: 10px; font-size: 12px; }
.reminder-filter button[aria-pressed=true] { background: #fffef9; color: #426146; box-shadow: 0 2px 8px #455c3e0b; }
.reminder-item { margin-top: 16px; padding: 17px; border: 1px solid #e0e5d8; border-radius: 18px; background: #f9faf3; }
.reminder-item header { display: flex; gap: 12px; justify-content: space-between; }
.reminder-item header strong { color: #40533d; font-size: 16px; overflow-wrap: anywhere; }
.reminder-item header span { color: #5f7057; font-size: 11px; white-space: nowrap; }
.reminder-item time { display: block; color: #617359; font-size: 12px; margin: 10px 0; }
.reminder-item p { white-space: pre-wrap; overflow-wrap: anywhere; margin: 10px 0; color: #617359; font-size: 13px; line-height: 1.6; }
.reminder-item small { color: #5f7057; font-size: 11px; line-height: 1.8; }
.reminder-item footer { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 13px; }
.reminder-item footer .delete-reminder { color: #986253; }
.reminder-item.paused { background: #f1f2ec; }
.reminder-error { color: #9a4d3b !important; font-size: 13px; line-height: 1.7; }
@media (max-width: 480px) {
  .reminders-content { gap: 17px; }
  .reminder-hero { padding: 22px; gap: 16px; }
  .bell-art { width: 80px; height: 80px; margin-right: 4px; box-shadow: 0 0 0 9px #ffffff40; }
  .bell-art :deep(svg) { width: 46px; height: 46px; }
  .reminder-hero h1 { font-size: 28px; }
  .reminder-hero p { font-size: 12px; }
  .reminder-editor,.course-reminder-panel,.next-reminders,.my-reminders { padding: 17px; }
  .next-reminders > header { align-items: flex-start; flex-direction: column; gap: 5px; }
  h2 { font-size: 18px; }
  .reminder-editor footer { flex-direction: column; align-items: stretch; gap: 10px; }
}
@media (max-width: 370px) {
  .reminder-editor fieldset { grid-template-columns: minmax(0,1fr); }
  .bell-art { display: none; }
  .reminder-hero { grid-template-columns: 1fr; }
}
</style>
