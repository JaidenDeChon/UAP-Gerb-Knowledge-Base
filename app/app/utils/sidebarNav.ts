import type { Component } from 'vue'
import {
  Atom,
  Building2,
  CalendarClock,
  Clapperboard,
  Compass,
  Crosshair,
  Earth,
  Folder,
  House,
  Lightbulb,
  MapPin,
  Radar,
  Users,
} from '@lucide/vue'
import { CATEGORY_ICON, type Category, type TreeFolder, type TreeItem } from '#shared/types/wiki'

/**
 * What the full sidebar tree (AppSidebarTree) and the collapsed icon rail
 * (AppSidebarRail) share: icons, labels and the active-route lookup. Kept in
 * one place so the two views of the same tree can't drift apart.
 */

const ICONS: Record<string, Component> = {
  'compass': Compass,
  'users': Users,
  'building-2': Building2,
  'crosshair': Crosshair,
  'calendar-clock': CalendarClock,
  'map-pin': MapPin,
  'atom': Atom,
  'clapperboard': Clapperboard,
  'lightbulb': Lightbulb,
}

/** Icon for a top-level section (People, Events, …). */
export function sectionIcon(item: TreeFolder): Component {
  return ICONS[CATEGORY_ICON[item.name as Category]] ?? Folder
}

/** Icon for a nested folder (a video's folder, or a plain folder). */
export function folderIcon(item: TreeFolder): Component {
  return item.id.startsWith('Videos/') ? Clapperboard : Folder
}

// The `MOCs` folder reads as an acronym; spell it out in the sidebar.
const FOLDER_LABEL: Record<string, string> = {
  MOCs: 'Maps of Content',
}

export function folderLabel(item: TreeFolder): string {
  return FOLDER_LABEL[item.id] ?? item.name
}

// The tree's leading `Home` (`/`), `Site map` (`/map`), `World map` (`/world`)
// and `Analyses` (`/analyses`) rows are app-wide nav, not vault content.
const NAV_ICON: Record<string, Component> = {
  '/': House,
  '/map': Radar,
  '/world': Earth,
  '/analyses': Lightbulb,
}

/** Icon for an app-wide nav row, or undefined for an ordinary note. */
export function navIcon(path: string): Component | undefined {
  return NAV_ICON[path]
}

/** Folder ids from the root down to the note at `target`, or null if it isn't in the tree. */
export function ancestorsOf(list: TreeItem[], target: string, trail: string[] = []): string[] | null {
  for (const item of list) {
    if (item.type === 'note') {
      if (item.path === target)
        return trail
    }
    else {
      const found = ancestorsOf(item.children, target, [...trail, item.id])
      if (found)
        return found
    }
  }
  return null
}
