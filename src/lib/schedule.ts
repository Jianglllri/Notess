import type { Note } from '../types';
import { DEFAULT_REPO, encodeNote, decodeNote } from './github';
export const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
export function nextCheck(saved: string | null, now: number) {
  const value = Number(saved);
  return saved && Number.isFinite(value) && value > 0 ? value : now + TWO_DAYS;
}
export function needsUpload(note: Note, destination=note.github?.url || DEFAULT_REPO) {

  const g = note.github;
  if (note.deletedAt && (!g || g.url.toLowerCase() !== destination.toLowerCase() || g.format !== 'md')) return false;
  if (!g || g.url.toLowerCase() !== destination.toLowerCase() || g.format !== 'md') return true;
  if (g.baseSnapshot !== undefined) { const baseline=decodeNote(g.baseSnapshot,g.path); return encodeNote({...note,visibility:note.visibility || 'public'}) !== encodeNote({...baseline,visibility:baseline.visibility || 'public',pinned:baseline.pinned ?? false,folderPath:baseline.folderPath ?? note.folderPath}); }
  if (note.deletedAt) return true;
  return g.baseContent === undefined || note.content !== g.baseContent || (!note.sourceUrl && Date.parse(note.updatedAt) > Date.parse(g.syncedAt) + 1000);
}

/** Source links are provenance, not evidence of a cloud copy. */
export function needsDeletionSync(note: Note): boolean {
  return !!note.deletedAt && !!note.github && note.github.format === 'md' && needsUpload(note, note.github.url);
}
