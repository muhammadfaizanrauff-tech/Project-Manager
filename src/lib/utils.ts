import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Merge a row into a list keyed by id, replacing any entry already there.
 *
 * Creating a task or category produces the same row twice: once as the
 * action's return value, once as the Realtime INSERT that the same write
 * broadcasts. Either can land first — the action does extra work (audit,
 * revalidate) after its insert, so Realtime frequently wins. Appending
 * unconditionally on whichever path arrives second puts two entries with one
 * shared id into the list, which is what React keys on and what a
 * delete-by-id then removes both of.
 *
 * Every optimistic insert goes through here so the second arrival overwrites
 * rather than duplicates.
 */
export function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  const index = list.findIndex((item) => item.id === row.id)
  if (index === -1) return [...list, row]
  const next = [...list]
  next[index] = row
  return next
}
