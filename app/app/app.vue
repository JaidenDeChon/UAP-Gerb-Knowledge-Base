<script setup lang="ts">
useThemeHead()

useHead({
  titleTemplate: (title) =>
    title ? `${title} · UAPGDB` : 'UAPGDB — UAP Gerb Knowledge Base',
})

// Social share card. The image (public/img/share-preview.png) is generated from
// scripts/share-preview.html via scripts/render-share-preview.mjs — same fonts,
// green accent, and knowledge-graph motif as the site itself.
//
// Absolute URL is derived from the incoming request origin rather than hardcoded,
// so og:image resolves on Netlify deploy previews, production, and localhost alike.
const origin = useRequestURL().origin
const shareImage = `${origin}/img/share-preview.png`
const shareTitle = 'UAP Gerb Knowledge Base'
const shareDescription =
  'A wiki of the topics, people, places, and events covered on the UAP Gerb YouTube channel.'

useSeoMeta({
  description: shareDescription,
  ogType: 'website',
  ogSiteName: 'UAP Gerb Knowledge Base',
  ogTitle: shareTitle,
  ogDescription: shareDescription,
  ogImage: shareImage,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageType: 'image/png',
  ogImageAlt: 'UAP Gerb Knowledge Base',
  twitterCard: 'summary_large_image',
  twitterTitle: shareTitle,
  twitterDescription: shareDescription,
  twitterImage: shareImage,
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
