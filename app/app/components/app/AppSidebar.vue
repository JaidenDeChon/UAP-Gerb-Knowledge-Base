<template>
  <aside class="flex h-full w-[280px] shrink-0 flex-col border-r border-border/50 bg-card">
    <!-- h-14 + border-b mirrors AppTopBar so the two header bottom borders align. -->
    <div class="flex h-14 shrink-0 items-center border-b border-border/50 px-4">
      <AppBrand />
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      <AppSidebarTree />
    </div>

    <div class="border-t border-border/50 p-3">
      <div class="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        Appearance
      </div>
      <AppThemeSwitcher variant="block" />
    </div>
  </aside>
</template>
