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
  <div v-if="props.video" class="my-6 flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
    <Button size="sm" @click="dock.open({ videoId: props.video, title: props.title })">
      <Play class="size-3.5" />
      Watch here
    </Button>
    <p class="font-sans text-[13px] leading-5 text-muted-foreground">
      Opens a player you can move and resize. It keeps playing as you browse the wiki,
      and timestamps on this page jump straight to the moment.
    </p>
  </div>
</template>
