<script setup lang="ts">
const localMapEnabled = useLocalMapEnabled()
</script>

<template>
  <aside class="flex h-full w-[280px] shrink-0 flex-col border-r border-border/50 bg-card">
    <!-- h-14 + border-b mirrors AppTopBar so the two header bottom borders align. -->
    <div class="flex h-14 shrink-0 items-center border-b border-border/50 px-4">
      <AppBrand />
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      <AppSidebarMaps />
      <AppSidebarTree />
    </div>

    <div class="border-t border-border/50 p-3">
      <div class="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        Appearance
      </div>
      <AppThemeSwitcher variant="block" />

      <button
        type="button"
        role="switch"
        :aria-checked="localMapEnabled"
        class="mt-2.5 flex w-full items-center justify-between gap-2 rounded-sm py-1 text-left"
        @click="localMapEnabled = !localMapEnabled"
      >
        <span class="font-sans text-sm text-foreground">Show local map on articles</span>
        <span
          class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-sm transition-colors duration-fast ease-standard"
          :class="localMapEnabled ? 'bg-primary' : 'bg-input'"
        >
          <span
            class="inline-block size-4 rounded-sm bg-background shadow-sm transition-transform duration-fast ease-standard"
            :class="localMapEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'"
          />
        </span>
      </button>
    </div>
  </aside>
</template>
