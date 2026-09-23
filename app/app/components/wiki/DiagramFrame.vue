<script setup lang="ts">
import { useDiagramExport } from '~/composables/useDiagramExport'

/**
 * Wraps a diagram with the shared diagram controls (registered as
 * `WikiDiagramFrame`): a toolbar (`WikiDiagramToolbar`) at the top-right,
 * the diagram itself in a horizontal scroller, an optional caption, the
 * Expand dialog (`WikiDiagramDialog`) and PNG export (`useDiagramExport`).
 *
 * The default slot is rendered twice — inline, and again inside the dialog
 * when it opens — so it must be a pure function of its props (no state of
 * its own that would diverge between the two copies). The PNG is always
 * taken from the inline copy, which sits at its natural size inside
 * `.ufo-diagram-sheet` however far the page has it scrolled.
 */
const props = withDefaults(defineProps<{
  /** What the diagram is, e.g. "US Air Force org chart": dialog title, button names, file name. */
  label: string
  /** Short noun for the controls' accessible names ("Expand org chart"). */
  kind?: string
  caption?: string
}>(), {
  kind: 'diagram',
  caption: '',
})

const sheet = ref<HTMLElement | null>(null)
const expanded = ref(false)
const pageTitle = usePageTitle()

const exporter = useDiagramExport({
  target: () => sheet.value,
  title: () => pageTitle.value,
  label: () => props.label,
  caption: () => props.caption,
})
const busy = exporter.busy
</script>

<template>
  <figure class="ufo-diagram">
    <WikiDiagramToolbar
      class="ufo-diagram-bar"
      :label="props.kind"
      :busy="busy"
      @expand="expanded = true"
      @download="exporter.download"
      @view="exporter.view"
    />
    <div class="ufo-diagram-scroll">
      <div ref="sheet" class="ufo-diagram-sheet">
        <slot />
      </div>
    </div>
    <figcaption v-if="props.caption" class="ufo-diagram-caption">
      {{ props.caption }}
    </figcaption>
    <p v-if="exporter.error.value" class="ufo-diagram-error" role="alert">
      {{ exporter.error.value }}
    </p>

    <WikiDiagramDialog v-model:open="expanded" :title="props.label" :description="props.caption || undefined">
      <template #tools>
        <WikiDiagramToolbar
          :label="props.kind"
          :expandable="false"
          :busy="busy"
          @download="exporter.download"
          @view="exporter.view"
        />
      </template>
      <slot />
    </WikiDiagramDialog>
  </figure>
</template>

<style scoped>
.ufo-diagram {
  margin-block: 1.75rem;
}
.ufo-diagram-bar {
  margin-bottom: 8px;
}
.ufo-diagram-scroll {
  overflow-x: auto;
  padding-bottom: 8px;
}
/* Exactly the diagram's own size, centred while it fits; when it doesn't,
   it overflows the scroller rather than shrinking, and the export still
   sees all of it. */
.ufo-diagram-sheet {
  width: max-content;
  margin-inline: auto;
}
.ufo-diagram-caption {
  margin-top: 10px;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 20px;
  color: hsl(var(--muted-foreground));
}
.ufo-diagram-error {
  margin-top: 6px;
  font-family: var(--font-sans);
  font-size: 12px;
  color: hsl(var(--destructive));
}
</style>
