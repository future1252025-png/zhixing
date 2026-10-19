<script setup lang="ts">
import { useRouter } from 'vue-router'
import SemesterSettingsPanel from '@/components/course/SemesterSettingsPanel.vue'
import CourseTimeSettingsPanel from '@/components/course/CourseTimeSettingsPanel.vue'
import { useKeyboardAwarePage } from '@/utils/keyboardInset'
import { goBack } from '@/utils/navigation'

const router = useRouter()
const { pageStyle, onFieldFocus } = useKeyboardAwarePage({ basePaddingPx: 95 })
</script>

<template>
  <section class="page semester-settings-page">
    <van-nav-bar title="学期设置" left-arrow @click-left="goBack(router, '/profile')" />
    <main class="page-content" :style="pageStyle" @focusin="onFieldFocus">
      <SemesterSettingsPanel />
      <CourseTimeSettingsPanel />
    </main>
  </section>
</template>
