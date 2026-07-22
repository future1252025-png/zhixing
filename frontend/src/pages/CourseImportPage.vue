<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { showFailToast } from 'vant'
import { useRouter } from 'vue-router'

import { getBuildings, type Building } from '@/api/buildings'
import { commitCourseImport, previewCourseImport } from '@/api/courses'
import { extractBusinessError } from '@/api/errors'
import ImportCandidateCard from '@/components/import/ImportCandidateCard.vue'
import ImportSummary from '@/components/import/ImportSummary.vue'
import type {
  ImportCandidate,
  ImportIssue,
  ImportPreviewResponse,
  ImportResolution,
  ImportResolutionDraft
} from '@/types/courseImport'
import { useKeyboardAwarePage } from '@/utils/keyboardInset'

type ImportPageState =
  | 'idle'
  | 'previewing'
  | 'needs_resolution'
  | 'ready'
  | 'committing'
  | 'success'
  | 'failed'

const LOCATION_ERROR_CODES = new Set(['building_unrecognized', 'room_missing'])
const LOCATION_PLACEHOLDERS = new Set(['待确认教室', '待确认', '未知', '暂无'])

const router = useRouter()
const buildings = ref<Building[]>([])
const selectedFile = ref<File | null>(null)
const preview = ref<ImportPreviewResponse | null>(null)
const resolutions = ref<Record<string, ImportResolutionDraft>>({})
const serverIssues = ref<Record<string, ImportIssue[]>>({})
const highlightedRowRefs = ref<string[]>([])
const state = ref<ImportPageState>('idle')
const errorMessage = ref('')
const createdCount = ref(0)
const { pageStyle, onFieldFocus } = useKeyboardAwarePage({ basePaddingPx: 34 })

const candidates = computed(() => preview.value?.candidates ?? [])
const resolvedCount = computed(() =>
  candidates.value.filter((candidate) => isCandidateResolved(candidate)).length
)
const unresolvedCount = computed(() => candidates.value.length - resolvedCount.value)
const conflictCount = computed(() =>
  Object.values(serverIssues.value).filter((issues) =>
    issues.some((issue) => issue.code === 'course_conflict')
  ).length
)
const canCommit = computed(() =>
  Boolean(
    selectedFile.value &&
      preview.value &&
      candidates.value.length > 0 &&
      unresolvedCount.value === 0
  )
)
const isBusy = computed(() => state.value === 'previewing' || state.value === 'committing')

function hasParsedCourse(candidate: ImportCandidate): boolean {
  return Boolean(
    candidate.course_name &&
      candidate.weekday &&
      candidate.start_time &&
      candidate.end_time &&
      candidate.weeks
  )
}

function hasBlockingSourceIssue(candidate: ImportCandidate): boolean {
  return candidate.errors.some((issue) => !LOCATION_ERROR_CODES.has(issue.code))
}

function isConfirmedRoom(roomName: string): boolean {
  const room = roomName.trim()
  return room.length > 0 && room.length <= 120 && !LOCATION_PLACEHOLDERS.has(room)
}

function isCandidateResolved(candidate: ImportCandidate): boolean {
  const resolution = resolutions.value[candidate.row_ref]
  return Boolean(
    hasParsedCourse(candidate) &&
      !hasBlockingSourceIssue(candidate) &&
      resolution?.building_id &&
      buildings.value.some((building) => building.id === resolution.building_id) &&
      isConfirmedRoom(resolution.room_name)
  )
}

function syncResolutionState() {
  if (!preview.value || state.value === 'previewing' || state.value === 'committing') return
  if (state.value === 'success') return
  state.value = canCommit.value ? 'ready' : 'needs_resolution'
}

function resetPreview() {
  preview.value = null
  resolutions.value = {}
  serverIssues.value = {}
  highlightedRowRefs.value = []
  errorMessage.value = ''
  createdCount.value = 0
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
  resetPreview()
  state.value = 'idle'
}

function buildInitialResolutions(result: ImportPreviewResponse) {
  resolutions.value = Object.fromEntries(
    result.candidates.map((candidate) => [
      candidate.row_ref,
      {
        building_id: candidate.suggested_building_id,
        room_name: candidate.suggested_room_name ?? ''
      }
    ])
  )
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
    buildInitialResolutions(result)
    if (result.candidates.length === 0) {
      errorMessage.value = '文件中没有识别到课程，请检查文件内容。'
      state.value = 'failed'
      return
    }
    syncResolutionState()
  } catch (error) {
    errorMessage.value = extractBusinessError(error).message
    state.value = 'failed'
    showFailToast(errorMessage.value)
  }
}

function updateResolution(rowRef: string, resolution: ImportResolutionDraft) {
  resolutions.value = { ...resolutions.value, [rowRef]: resolution }
  if (serverIssues.value[rowRef]) {
    const { [rowRef]: _removed, ...remaining } = serverIssues.value
    serverIssues.value = remaining
    highlightedRowRefs.value = highlightedRowRefs.value.filter((item) => item !== rowRef)
    if (Object.keys(remaining).length === 0) errorMessage.value = ''
  }
  syncResolutionState()
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

function buildCommitResolutions(): ImportResolution[] {
  return candidates.value.map((candidate) => {
    const resolution = resolutions.value[candidate.row_ref]!
    return {
      row_ref: candidate.row_ref,
      building_id: Number(resolution.building_id),
      room_name: resolution.room_name.trim()
    }
  })
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
      buildCommitResolutions()
    )
    createdCount.value = result.created_count
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

async function loadBuildings() {
  try {
    buildings.value = await getBuildings()
  } catch (error) {
    errorMessage.value = extractBusinessError(error).message
    state.value = 'failed'
  }
}

onMounted(loadBuildings)
</script>

<template>
  <section class="page course-import-page">
    <van-nav-bar title="导入课表" left-arrow @click-left="router.push('/courses')" />

    <main class="page-content import-content" :style="pageStyle" @focusin="onFieldFocus">
      <header v-reveal="{ from: 'left', distance: 36, stagger: 60 }" class="import-hero">
        <div>
          <span class="eyebrow">保留文件里的每一个字</span>
          <h1>先核对原文，再整批导入</h1>
          <p>文件内容保持只读。你只需要确认建筑和完整教室，最后一次提交全部课程。</p>
        </div>
        <div class="paper-garden" :class="{ busy: isBusy }" aria-hidden="true">
          <span class="paper paper-back"></span>
          <span class="paper paper-front"><i></i><i></i><i></i></span>
          <b></b><b></b>
        </div>
      </header>

      <section v-reveal="{ from: 'right', distance: 30, delay: 60 }" class="upload-sheet">
        <header>
          <span>01</span>
          <div><h2>选择原始课表</h2><p>支持 HTM / HTML / XLS / XLSX</p></div>
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
            <small>{{ selectedFile ? '原文件会原样用于最终提交' : '单个文件不超过 10MB' }}</small>
          </span>
          <b>{{ selectedFile ? '更换' : '浏览' }}</b>
        </label>
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
        <h2>{{ createdCount }} 门课程已完整导入</h2>
        <p>原始文件、逐行来源和完整地点都已保存。</p>
        <button type="button" data-testid="view-courses" @click="router.push('/courses')">
          查看我的课表
        </button>
      </section>

      <template v-else-if="preview">
        <ImportSummary
          v-reveal="{ from: 'left', distance: 30 }"
          :filename="preview.file.filename"
          :total="candidates.length"
          :resolved="resolvedCount"
          :unresolved="unresolvedCount"
          :conflicts="conflictCount"
          :ready="canCommit"
        />

        <p v-if="errorMessage" class="page-error" role="alert">{{ errorMessage }}</p>

        <section class="candidate-list" aria-label="逐行确认课程">
          <div class="list-heading">
            <span>02</span>
            <div><h2>逐行核对</h2><p>上半部分是只读原文，下半部分才是执行映射。</p></div>
          </div>
          <ImportCandidateCard
            v-for="(candidate, index) in candidates"
            :key="candidate.row_ref"
            v-reveal="{
              from: index % 2 ? 'right' : 'left',
              distance: 32,
              delay: Math.min(index * 65, 260)
            }"
            :candidate="candidate"
            :buildings="buildings"
            :resolution="resolutions[candidate.row_ref]!"
            :index="index"
            :server-issues="serverIssues[candidate.row_ref] ?? []"
            :highlighted="highlightedRowRefs.includes(candidate.row_ref)"
            @update:resolution="updateResolution(candidate.row_ref, $event)"
          />
        </section>

        <footer class="commit-sheet">
          <div>
            <strong v-if="canCommit">全部课程已经可以安全导入</strong>
            <strong v-else>还有 {{ unresolvedCount }} 门课程需要处理</strong>
            <p>提交时会重新解析同一份原文件；任一课程失败，整批都不会写入。</p>
          </div>
          <button
            type="button"
            data-testid="commit-import"
            :disabled="!canCommit || state === 'committing'"
            @click="commitImport"
          >
            <i v-if="state === 'committing'" aria-hidden="true"></i>
            <span>{{ state === 'committing' ? '正在整批校验并导入' : `一次导入 ${candidates.length} 门课程` }}</span>
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
  background: radial-gradient(circle at 90% 2%, #f7e7bd 0, transparent 34%), linear-gradient(145deg, #f4f5df, #e6f0df 70%);
  box-shadow: 0 22px 52px rgba(68, 94, 66, .12);
  padding: 28px;
}
.import-hero::after { position: absolute; right: -70px; bottom: -95px; width: 270px; height: 190px; border-radius: 50%; background: rgba(112,158,118,.1); content: ""; }
.import-hero > div:first-child { position: relative; z-index: 2; }
.eyebrow { display: inline-flex; border-radius: 999px; background: rgba(255,255,255,.72); color: #58715b; font-size: 12px; font-weight: 800; padding: 7px 11px; }
.import-hero h1 { max-width: 440px; margin: 15px 0 10px; color: #2d4534; font-size: clamp(29px, 7vw, 43px); letter-spacing: -.05em; line-height: 1.12; }
.import-hero p { max-width: 470px; margin: 0; color: #657268; font-size: 13px; line-height: 1.75; }

.paper-garden { position: relative; z-index: 1; width: 160px; height: 172px; animation: paper-breathe 5.2s ease-in-out infinite; }
.paper { position: absolute; width: 112px; height: 143px; border-radius: 10px 18px 18px 10px; }
.paper-back { top: 12px; left: 33px; background: #dbb983; transform: rotate(10deg); }
.paper-front { top: 2px; left: 17px; background: repeating-linear-gradient(180deg, transparent 0 26px, rgba(105,146,108,.12) 27px 28px), #fffdf7; box-shadow: inset 8px 0 #ead7a9, 0 14px 30px rgba(67,83,61,.15); }
.paper-front i { display: block; width: 61px; height: 5px; margin: 26px 0 -10px 30px; border-radius: 8px; background: #a9c7a2; }
.paper-front i:nth-child(2) { width: 43px; background: #e8bf79; }
.paper-front i:nth-child(3) { width: 67px; background: #9fc4c7; }
.paper-garden b { position: absolute; right: 2px; bottom: 2px; width: 32px; height: 54px; border-radius: 90% 8% 90% 10%; background: #739c70; transform: rotate(27deg); transform-origin: bottom; animation: leaf-sway 4s ease-in-out infinite; }
.paper-garden b:last-child { right: 31px; bottom: -5px; width: 25px; height: 43px; background: #a8bd75; transform: rotate(-13deg); animation-delay: .6s; }
.paper-garden.busy .paper-front { animation: paper-read 1.45s ease-in-out infinite; }

.upload-sheet,
.success-sheet,
.commit-sheet {
  border: 1px solid #dce6d7;
  border-radius: 26px;
  background: #fffdf8;
  box-shadow: 0 16px 38px rgba(59,79,57,.08);
  padding: 18px;
}
.upload-sheet { display: grid; gap: 14px; }
.upload-sheet > header,
.list-heading { display: flex; align-items: center; gap: 10px; }
.upload-sheet > header > span,
.list-heading > span { display: grid; width: 40px; height: 40px; flex: 0 0 auto; place-items: center; border-radius: 50%; background: #e6efdf; color: #507156; font-family: ui-monospace, monospace; font-size: 12px; font-weight: 900; }
.upload-sheet h2,
.list-heading h2 { margin: 0; color: #314235; font-size: 18px; }
.upload-sheet header p,
.list-heading p { margin: 3px 0 0; color: #667168; font-size: 12px; }

.file-picker { display: grid; grid-template-columns: auto minmax(0,1fr) auto; min-height: 88px; align-items: center; gap: 12px; border: 1px dashed #b9cbb4; border-radius: 19px; background: #f5f8ef; cursor: pointer; padding: 13px; transition: background 360ms ease, border-color 360ms ease, transform 360ms ease; }
.file-picker.selected { border-style: solid; border-color: #a9c3a5; background: #edf5e8; }
.file-picker input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.file-icon { display: grid; width: 43px; height: 43px; place-items: center; border-radius: 50% 50% 42% 50%; background: #d8e7d1; color: #4f7457; font-size: 22px; font-weight: 800; }
.file-picker > span:nth-of-type(2) { display: grid; min-width: 0; gap: 4px; }
.file-picker strong { color: #304236; font-size: 14px; overflow-wrap: anywhere; }
.file-picker small { color: #657068; font-size: 12px; }
.file-picker > b { border-radius: 999px; background: #fffdf8; color: #48664d; font-size: 12px; padding: 8px 10px; }

.preview-button,
.commit-sheet button,
.success-sheet button { display: inline-flex; min-height: 48px; align-items: center; justify-content: center; gap: 9px; border: 1px solid #547d59; border-radius: 14px; background: #608966; color: #fff; cursor: pointer; font-size: 14px; font-weight: 850; padding: 0 17px; }
.preview-button:disabled,
.commit-sheet button:disabled {
  border-color: #d8ded4;
  background: var(--disabled-surface);
  color: var(--disabled-text);
  opacity: 1;
  cursor: not-allowed;
}
.preview-button i,
.commit-sheet button i { width: 16px; height: 16px; flex: 0 0 auto; border: 2px solid rgba(255,255,255,.45); border-top-color: currentColor; border-radius: 50%; animation: spin 1s linear infinite; }

.candidate-list { display: grid; gap: 14px; }
.list-heading { padding: 4px 3px; }
.page-error { border: 1px solid #e1b0a3; border-radius: 16px; background: #fff0eb; color: #7c3c32; font-size: 13px; line-height: 1.6; margin: 0; padding: 12px 14px; }

.commit-sheet { display: grid; grid-template-columns: minmax(0,1fr) minmax(220px,.65fr); align-items: center; gap: 14px; background: #eef5e9; }
.commit-sheet strong { color: #35503b; font-size: 15px; }
.commit-sheet p { margin: 5px 0 0; color: #606c63; font-size: 12px; line-height: 1.55; }

.success-sheet { display: grid; justify-items: center; text-align: center; padding: 34px 20px; }
.success-sheet > span { display: grid; width: 58px; height: 58px; place-items: center; border-radius: 50%; background: #d8e9d2; color: #3d7048; font-size: 25px; font-weight: 900; animation: success-arrive 700ms cubic-bezier(.2,.9,.2,1) both; }
.success-sheet h2 { margin: 15px 0 5px; color: #2f4735; font-size: 21px; }
.success-sheet p { margin: 0 0 18px; color: #616d64; font-size: 13px; }
.success-sheet button { min-width: 190px; }

@keyframes paper-breathe { 0%,100% { transform: translateY(0) rotate(1deg); } 50% { transform: translateY(-8px) rotate(-1deg); } }
@keyframes leaf-sway { 0%,100% { rotate: 0deg; } 50% { rotate: 8deg; } }
@keyframes paper-read { 0%,100% { transform: rotate(0); } 50% { transform: rotate(-5deg) translateX(-4px); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes success-arrive { from { opacity: 0; transform: scale(.65) rotate(-18deg); } to { opacity: 1; transform: scale(1) rotate(0); } }

@media (hover: hover) and (pointer: fine) {
  .file-picker:hover { border-color: #799c79; background: #edf5e8; transform: translateY(-2px); }
  .preview-button:not(:disabled):hover,
  .commit-sheet button:not(:disabled):hover,
  .success-sheet button:hover { background: #507957; transform: translateY(-2px); }
}

@media (max-width: 580px) {
  .import-hero { grid-template-columns: minmax(0,1fr) 105px; min-height: 235px; padding: 22px 18px; }
  .paper-garden { width: 105px; transform: scale(.74); transform-origin: center; }
  .commit-sheet { grid-template-columns: 1fr; }
}

@media (max-width: 390px) {
  .import-hero { grid-template-columns: 1fr; padding-right: 95px; }
  .paper-garden { position: absolute; right: -7px; bottom: -15px; }
  .file-picker { grid-template-columns: auto minmax(0,1fr); }
  .file-picker > b { grid-column: 1 / -1; justify-self: stretch; text-align: center; }
}

@media (prefers-reduced-motion: reduce) {
  .paper-garden,
  .paper-garden b,
  .paper-garden.busy .paper-front,
  .preview-button i,
  .commit-sheet button i,
  .success-sheet > span { animation: none; }
}
</style>
