<script setup lang="ts">
import { Play } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const props = withDefaults(
  defineProps<{ video?: string, title?: string }>(),
  { video: '', title: '' },
)

const dock = useVideoDock()
</script>

<template>
  <div v-if="props.video" class="my-6 inline-flex rounded-lg border border-border bg-muted/30 px-4 py-3">
    <Button size="sm" @click="dock.open({ videoId: props.video, title: props.title })">
      <Play class="size-3.5" />
      Open mini-player
    </Button>
  </div>
</template>
