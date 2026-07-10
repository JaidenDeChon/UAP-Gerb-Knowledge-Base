import type { GraphPayload } from '#shared/types/wiki'
import { graph } from '#wiki-data'

export default defineEventHandler((): GraphPayload => graph)
