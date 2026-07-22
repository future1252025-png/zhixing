<script setup lang="ts">
defineProps<{
  filename: string
  total: number
  resolved: number
  unresolved: number
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
      <span><small>已解决</small><b>{{ resolved }}</b></span>
      <span :class="{ warning: unresolved }"><small>待处理</small><b>{{ unresolved }}</b></span>
      <span :class="{ danger: conflicts }"><small>冲突</small><b>{{ conflicts }}</b></span>
    </div>
    <p v-if="ready"><i aria-hidden="true">✓</i> 全部校验通过，可以整批导入</p>
    <p v-else><i aria-hidden="true">!</i> 请处理所有标记项后再导入</p>
  </section>
</template>

<style scoped>
.import-summary {
  display: grid;
  gap: 14px;
  border: 1px solid #e1c99d;
  border-radius: 24px;
  background: #fff8e8;
  box-shadow: 0 14px 34px rgba(75, 77, 54, .08);
  padding: 17px;
}
.import-summary.ready { border-color: #bdd2b8; background: #f1f7ed; }
.import-summary header { display: flex; min-width: 0; align-items: center; gap: 10px; }
.import-summary header > span { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border-radius: 50%; background: #eed6a5; color: #725522; font-weight: 900; }
.import-summary.ready header > span { background: #cfe2c8; color: #3f6745; }
.import-summary header div { display: grid; min-width: 0; gap: 2px; }
.import-summary header small { color: #687168; font-size: 12px; }
.import-summary header strong { color: #303e33; font-size: 15px; overflow-wrap: anywhere; }
.summary-numbers { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; }
.summary-numbers span { display: grid; gap: 2px; border-radius: 13px; background: rgba(255,255,255,.7); color: #5e685f; font-size: 11px; padding: 9px; }
.summary-numbers small { color: #5e685f; font-size: 11px; }
.summary-numbers b { color: #344a39; font-size: 19px; }
.summary-numbers .warning b { color: #8b5b17; }
.summary-numbers .danger b { color: #99483c; }
.import-summary p { display: flex; align-items: center; gap: 7px; margin: 0; color: #755421; font-size: 13px; font-weight: 800; line-height: 1.5; }
.import-summary.ready p { color: #3f6847; }
.import-summary p i { display: grid; width: 21px; height: 21px; flex: 0 0 auto; place-items: center; border-radius: 50%; background: currentColor; color: #fff; font-size: 11px; font-style: normal; }
@media (max-width: 520px) { .summary-numbers { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
