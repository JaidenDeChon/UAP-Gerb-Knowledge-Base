/**
 * True while content that replaced the UFO loader is unblurring into view
 * (the veil AppLoadingMark drops on hand-off). Heavy page decoration, like the
 * video hero's node field, waits for it to clear before it even mounts, so it
 * neither pops in mid-transition nor competes with it for frames.
 */
export function useContentReveal() {
  return useState<boolean>('ufo:revealing', () => false)
}
