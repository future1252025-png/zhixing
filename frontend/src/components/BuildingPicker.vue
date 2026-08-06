<script setup lang="ts" generic="T extends SearchableBuilding">
import { computed, ref } from 'vue'

import {
  filterBuildingsByKeyword,
  includeSelectedBuilding,
  type SearchableBuilding
} from '@/utils/buildings'
import { getLocationDisplayInfo } from '@/utils/schedule'

const props = withDefaults(
  defineProps<{
    modelValue: number | null
    buildings: T[]
    placeholder?: string
    /** 弹层内的过滤实现；默认按名称/类型/描述模糊匹配，页面可注入自己的过滤函数 */
    filter?: (buildings: T[], keyword: string, limit: number) => T[]
    /** 过滤结果上限，避免超长列表拖慢弹层 */
    limit?: number
  }>(),
  {
    placeholder: '请选择建筑',
    filter: undefined,
    limit: 80
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
}>()

const show = ref(false)
const keyword = ref('')

const selectedBuilding = computed(
  () => props.buildings.find((building) => building.id === props.modelValue) ?? null
)
// 已选建筑即使被关键词过滤掉也保留在列表里，避免“选中的项凭空消失”
const visibleBuildings = computed(() => {
  const filterFn = props.filter ?? filterBuildingsByKeyword
  return includeSelectedBuilding(
    filterFn(props.buildings, keyword.value, props.limit),
    props.buildings,
    props.modelValue
  )
})

function displayTitle(building: T): string {
  return getLocationDisplayInfo(building).title
}

function displaySubtitle(building: T): string {
  return getLocationDisplayInfo(building).subtitle
}

function openSheet() {
  keyword.value = ''
  show.value = true
}

function closeSheet() {
  show.value = false
}

function selectBuilding(building: T) {
  emit('update:modelValue', building.id)
  show.value = false
}
</script>

<template>
  <div class="building-picker">
    <button
      type="button"
      class="picker-trigger"
      :aria-expanded="show"
      aria-haspopup="dialog"
      @click="openSheet"
    >
      <span class="trigger-text" :class="{ 'is-placeholder': !selectedBuilding }">
        {{ selectedBuilding ? displayTitle(selectedBuilding) : placeholder }}
      </span>
      <span class="trigger-caret" aria-hidden="true"></span>
    </button>

    <van-popup
      v-model:show="show"
      position="bottom"
      round
      teleport="body"
      safe-area-inset-bottom
    >
      <section class="picker-sheet" aria-label="选择建筑">
        <header class="sheet-head">
          <strong>选择建筑</strong>
          <button type="button" class="sheet-close" aria-label="关闭选择" @click="closeSheet">
            ×
          </button>
        </header>

        <label class="sheet-search">
          <span aria-hidden="true">⌕</span>
          <input
            v-model="keyword"
            type="search"
            placeholder="搜索名称、类型或描述"
            aria-label="搜索建筑"
          />
        </label>

        <p class="sheet-count" aria-live="polite">找到 {{ visibleBuildings.length }} 个地点</p>

        <ul v-if="visibleBuildings.length" class="sheet-list">
          <li v-for="building in visibleBuildings" :key="building.id">
            <button
              type="button"
              class="sheet-option"
              :class="{ active: building.id === modelValue }"
              :aria-pressed="building.id === modelValue"
              @click="selectBuilding(building)"
            >
              <span class="option-copy">
                <strong>{{ displayTitle(building) }}</strong>
                <small>{{ displaySubtitle(building) }}</small>
              </span>
              <i v-if="building.id === modelValue" aria-hidden="true">✓</i>
            </button>
          </li>
        </ul>
        <p v-else class="sheet-empty">没有找到匹配的建筑，换个关键词试试。</p>
      </section>
    </van-popup>
  </div>
</template>

<style scoped>
.building-picker {
  width: 100%;
}

.picker-trigger {
  display: flex;
  width: 100%;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--fresh-line);
  border-radius: var(--radius-sm);
  background: var(--fresh-paper-2);
  color: var(--fresh-ink);
  cursor: pointer;
  font-size: 16px;
  padding: 0 13px;
  text-align: left;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.picker-trigger:focus-visible {
  border-color: var(--fresh-green);
  box-shadow: 0 0 0 3px rgba(79, 125, 88, 0.13);
  outline: none;
}

.trigger-text {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-text.is-placeholder {
  color: var(--fresh-muted);
}

.trigger-caret {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-right: 2px solid var(--fresh-muted);
  border-bottom: 2px solid var(--fresh-muted);
  margin-top: -4px;
  transform: rotate(45deg);
  transition: transform 0.3s var(--fresh-spring);
}

.picker-trigger[aria-expanded='true'] .trigger-caret {
  margin-top: 4px;
  transform: rotate(-135deg);
}

.picker-sheet {
  display: grid;
  gap: 11px;
  max-height: 74vh;
  background: var(--fresh-paper);
  padding: 17px 16px 16px;
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.sheet-head strong {
  color: var(--fresh-ink);
  font-size: 17px;
  font-weight: 700;
}

.sheet-close {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 1px solid var(--fresh-line);
  border-radius: var(--radius-sm);
  background: var(--fresh-paper-2);
  color: var(--fresh-muted);
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
}

.sheet-search {
  position: relative;
  display: block;
}

.sheet-search span {
  position: absolute;
  top: 50%;
  left: 12px;
  color: var(--fresh-green);
  font-size: 19px;
  transform: translateY(-52%);
}

.sheet-search input {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--fresh-line);
  border-radius: var(--radius-sm);
  background: var(--fresh-paper-2);
  color: var(--fresh-ink);
  font: inherit;
  font-size: 16px;
  outline: none;
  padding: 0 12px 0 37px;
}

.sheet-search input:focus {
  border-color: var(--fresh-green);
  box-shadow: 0 0 0 3px rgba(79, 125, 88, 0.13);
}

.sheet-count {
  margin: 0;
  color: var(--fresh-muted);
  font-size: 12px;
}

.sheet-list {
  display: grid;
  gap: 7px;
  max-height: 46vh;
  margin: 0;
  overflow-y: auto;
  padding: 1px 1px 4px;
  list-style: none;
}

.sheet-option {
  display: flex;
  width: 100%;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--fresh-line);
  border-radius: var(--radius-sm);
  background: var(--fresh-paper);
  color: var(--fresh-ink);
  cursor: pointer;
  padding: 8px 12px;
  text-align: left;
}

.sheet-option.active {
  border-color: var(--fresh-green);
  background: var(--fresh-mint);
}

.option-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.option-copy strong {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.option-copy small {
  color: var(--fresh-muted);
  font-size: 12px;
  line-height: 1.5;
}

.sheet-option i {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: var(--fresh-green);
  color: var(--fresh-paper);
  font-size: 13px;
  font-style: normal;
  font-weight: 700;
}

.sheet-empty {
  margin: 0;
  border-radius: var(--radius-sm);
  background: var(--fresh-bg);
  color: var(--fresh-muted);
  font-size: 13px;
  line-height: 1.6;
  padding: 18px 14px;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .picker-trigger,
  .trigger-caret {
    transition: none;
  }
}
</style>
