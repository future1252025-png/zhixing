<template>
  <section class="page">
    <van-nav-bar title="登录" />
    <div class="page-content">
      <van-cell-group inset>
        <van-cell title="账号登录" label="后续阶段接入用户名、密码和 JWT 登录流程。" />
      </van-cell-group>
      <div class="page-actions">
        <router-link to="/home">
          <van-button type="primary" block>进入首页</van-button>
        </router-link>
        <router-link to="/register">
          <van-button plain block>创建账号</van-button>
        </router-link>
      </div>
    </div>
  </section>
</template>
