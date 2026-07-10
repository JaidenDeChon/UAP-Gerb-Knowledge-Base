<script setup lang="ts">
useThemeHead()

useHead({
  titleTemplate: (title) =>
    title ? `${title} · UAPGDB` : 'UAPGDB — UAP Gerb Knowledge Base',
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
