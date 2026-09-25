/**
 * Stands in for `three/webgpu` and `three/tsl` (aliased in nuxt.config).
 *
 * three-globe imports both at the top of its module, but only reaches them
 * from its WebGPU heatmap layer, which the `/world` globe never uses: it
 * draws its own density glow (`WorldGlobe.vue`, `drawHeat`). Without
 * the alias, the WebGPU build of three.js — over a megabyte of JavaScript —
 * ships to every visitor of the page and pushes the production build past
 * Node's default heap.
 */
export class StorageInstancedBufferAttribute {}

export class WebGPURenderer {
  constructor() {
    throw new Error('three/webgpu is stubbed out of this build (see app/lib/three-webgpu-stub.ts)')
  }
}
