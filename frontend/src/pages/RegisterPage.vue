<template>
  <section class="page">
    <van-nav-bar title="注册" left-arrow @click-left="$router.push('/login')" />
    <div class="page-content">
      <van-cell-group inset>
        <van-cell title="新用户注册" label="后续阶段接入用户名、昵称、学号和密码表单。" />
      </van-cell-group>
    </div>
  </section>
</template>
