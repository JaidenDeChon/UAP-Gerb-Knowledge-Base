<script setup lang="ts">
import {
  buildChain,
  CHAIN_KIND_LABEL,
  CHAIN_KIND_VERB,
  type ChainStepInput,
} from '@/utils/chain'

/**
 * `::wiki-chain` — a sequence of hand-offs: a chain of custody (the object
 * moved from A to B to C), of consequence (X led to Y led to Z), or of
 * transmission (how an account travelled from witness to print). Numbered
 * step cards down one vertical spine, each connector carrying its hand-off
 * label; a step can fork into lettered branches, which may rejoin.
 *
 * The spine is vertical at every width, so a sequence never wraps into rows
 * that could be misread as a grid. Only a fork's lanes sit side by side, and
 * only when they all fit on one row. Marked up as an ordered list (nested
 * lists for branches) so the order, connector labels and junction wording are
 * read out as text. Nothing animates, so there is nothing to switch off for
 * reduced motion.
 */
const props = withDefaults(
  defineProps<{
    /** custody | consequence | transmission. Sets the kicker and the arrows' unspoken verb. */
    kind?: string
    /** Overrides the kicker the kind sets, e.g. "Lineage" or "Chain of ownership". */
    label?: string
    steps?: ChainStepInput[]
    /** Optional caption under the chain. */
    caption?: string
    /** YouTube id; gates the cue chips, like `::wiki-timeline`'s `video`. */
    video?: string
    videoTitle?: string
  }>(),
  { kind: 'custody', label: '', steps: () => [], caption: '', video: '', videoTitle: '' },
)

const model = computed(() => buildChain(props.kind, props.steps))

const { refs } = useWikiResolve(() => model.value.names)

const kindLabel = computed(() => props.label.trim() || CHAIN_KIND_LABEL[model.value.kind])
</script>

<template>
  <figure v-if="model.items.length" class="ufo-chain" :class="`is-${model.kind}`">
    <p class="ufo-chain-kicker" aria-hidden="true">
      {{ kindLabel }}
    </p>
    <WikiChainSequence
      :items="model.items"
      :refs="refs"
      :verb="CHAIN_KIND_VERB[model.kind]"
      :label="props.caption ? `${kindLabel}: ${props.caption}` : kindLabel"
      :video="props.video"
      :video-title="props.videoTitle"
    />
    <figcaption v-if="props.caption" class="ufo-chain-caption">
      {{ props.caption }}
    </figcaption>
  </figure>
</template>

<style scoped>
.ufo-chain {
  container: chain / inline-size;
  margin: 1.75rem 0;
  /* Lines: --muted-foreground clears 3:1 as a non-text mark in every theme. */
  --chain-line: hsl(var(--muted-foreground));
  --chain-line-style: solid;
  /* Spine geometry, shared by every nested run and lane (ChainSequence.vue). */
  --chain-g: 2rem;
  --chain-x: calc(var(--chain-g) / 2);
  --chain-w: 2px;
  --chain-node: 22px;
  --chain-node-top: 9px;
  --lane-pad: 10px;
  --lane-gap: 10px;
  --bus-gap: 20px;
}
/* On a phone, give nested lanes back a little width. */
@media (max-width: 30rem) {
  .ufo-chain {
    --chain-g: 1.75rem;
    --lane-pad: 7px;
  }
}
/* An account passed by word of mouth gets a dashed line, a hand-off of an
   object or a consequence a solid one. The kicker says which in words. */
.ufo-chain.is-transmission {
  --chain-line-style: dashed;
}
.ufo-chain-kicker {
  margin: 0 0 8px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  line-height: 1.4;
  color: hsl(var(--muted-foreground));
}
.ufo-chain-caption {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
}
</style>
