import type { TreeItem } from '#shared/types/wiki'
import { tree } from '#wiki-data'

export default defineEventHandler((): TreeItem[] => tree)
