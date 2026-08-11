<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <section class="page privacy-page">
    <van-nav-bar title="隐私与数据说明" left-arrow @click-left="router.back()" />
    <main class="page-content privacy-content">
      <header class="privacy-hero">
        <span>你的数据，由你决定</span>
        <h1>智行如何使用信息</h1>
        <p>这里只收集完成课表、路线和校园频道功能所必需的信息。</p>
      </header>

      <section class="privacy-card">
        <h2>账号与课表</h2>
        <p>用户名、学号、昵称和课表保存在服务端，用于在不同设备恢复你的校园日程。</p>
        <p>重新导入课表会覆盖旧课表；删除账号会一并删除账号、课表、学期设置和刷新会话。</p>
      </section>

      <section class="privacy-card">
        <h2>定位</h2>
        <p>只有在你主动定位、规划路线或发送附近留言时才会请求系统定位权限。</p>
        <p>附近留言只保存核验后的距离，不在频道响应或数据库中保留本次精确坐标。</p>
      </section>

      <section class="privacy-card">
        <h2>校园频道</h2>
        <p>留言以“匿名同学”展示；其他用户无法从接口读取发言者身份、精确坐标或定位来源。</p>
        <p>请不要在留言中主动填写姓名、联系方式、宿舍号等敏感信息。</p>
      </section>

      <section class="privacy-card privacy-actions">
        <h2>你的选择</h2>
        <p>你可以拒绝定位权限并继续查看课表；也可以在“我的”页面永久删除账号和相关数据。</p>
        <router-link to="/profile">返回账号设置</router-link>
      </section>
    </main>
  </section>
</template>

<style scoped>
.privacy-page {
  min-height: 100dvh;
  background:
    radial-gradient(circle at 100% 0, rgba(111, 148, 116, 0.16), transparent 21rem),
    var(--fresh-bg);
}

.privacy-content {
  display: grid;
  gap: 16px;
  max-width: 720px;
  padding-bottom: calc(28px + env(safe-area-inset-bottom));
}

.privacy-hero,
.privacy-card {
  border: 1px solid rgba(79, 125, 88, 0.13);
  background: rgba(255, 254, 250, 0.94);
  box-shadow: var(--fresh-shadow-soft);
}

.privacy-hero {
  padding: 26px 24px;
  border-radius: 30px 30px 24px 30px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.56), transparent 48%),
    var(--fresh-mint);
}

.privacy-hero span {
  color: var(--fresh-green-dark);
  font-weight: 800;
  letter-spacing: 0.08em;
}

.privacy-hero h1 {
  margin: 8px 0 10px;
  color: var(--fresh-ink);
  font-size: clamp(27px, 7vw, 38px);
  line-height: 1.18;
}

.privacy-hero p,
.privacy-card p {
  margin: 0;
  color: var(--fresh-muted-dark, #536257);
  line-height: 1.75;
}

.privacy-card {
  padding: 21px 22px;
  border-radius: 24px 24px 20px 24px;
}

.privacy-card h2 {
  margin: 0 0 9px;
  color: var(--fresh-ink);
  font-size: 19px;
}

.privacy-card p + p {
  margin-top: 7px;
}

.privacy-actions a {
  display: inline-flex;
  min-height: 44px;
  margin-top: 14px;
  align-items: center;
  color: var(--fresh-green-dark);
  font-weight: 800;
}
</style>
