<script setup lang="ts">
defineProps<{
  filename: string
  total: number
  resolved: number
  unresolved: number
  pending: number
  conflicts: number
  ready: boolean
}>()
</script>

<template>
  <section class="import-summary" :class="{ ready }" aria-live="polite">
    <header>
      <span aria-hidden="true">{{ ready ? '✓' : '…' }}</span>
      <div>
        <small>当前文件</small>
        <strong :title="filename">{{ filename }}</strong>
      </div>
    </header>
    <div class="summary-numbers">
      <span><small>识别总数</small><b>{{ total }}</b></span>
      <span><small>可导入</small><b>{{ resolved }}</b></span>
      <span :class="{ warning: unresolved }"><small>解析异常</small><b>{{ unresolved }}</b></span>
      <span :class="{ danger: conflicts }"><small>冲突</small><b>{{ conflicts }}</b></span>
    </div>
    <p v-if="ready && pending"><i aria-hidden="true">i</i> 可以整批导入；{{ pending }} 门课程之后可继续补全</p>
    <p v-else-if="ready"><i aria-hidden="true">✓</i> 核心排课信息完整，可以整批导入</p>
    <p v-else><i aria-hidden="true">!</i> 部分课程的时间等核心信息无法识别</p>
  </section>
</template>

<style scoped>
.import-summary {
  display: grid;
  gap: 14px;
  border: 1px solid #e1c99d;
  border-radius: 24px;
  background: var(--cm-amber-soft);
  box-shadow: 0 14px 34px rgba(75, 77, 54, .08);
  padding: 17px;
}
.import-summary.ready { border-color: var(--fresh-line-strong); background: var(--fresh-bg); }
.import-summary header { display: flex; min-width: 0; align-items: center; gap: 10px; }
.import-summary header > span { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border-radius: 50%; background: #eed6a5; color: #725522; font-weight: 900; }
.import-summary.ready header > span { background: #cfe2c8; color: var(--fresh-green-dark); }
.import-summary header div { display: grid; min-width: 0; gap: 2px; }
.import-summary header small { color: var(--fresh-muted); font-size: 12px; }
.import-summary header strong { color: var(--fresh-ink); font-size: 15px; overflow-wrap: anywhere; }
.summary-numbers { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; }
.summary-numbers span { display: grid; gap: 2px; border-radius: 13px; background: rgba(255,255,255,.7); color: var(--fresh-text); font-size: 11px; padding: 9px; }
.summary-numbers small { color: var(--fresh-text); font-size: 11px; }
.summary-numbers b { color: var(--fresh-ink); font-size: 19px; }
.summary-numbers .warning b { color: #8b5b17; }
.summary-numbers .danger b { color: #99483c; }
.import-summary p { display: flex; align-items: center; gap: 7px; margin: 0; color: #755421; font-size: 13px; font-weight: 800; line-height: 1.5; }
.import-summary.ready p { color: var(--fresh-green-dark); }
.import-summary p i { display: grid; width: 21px; height: 21px; flex: 0 0 auto; place-items: center; border-radius: 50%; background: currentColor; color: #fff; font-size: 11px; font-style: normal; }
@media (max-width: 520px) { .summary-numbers { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
