<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { showFailToast } from 'vant'
import { useRouter } from 'vue-router'

import { commitCourseImport, previewCourseImport } from '@/api/courses'
import { extractBusinessError } from '@/api/errors'
import ImportSummary from '@/components/import/ImportSummary.vue'
import {
  captureHubuCourseTable,
  captureToHtmlFile,
  HUBU_ACADEMIC_SYSTEM_URL,
  supportsNativeHubuCourseImport
} from '@/native/hubuCourseImport'
import { useCoursesStore } from '@/stores/courses'
import type {
  ImportCandidate,
  ImportIssue,
  ImportPreviewResponse
} from '@/types/courseImport'
import { useKeyboardAwarePage } from '@/utils/keyboardInset'
import { goBack } from '@/utils/navigation'

type ImportPageState =
  | 'idle'
  | 'previewing'
  | 'needs_resolution'
  | 'ready'
  | 'committing'
  | 'success'
  | 'failed'

const LOCATION_ERROR_CODES = new Set(['building_unrecognized', 'room_missing'])
const NON_BLOCKING_ERROR_CODES = new Set([
  ...LOCATION_ERROR_CODES,
  'time_unrecognized'
])

const router = useRouter()
const coursesStore = useCoursesStore()
const selectedFile = ref<File | null>(null)
const preview = ref<ImportPreviewResponse | null>(null)
const excludedRowRefs = ref<string[]>([])
const serverIssues = ref<Record<string, ImportIssue[]>>({})
const highlightedRowRefs = ref<string[]>([])
const state = ref<ImportPageState>('idle')
const errorMessage = ref('')
const createdCount = ref(0)
const nativeImporting = ref(false)
const importSource = ref<'file' | 'hubu'>('file')
const captureSourceUrl = ref('')
const nativeHubuImportAvailable = supportsNativeHubuCourseImport()
const { pageStyle, onFieldFocus } = useKeyboardAwarePage({ basePaddingPx: 34 })

const candidates = computed(() => preview.value?.candidates ?? [])
const activeCandidates = computed(() =>
  candidates.value.filter((candidate) => !excludedRowRefs.value.includes(candidate.row_ref))
)
const excludedCandidates = computed(() =>
  candidates.value.filter((candidate) => excludedRowRefs.value.includes(candidate.row_ref))
)
const excludedCount = computed(() => candidates.value.length - activeCandidates.value.length)
const skippedCandidateDetails = computed(() =>
  excludedCandidates.value.map((candidate) => ({
    rowRef: candidate.row_ref,
    name: candidate.source.raw_course_name || candidate.course_name || '未识别课程',
    reasons: candidateSkipReasons(candidate)
  }))
)
const resolvedCount = computed(() =>
  activeCandidates.value.filter((candidate) => isCandidateImportable(candidate)).length
)
const unresolvedCount = computed(() => activeCandidates.value.length - resolvedCount.value)
const pendingCompletionCount = computed(() =>
  activeCandidates.value.filter((candidate) =>
    candidate.errors.some((issue) => NON_BLOCKING_ERROR_CODES.has(issue.code))
  ).length
)
const conflictCount = computed(() =>
  Object.entries(serverIssues.value).filter(([rowRef, issues]) =>
    !excludedRowRefs.value.includes(rowRef) &&
    issues.some((issue) => issue.code === 'course_conflict')
  ).length
)
const canCommit = computed(() =>
  Boolean(
    selectedFile.value &&
      preview.value &&
      activeCandidates.value.length > 0 &&
      unresolvedCount.value === 0
  )
)
const isBusy = computed(() =>
  nativeImporting.value || state.value === 'previewing' || state.value === 'committing'
)

function hasParsedCourse(candidate: ImportCandidate): boolean {
  return Boolean(
    candidate.course_name &&
      candidate.weekday &&
      candidate.weeks
  )
}

function hasBlockingSourceIssue(candidate: ImportCandidate): boolean {
  return candidate.errors.some((issue) => !NON_BLOCKING_ERROR_CODES.has(issue.code))
}

function isCandidateImportable(candidate: ImportCandidate): boolean {
  return hasParsedCourse(candidate) && !hasBlockingSourceIssue(candidate)
}

function shouldSkipCandidateAutomatically(candidate: ImportCandidate): boolean {
  const hasTime = Boolean(candidate.start_time && candidate.end_time)
  const hasLocation = Boolean(candidate.source.raw_location.trim())
  return !isCandidateImportable(candidate) || (!hasTime && !hasLocation)
}

function candidateSkipReasons(candidate: ImportCandidate): string[] {
  const reasons = candidate.errors
    .filter((issue) => !NON_BLOCKING_ERROR_CODES.has(issue.code))
    .map((issue) => issue.message.trim())
    .filter(Boolean)
  const hasTime = Boolean(candidate.start_time && candidate.end_time)
  const hasLocation = Boolean(candidate.source.raw_location.trim())
  if (!hasTime && !hasLocation) {
    reasons.push('没有可用的上课时间和地点')
  }
  if (!hasParsedCourse(candidate) && reasons.length === 0) {
    reasons.push('课程名称、星期或周次无法识别')
  }
  if (reasons.length === 0) {
    reasons.push('已选择不导入')
  }
  return [...new Set(reasons)]
}

function prepareAutomaticImportSelection() {
  excludedRowRefs.value = candidates.value
    .filter((candidate) => shouldSkipCandidateAutomatically(candidate))
    .map((candidate) => candidate.row_ref)
  syncPreviewState()
}

function syncPreviewState() {
  if (!preview.value || state.value === 'previewing' || state.value === 'committing') return
  if (state.value === 'success') return
  state.value = canCommit.value ? 'ready' : 'needs_resolution'
}

function resetPreview() {
  preview.value = null
  excludedRowRefs.value = []
  serverIssues.value = {}
  highlightedRowRefs.value = []
  errorMessage.value = ''
  createdCount.value = 0
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
  importSource.value = 'file'
  captureSourceUrl.value = ''
  resetPreview()
  state.value = 'idle'
}

async function previewFile() {
  if (!selectedFile.value) {
    showFailToast('请先选择课表文件')
    return
  }
  resetPreview()
  state.value = 'previewing'
  try {
    const result = await previewCourseImport(selectedFile.value)
    preview.value = result
    if (result.candidates.length === 0) {
      errorMessage.value = '文件中没有识别到课程，请检查文件内容。'
      state.value = 'failed'
      return
    }
    prepareAutomaticImportSelection()
    if (activeCandidates.value.length === 0) {
      errorMessage.value = '当前课表没有可导入的有效课程。'
      state.value = 'failed'
      return
    }
  } catch (error) {
    errorMessage.value = extractBusinessError(error).message
    state.value = 'failed'
    showFailToast(errorMessage.value)
  }
}

function nativeImportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim()
  ) {
    return error.message
  }
  return '暂时无法打开教务系统，请稍后再试'
}

async function startHubuImport() {
  if (!nativeHubuImportAvailable || isBusy.value) return

  nativeImporting.value = true
  try {
    const capture = await captureHubuCourseTable()
    if (capture.cancelled) return

    selectedFile.value = captureToHtmlFile(capture)
    importSource.value = 'hubu'
    captureSourceUrl.value = capture.sourceUrl ?? ''
    await previewFile()
    if (canCommit.value) await commitImport()
    else if (preview.value && activeCandidates.value.length === 0) {
      errorMessage.value = '当前课表没有可导入的有效课程。'
      state.value = 'failed'
      showFailToast(errorMessage.value)
    }
  } catch (error) {
    const message = nativeImportErrorMessage(error)
    errorMessage.value = message
    state.value = 'failed'
    showFailToast(message)
  } finally {
    nativeImporting.value = false
  }
}

function issueMessageFromConflict(value: Record<string, unknown>): string {
  const conflictingName =
    typeof value.conflicting_course_name === 'string'
      ? value.conflicting_course_name
      : '已有课程'
  const weeks = Array.isArray(value.overlap_weeks)
    ? value.overlap_weeks.filter((week) => Number.isInteger(week)).join('、')
    : ''
  return weeks
    ? `与「${conflictingName}」在第 ${weeks} 周冲突`
    : `与「${conflictingName}」时间冲突`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function addServerIssue(rowRef: string, issue: ImportIssue) {
  serverIssues.value = {
    ...serverIssues.value,
    [rowRef]: [...(serverIssues.value[rowRef] ?? []), issue]
  }
}

function collectServerRowIssues(code: string, details: Record<string, unknown>): string[] {
  const rowRefs = new Set<string>()
  if (typeof details.row_ref === 'string') rowRefs.add(details.row_ref)
  if (Array.isArray(details.row_refs)) {
    details.row_refs.forEach((rowRef) => {
      if (typeof rowRef === 'string') rowRefs.add(rowRef)
    })
  }
  if (Array.isArray(details.rows)) {
    details.rows.forEach((row) => {
      if (!isRecord(row) || typeof row.row_ref !== 'string') return
      rowRefs.add(row.row_ref)
      if (!Array.isArray(row.issues)) return
      row.issues.forEach((issue) => {
        if (!isRecord(issue)) return
        addServerIssue(row.row_ref as string, {
          code: typeof issue.code === 'string' ? issue.code : code,
          field: typeof issue.field === 'string' ? issue.field : 'course',
          message: typeof issue.message === 'string' ? issue.message : '这行课程仍需处理'
        })
      })
    })
  }
  if (Array.isArray(details.conflicts)) {
    details.conflicts.forEach((conflict) => {
      if (!isRecord(conflict) || typeof conflict.row_ref !== 'string') return
      rowRefs.add(conflict.row_ref)
      addServerIssue(conflict.row_ref, {
        code: 'course_conflict',
        field: 'course',
        message: issueMessageFromConflict(conflict)
      })
    })
  }
  rowRefs.forEach((rowRef) => {
    if (!serverIssues.value[rowRef]) {
      addServerIssue(rowRef, { code, field: 'course', message: '这行课程仍需处理' })
    }
  })
  return [...rowRefs]
}

async function focusFirstProblem(rowRefs: string[]) {
  if (!rowRefs.length) return
  highlightedRowRefs.value = rowRefs
  await nextTick()
  document.getElementById(`import-${rowRefs[0]}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  })
}

function candidateBlockingIssues(candidate: ImportCandidate): ImportIssue[] {
  return [
    ...candidate.errors.filter((issue) => !NON_BLOCKING_ERROR_CODES.has(issue.code)),
    ...(serverIssues.value[candidate.row_ref] ?? [])
  ]
}

function candidateIsExcluded(candidate: ImportCandidate): boolean {
  return excludedRowRefs.value.includes(candidate.row_ref)
}

function toggleCandidateExclusion(candidate: ImportCandidate) {
  const excluded = new Set(excludedRowRefs.value)
  if (excluded.has(candidate.row_ref)) {
    excluded.delete(candidate.row_ref)
  } else {
    excluded.add(candidate.row_ref)
    const nextServerIssues = { ...serverIssues.value }
    delete nextServerIssues[candidate.row_ref]
    serverIssues.value = nextServerIssues
    highlightedRowRefs.value = highlightedRowRefs.value.filter(
      (rowRef) => rowRef !== candidate.row_ref
    )
    errorMessage.value = ''
  }
  excludedRowRefs.value = [...excluded]
  syncPreviewState()
}

function candidateHasScheduleNote(candidate: ImportCandidate): boolean {
  return candidate.errors.some((issue) => issue.code === 'time_unrecognized')
}

function candidateHasLocationNote(candidate: ImportCandidate): boolean {
  return candidate.errors.some((issue) => LOCATION_ERROR_CODES.has(issue.code))
}

function candidateSchedule(candidate: ImportCandidate): string {
  const weekday = candidate.source.raw_weekday.trim()
  const time = candidate.source.raw_time_or_section.trim()
  const weeks = candidate.source.raw_weeks.trim()
  return [weekday, time, weeks].filter(Boolean).join(' · ') || '时间信息未识别'
}

async function commitImport() {
  if (!selectedFile.value || !preview.value || !canCommit.value) return
  serverIssues.value = {}
  highlightedRowRefs.value = []
  errorMessage.value = ''
  state.value = 'committing'
  try {
    const result = await commitCourseImport(
      selectedFile.value,
      preview.value.file.sha256,
      excludedRowRefs.value
    )
    createdCount.value = result.created_count
    coursesStore.invalidate()
    state.value = 'success'
  } catch (error) {
    const businessError = extractBusinessError(error)
    errorMessage.value = businessError.message
    state.value = 'failed'
    const rowRefs = collectServerRowIssues(businessError.code, businessError.details)
    await focusFirstProblem(rowRefs)
    showFailToast(errorMessage.value)
  }
}

</script>

<template>
  <section class="page course-import-page">
    <van-nav-bar title="导入课表" left-arrow @click-left="goBack(router, '/courses')" />

    <main class="page-content import-content" :style="pageStyle" @focusin="onFieldFocus">
      <header v-reveal="{ from: 'left', distance: 36, stagger: 60 }" class="import-hero">
        <div>
          <span class="eyebrow">密码只留在学校官方页面</span>
          <h1>从教务系统，把整周课表带回来</h1>
          <p>安卓 App 可直接采集当前课表；HTML 与 Excel 文件仍然可以照常导入。</p>
        </div>
        <div class="paper-garden" :class="{ busy: isBusy }" aria-hidden="true">
          <span class="paper paper-back"></span>
          <span class="paper paper-front"><i></i><i></i><i></i></span>
          <b></b><b></b>
        </div>
      </header>

      <section v-reveal="{ from: 'right', distance: 30, delay: 60 }" class="hubu-import-sheet">
        <header>
          <span>01</span>
          <div>
            <small>湖北大学 · 官方教务系统</small>
            <h2>登录后，一键读取当前课表</h2>
          </div>
          <b :class="{ available: nativeHubuImportAvailable }">
            {{ nativeHubuImportAvailable ? '安卓已就绪' : '需安卓 App' }}
          </b>
        </header>

        <ol class="hubu-import-steps">
          <li><i>1</i><span><strong>进入官方页面</strong><small>学号和密码只在湖北大学页面输入</small></span></li>
          <li><i>2</i><span><strong>打开学期理论课表</strong><small>先选好学年学期，确认课表已经完整显示</small></span></li>
          <li><i>3</i><span><strong>点击“导入课表”</strong><small>返回后自动覆盖当前课表，无需逐门确认</small></span></li>
        </ol>

        <button
          type="button"
          class="hubu-import-button"
          data-testid="hubu-native-import"
          :disabled="!nativeHubuImportAvailable || isBusy"
          @click="startHubuImport"
        >
          <i v-if="nativeImporting" aria-hidden="true"></i>
          <span>{{ nativeImporting ? '等待教务系统返回课表' : '进入教务系统并导入' }}</span>
          <b aria-hidden="true">↗</b>
        </button>

        <a
          v-if="!nativeHubuImportAvailable"
          class="hubu-browser-link"
          :href="HUBU_ACADEMIC_SYSTEM_URL"
          target="_blank"
          rel="noopener noreferrer"
        >
          当前是网页版，可先打开湖北大学教务系统
        </a>

        <p class="privacy-note">
          <span aria-hidden="true">✓</span>
          不读取密码，不导出登录 Cookie；课程和地点按课表原文保存，地点未匹配地图也不影响查看。
        </p>
      </section>

      <section v-reveal="{ from: 'right', distance: 30, delay: 60 }" class="upload-sheet">
        <header>
          <span>02</span>
          <div><h2>或者选择原始课表文件</h2><p>支持 HTM / HTML / XLS / XLSX</p></div>
        </header>
        <label class="file-picker" :class="{ selected: selectedFile }">
          <input
            type="file"
            accept=".htm,.html,.xls,.xlsx,text/html,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            :disabled="isBusy"
            @change="handleFileChange"
          />
          <span class="file-icon" aria-hidden="true">↥</span>
          <span>
            <strong>{{ selectedFile?.name || '选择一个课表文件' }}</strong>
            <small v-if="selectedFile && importSource === 'hubu'">
              已从湖北大学教务系统安全采集
            </small>
            <small v-else>{{ selectedFile ? '原文件会原样用于最终提交' : '单个文件不超过 10MB' }}</small>
          </span>
          <b>{{ selectedFile ? '更换' : '浏览' }}</b>
        </label>
        <a
          v-if="captureSourceUrl"
          class="capture-source"
          :href="captureSourceUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          来源：{{ captureSourceUrl }}
        </a>
        <button
          type="button"
          class="preview-button"
          data-testid="preview-import"
          :disabled="!selectedFile || isBusy"
          @click="previewFile"
        >
          <i v-if="state === 'previewing'" aria-hidden="true"></i>
          <span>{{ state === 'previewing' ? '正在逐行读取' : '预览文件原文' }}</span>
        </button>
      </section>

      <section v-if="state === 'success'" class="success-sheet" aria-live="polite">
        <span aria-hidden="true">✓</span>
        <h2>{{ createdCount }} 门课程已覆盖导入</h2>
        <p>原课表已由本次课表替换。</p>
        <div v-if="skippedCandidateDetails.length" class="skipped-import-summary" role="status">
          <strong>另有 {{ skippedCandidateDetails.length }} 门课程未导入</strong>
          <p>以下课程及原因已明确记录，你可以返回教务系统核对原课表。</p>
          <ul>
            <li v-for="candidate in skippedCandidateDetails" :key="candidate.rowRef">
              <b>{{ candidate.name }}</b>
              <span>{{ candidate.reasons.join('；') }}</span>
            </li>
          </ul>
        </div>
        <p v-else>本次没有跳过任何课程。</p>
        <button type="button" data-testid="view-courses" @click="router.push('/courses')">
          查看我的课表
        </button>
      </section>

      <template v-else-if="preview">
        <ImportSummary
          v-reveal="{ from: 'left', distance: 30 }"
          :filename="preview.file.filename"
          :total="activeCandidates.length"
          :resolved="resolvedCount"
          :unresolved="unresolvedCount"
          :pending="pendingCompletionCount"
          :conflicts="conflictCount"
          :ready="canCommit"
        />

        <p v-if="errorMessage" class="page-error" role="alert">{{ errorMessage }}</p>

        <section class="candidate-list" aria-label="导入课程预览">
          <div class="list-heading">
            <span>03</span>
            <div>
              <h2>导入内容预览</h2>
              <p>
                课程、地点和已有时间按原文保存；无法导入的单门课程可以先排除。
                <b v-if="excludedCount">当前已排除 {{ excludedCount }} 门。</b>
              </p>
            </div>
          </div>
          <article
            v-for="(candidate, index) in candidates"
            :key="candidate.row_ref"
            :id="`import-${candidate.row_ref}`"
            class="candidate-preview"
            :class="{
              'has-error': !candidateIsExcluded(candidate) && candidateBlockingIssues(candidate).length,
              'is-highlighted': highlightedRowRefs.includes(candidate.row_ref),
              'is-excluded': candidateIsExcluded(candidate)
            }"
            :data-row-ref="candidate.row_ref"
            v-reveal="{
              from: index % 2 ? 'right' : 'left',
              distance: 32,
              delay: Math.min(index * 65, 260)
            }"
          >
            <header>
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
              <div>
                <strong>{{ candidate.source.raw_course_name || candidate.course_name || '未识别课程' }}</strong>
                <small>{{ candidateSchedule(candidate) }}</small>
              </div>
              <button
                type="button"
                class="candidate-exclusion"
                :class="{ restore: candidateIsExcluded(candidate) }"
                :aria-pressed="candidateIsExcluded(candidate)"
                :disabled="state === 'committing'"
                :data-testid="`toggle-exclusion-${candidate.row_ref}`"
                @click="toggleCandidateExclusion(candidate)"
              >
                {{ candidateIsExcluded(candidate) ? '恢复这门' : '不导入这门' }}
              </button>
            </header>
            <p v-if="candidateIsExcluded(candidate)" class="excluded-note">
              这门课程已从本次导入中排除，不会影响其余课程。
            </p>
            <dl>
              <div>
                <dt>教师</dt>
                <dd>{{ candidate.source.raw_teacher || '—' }}</dd>
              </div>
              <div>
                <dt>地点原文</dt>
                <dd>{{ candidate.source.raw_location || '—' }}</dd>
              </div>
            </dl>
            <p v-if="candidateHasLocationNote(candidate)" class="location-note">
              <span aria-hidden="true">i</span>
              地点会照原文导入，不影响课表查看；发起路线时若仍未匹配地图，再提示补全。
            </p>
            <p v-if="candidateHasScheduleNote(candidate)" class="location-note schedule-note">
              <span aria-hidden="true">i</span>
              上课时间暂未识别，仍会导入到“待补全课程”；之后可以手动补时间或直接删除。
            </p>
            <ul v-if="candidateBlockingIssues(candidate).length" class="candidate-issues">
              <li v-for="issue in candidateBlockingIssues(candidate)" :key="`${issue.code}-${issue.field}-${issue.message}`">
                {{ issue.message }}
              </li>
            </ul>
          </article>
        </section>

        <footer class="commit-sheet">
          <div>
            <strong v-if="canCommit && excludedCount">
              已排除 {{ excludedCount }} 门，本次导入 {{ activeCandidates.length }} 门
            </strong>
            <strong v-else-if="canCommit">全部课程都可按原文导入</strong>
            <strong v-else>还有 {{ unresolvedCount }} 门课程的排课信息无法识别</strong>
            <p>提交后会替换当前课表；地点或时间缺失不会阻止整批导入。</p>
          </div>
          <button
            type="button"
            data-testid="commit-import"
            :disabled="!canCommit || state === 'committing'"
            @click="commitImport"
          >
            <i v-if="state === 'committing'" aria-hidden="true"></i>
            <span>{{ state === 'committing' ? '正在校验并替换课表' : `覆盖导入 ${activeCandidates.length} 门课程` }}</span>
          </button>
        </footer>
      </template>

      <p v-else-if="errorMessage" class="page-error" role="alert">{{ errorMessage }}</p>
    </main>
  </section>
</template>

<style scoped>
.import-content {
  display: grid;
  width: min(100%, 780px);
  gap: 18px;
  padding-top: 14px;
}

.import-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 174px;
  min-height: 250px;
  overflow: hidden;
  align-items: center;
  border: 1px solid rgba(90, 124, 91, .13);
  border-radius: 36px 36px 82px 36px;
  background: radial-gradient(circle at 90% 2%, #f7e7bd 0, transparent 34%), linear-gradient(145deg, #f4f5df, var(--fresh-mint) 70%);
  box-shadow: 0 22px 52px rgba(68, 94, 66, .12);
  padding: 28px;
}
.import-hero::after { position: absolute; right: -70px; bottom: -95px; width: 270px; height: 190px; border-radius: 50%; background: rgba(112,158,118,.1); content: ""; }
.import-hero > div:first-child { position: relative; z-index: 2; }
.eyebrow { display: inline-flex; border-radius: var(--radius-pill); background: rgba(255,255,255,.72); color: var(--fresh-text); font-size: 12px; font-weight: 800; padding: 7px 11px; }
.import-hero h1 { max-width: 440px; margin: 15px 0 10px; color: var(--fresh-ink); font-size: clamp(29px, 7vw, 43px); letter-spacing: -.05em; line-height: 1.12; }
.import-hero p { max-width: 470px; margin: 0; color: var(--fresh-muted); font-size: 13px; line-height: 1.75; }

.paper-garden { position: relative; z-index: 1; width: 160px; height: 172px; animation: paper-breathe 5.2s ease-in-out infinite; }
.paper { position: absolute; width: 112px; height: 143px; border-radius: 10px 18px 18px 10px; }
.paper-back { top: 12px; left: 33px; background: #dbb983; transform: rotate(10deg); }
.paper-front { top: 2px; left: 17px; background: repeating-linear-gradient(180deg, transparent 0 26px, rgba(105,146,108,.12) 27px 28px), var(--fresh-paper); box-shadow: inset 8px 0 #ead7a9, 0 14px 30px rgba(67,83,61,.15); }
.paper-front i { display: block; width: 61px; height: 5px; margin: 26px 0 -10px 30px; border-radius: 8px; background: #a9c7a2; }
.paper-front i:nth-child(2) { width: 43px; background: #e8bf79; }
.paper-front i:nth-child(3) { width: 67px; background: #9fc4c7; }
.paper-garden b { position: absolute; right: 2px; bottom: 2px; width: 32px; height: 54px; border-radius: 90% 8% 90% 10%; background: #739c70; transform: rotate(27deg); transform-origin: bottom; animation: leaf-sway 4s ease-in-out infinite; }
.paper-garden b:last-child { right: 31px; bottom: -5px; width: 25px; height: 43px; background: #a8bd75; transform: rotate(-13deg); animation-delay: .6s; }
.paper-garden.busy .paper-front { animation: paper-read 1.45s ease-in-out infinite; }

.upload-sheet,
.hubu-import-sheet,
.success-sheet,
.commit-sheet {
  border: 1px solid var(--fresh-line);
  border-radius: var(--radius-lg);
  background: var(--fresh-paper);
  box-shadow: 0 16px 38px rgba(59,79,57,.08);
  padding: 18px;
}
.hubu-import-sheet {
  display: grid;
  gap: 16px;
  overflow: hidden;
  border-color: rgba(83, 120, 89, .22);
  background:
    radial-gradient(circle at 100% 0, rgba(234, 197, 125, .22), transparent 13rem),
    linear-gradient(145deg, #fdfcf6, #edf5eb);
}
.hubu-import-sheet > header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
}
.hubu-import-sheet > header > span {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 50%;
  background: #dfeede;
  color: #47694e;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  font-weight: 900;
}
.hubu-import-sheet header small {
  color: #718074;
  font-size: 11px;
  font-weight: 700;
}
.hubu-import-sheet h2 {
  margin: 3px 0 0;
  color: var(--fresh-ink);
  font-size: 19px;
}
.hubu-import-sheet header > b {
  border: 1px solid #d8ded4;
  border-radius: var(--radius-pill);
  background: rgba(255,255,255,.72);
  color: #7f877e;
  font-size: 11px;
  padding: 6px 9px;
}
.hubu-import-sheet header > b.available {
  border-color: #a8c6aa;
  background: #dfeede;
  color: #3f6748;
}
.hubu-import-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.hubu-import-steps li {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 9px;
  border: 1px solid rgba(91, 121, 91, .13);
  border-radius: 16px;
  background: rgba(255,255,255,.68);
  padding: 12px;
}
.hubu-import-steps li > i {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border-radius: 50%;
  background: #608966;
  color: #fff;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  font-style: normal;
  font-weight: 900;
}
.hubu-import-steps li > span {
  display: grid;
  gap: 4px;
}
.hubu-import-steps strong {
  color: var(--fresh-ink);
  font-size: 13px;
}
.hubu-import-steps small {
  color: var(--fresh-muted);
  font-size: 11px;
  line-height: 1.5;
}
.hubu-import-button {
  display: grid;
  min-height: 54px;
  grid-template-columns: auto auto auto;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px solid #567e5e;
  border-radius: 17px;
  background: #52775a;
  box-shadow: 0 13px 24px rgba(63, 98, 71, .17);
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 850;
  padding: 0 17px;
  transition: transform 300ms var(--fresh-spring), box-shadow 300ms ease, background 300ms ease;
}
.hubu-import-button > b {
  font-size: 19px;
}
.hubu-import-button:disabled {
  border-color: #cbd3c8;
  background: #e4e8e1;
  box-shadow: none;
  color: #7e887d;
  cursor: not-allowed;
}
.hubu-import-button > i {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,.45);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
.hubu-browser-link {
  justify-self: center;
  color: #4e7055;
  font-size: 12px;
  font-weight: 760;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.privacy-note {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0;
  color: #607064;
  font-size: 11px;
  line-height: 1.55;
}
.privacy-note span {
  display: grid;
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: #d8ead8;
  color: #42694b;
  font-size: 10px;
  font-weight: 900;
}
.upload-sheet { display: grid; gap: 14px; }
.upload-sheet > header,
.list-heading { display: flex; align-items: center; gap: 10px; }
.upload-sheet > header > span,
.list-heading > span { display: grid; width: 40px; height: 40px; flex: 0 0 auto; place-items: center; border-radius: 50%; background: var(--fresh-mint); color: #507156; font-family: ui-monospace, monospace; font-size: 12px; font-weight: 900; }
.upload-sheet h2,
.list-heading h2 { margin: 0; color: var(--fresh-ink); font-size: 18px; }
.upload-sheet header p,
.list-heading p { margin: 3px 0 0; color: var(--fresh-muted); font-size: 12px; }
.list-heading p b { color: #86552f; }

.file-picker { display: grid; grid-template-columns: auto minmax(0,1fr) auto; min-height: 88px; align-items: center; gap: 12px; border: 1px dashed var(--fresh-line-strong); border-radius: 19px; background: var(--fresh-bg); cursor: pointer; padding: 13px; transition: background 360ms ease, border-color 360ms ease, transform 360ms ease; }
.file-picker.selected { border-style: solid; border-color: #a9c3a5; background: var(--fresh-mint); }
.file-picker input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.file-icon { display: grid; width: 43px; height: 43px; place-items: center; border-radius: 50% 50% 42% 50%; background: var(--fresh-mint); color: #4f7457; font-size: 22px; font-weight: 800; }
.file-picker > span:nth-of-type(2) { display: grid; min-width: 0; gap: 4px; }
.file-picker strong { color: var(--fresh-ink); font-size: 14px; overflow-wrap: anywhere; }
.file-picker small { color: var(--fresh-muted); font-size: 12px; }
.file-picker > b { border-radius: var(--radius-pill); background: var(--fresh-paper); color: var(--fresh-green-dark); font-size: 12px; padding: 8px 10px; }
.capture-source {
  overflow: hidden;
  color: var(--fresh-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-button,
.commit-sheet button,
.success-sheet button { display: inline-flex; min-height: 48px; align-items: center; justify-content: center; gap: 9px; border: 1px solid var(--fresh-green); border-radius: var(--radius-sm); background: #608966; color: #fff; cursor: pointer; font-size: 14px; font-weight: 800; padding: 0 17px; }
.preview-button:disabled,
.commit-sheet button:disabled {
  border-color: var(--fresh-line);
  background: var(--disabled-surface);
  color: var(--disabled-text);
  opacity: 1;
  cursor: not-allowed;
}
.preview-button i,
.commit-sheet button i { width: 16px; height: 16px; flex: 0 0 auto; border: 2px solid rgba(255,255,255,.45); border-top-color: currentColor; border-radius: 50%; animation: spin 1s linear infinite; }

.candidate-list { display: grid; gap: 14px; }
.list-heading { padding: 4px 3px; }
.candidate-preview {
  display: grid;
  gap: 14px;
  border: 1px solid var(--fresh-line);
  border-radius: 22px;
  background: var(--fresh-paper);
  box-shadow: 0 12px 28px rgba(59, 79, 57, .07);
  padding: 17px;
  transition: border-color 240ms ease, box-shadow 240ms ease;
}
.candidate-preview.has-error {
  border-color: #dfad9f;
  background: linear-gradient(145deg, var(--fresh-paper), #fff8f5);
}
.candidate-preview.is-highlighted {
  border-color: #ba6f5d;
  box-shadow: 0 0 0 3px rgba(186, 111, 93, .14), 0 14px 32px rgba(86, 55, 48, .11);
}
.candidate-preview.is-excluded {
  border-style: dashed;
  border-color: #b9c5b6;
  background: #f2f4ed;
  box-shadow: none;
}
.candidate-preview > header {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 11px;
}
.candidate-preview > header > span {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: var(--fresh-mint);
  color: var(--fresh-green-dark);
  font-family: ui-monospace, monospace;
  font-size: 12px;
  font-weight: 900;
}
.candidate-preview > header > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.candidate-preview > header strong {
  color: var(--fresh-ink);
  font-size: 16px;
  overflow-wrap: anywhere;
}
.candidate-preview > header small {
  color: var(--fresh-muted);
  font-size: 12px;
  line-height: 1.5;
}
.candidate-exclusion {
  min-height: 42px;
  flex: 0 0 auto;
  border: 1px solid #d5a89d;
  border-radius: 13px;
  background: #fff7f4;
  color: #884a40;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  padding: 0 12px;
}
.candidate-exclusion.restore {
  border-color: var(--fresh-line-strong);
  background: var(--fresh-paper);
  color: var(--fresh-green-dark);
}
.excluded-note {
  margin: 0;
  border-radius: 13px;
  background: #e4eadf;
  color: #49614d;
  font-size: 12px;
  font-weight: 750;
  line-height: 1.55;
  padding: 10px 12px;
}
.candidate-preview dl {
  display: grid;
  grid-template-columns: minmax(120px, .6fr) minmax(0, 1.4fr);
  gap: 9px;
  margin: 0;
}
.candidate-preview dl > div {
  display: grid;
  min-width: 0;
  gap: 4px;
  border-radius: 14px;
  background: var(--fresh-bg);
  padding: 11px 12px;
}
.candidate-preview dt {
  color: var(--fresh-muted);
  font-size: 11px;
}
.candidate-preview dd {
  margin: 0;
  color: var(--fresh-ink);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.location-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  border-radius: 13px;
  background: #f4f1e7;
  color: #667065;
  font-size: 12px;
  line-height: 1.6;
  padding: 10px 12px;
}
.location-note span {
  display: grid;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: #dce9d8;
  color: #476a4d;
  font-family: ui-serif, serif;
  font-size: 11px;
  font-weight: 900;
}
.candidate-issues {
  display: grid;
  gap: 6px;
  margin: 0;
  border-radius: 13px;
  background: var(--cm-red-soft);
  color: #7c3c32;
  font-size: 12px;
  line-height: 1.55;
  padding: 10px 12px 10px 29px;
}
.page-error { border: 1px solid #e1b0a3; border-radius: 16px; background: var(--cm-red-soft); color: #7c3c32; font-size: 13px; line-height: 1.6; margin: 0; padding: 12px 14px; }

.commit-sheet { display: grid; grid-template-columns: minmax(0,1fr) minmax(220px,.65fr); align-items: center; gap: 14px; background: var(--fresh-mint); }
.commit-sheet strong { color: #35503b; font-size: 15px; }
.commit-sheet p { margin: 5px 0 0; color: var(--fresh-text); font-size: 12px; line-height: 1.55; }

.success-sheet { display: grid; justify-items: center; text-align: center; padding: 34px 20px; }
.success-sheet > span { display: grid; width: 58px; height: 58px; place-items: center; border-radius: 50%; background: var(--fresh-mint); color: var(--fresh-green-dark); font-size: 25px; font-weight: 900; animation: success-arrive 700ms cubic-bezier(.2,.9,.2,1) both; }
.success-sheet h2 { margin: 15px 0 5px; color: var(--fresh-ink); font-size: 21px; }
.success-sheet p { margin: 0 0 18px; color: var(--fresh-text); font-size: 13px; }
.skipped-import-summary {
  width: min(100%, 560px);
  margin: 0 0 18px;
  border: 1px solid #dfc6a3;
  border-radius: 16px;
  background: #fff8e9;
  color: var(--fresh-ink);
  padding: 14px;
  text-align: left;
}
.skipped-import-summary > strong { color: #7b5325; font-size: 14px; }
.success-sheet .skipped-import-summary > p { margin: 5px 0 10px; line-height: 1.55; }
.skipped-import-summary ul { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.skipped-import-summary li { display: grid; gap: 2px; border-top: 1px solid rgba(123,83,37,.16); padding-top: 8px; }
.skipped-import-summary li b { font-size: 13px; }
.skipped-import-summary li span { color: #725e45; font-size: 12px; line-height: 1.5; }
.success-sheet button { min-width: 190px; }

@keyframes paper-breathe { 0%,100% { transform: translateY(0) rotate(1deg); } 50% { transform: translateY(-8px) rotate(-1deg); } }
@keyframes leaf-sway { 0%,100% { rotate: 0deg; } 50% { rotate: 8deg; } }
@keyframes paper-read { 0%,100% { transform: rotate(0); } 50% { transform: rotate(-5deg) translateX(-4px); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes success-arrive { from { opacity: 0; transform: scale(.65) rotate(-18deg); } to { opacity: 1; transform: scale(1) rotate(0); } }

@media (hover: hover) and (pointer: fine) {
  .file-picker:hover { border-color: #799c79; background: var(--fresh-mint); transform: translateY(-2px); }
  .preview-button:not(:disabled):hover,
  .commit-sheet button:not(:disabled):hover,
  .success-sheet button:hover,
  .hubu-import-button:not(:disabled):hover {
    background: var(--fresh-green);
    transform: translateY(-2px);
  }
}

@media (max-width: 580px) {
  .import-hero { grid-template-columns: minmax(0,1fr) 105px; min-height: 235px; padding: 22px 18px; }
  .paper-garden { width: 105px; transform: scale(.74); transform-origin: center; }
  .commit-sheet { grid-template-columns: 1fr; }
  .hubu-import-steps { grid-template-columns: 1fr; }
  .hubu-import-steps li { grid-template-columns: auto minmax(0,1fr); }
  .candidate-preview dl { grid-template-columns: 1fr; }
  .candidate-preview > header { flex-wrap: wrap; }
  .candidate-exclusion { margin-left: 49px; }
}

@media (max-width: 390px) {
  .import-hero { grid-template-columns: 1fr; padding-right: 95px; }
  .paper-garden { position: absolute; right: -7px; bottom: -15px; }
  .file-picker { grid-template-columns: auto minmax(0,1fr); }
  .file-picker > b { grid-column: 1 / -1; justify-self: stretch; text-align: center; }
  .hubu-import-sheet > header { grid-template-columns: auto minmax(0,1fr); }
  .hubu-import-sheet header > b { grid-column: 1 / -1; justify-self: start; margin-left: 51px; }
}

@media (prefers-reduced-motion: reduce) {
  .paper-garden,
  .paper-garden b,
  .paper-garden.busy .paper-front,
  .hubu-import-button > i,
  .preview-button i,
  .commit-sheet button i,
  .success-sheet > span { animation: none; }
}
</style>
