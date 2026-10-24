/**
 * Silent-pause detection and cutting for the phone editor. Detection is the editor's own
 * (AudioEngine.detectSilence on the clip's source audio, the same engine as the inspector's "Auto Cut
 * Silence"). Cutting uses clip/split + clip/rippleDelete through the EditingHost, so callers can group it
 * into one undo step. Like ripple delete in the UI, later clips on the same track move left; other
 * tracks are not moved.
 */
import { getAudioEngine, type Project } from "@openreel/core";
import type { EditingHost } from "@openreel/agent";

export interface SilenceOptions { thresholdDb: number; minSilenceSec: number; paddingSec: number }
export const SILENCE_DEFAULTS: SilenceOptions = { thresholdDb: -40, minSilenceSec: 0.5, paddingSec: 0.1 };
/** split_clip needs a cut strictly inside a clip; never leave slivers shorter than this. */
const EDGE = 0.05;

interface ClipTiming { startTime: number; duration: number; inPoint: number }
export interface Region { start: number; end: number }

/**
 * Silent source ranges → timeline ranges to remove inside one clip: clipped to the clip's source window,
 * shrunk by the padding (keeps a breath around speech), dropped when shorter than the minimum, and
 * snapped to the clip edges when they would leave a sliver. Sorted by start.
 */
export function silenceRegions(clip: ClipTiming, source: readonly Region[], opts: SilenceOptions): Region[] {
  const srcEnd = clip.inPoint + clip.duration;
  const clipEnd = clip.startTime + clip.duration;
  const out: Region[] = [];
  for (const r of source) {
    const s = Math.max(r.start, clip.inPoint);
    const e = Math.min(r.end, srcEnd);
    if (e <= s) continue;
    let start = clip.startTime + (s - clip.inPoint) + (s > clip.inPoint ? opts.paddingSec : 0);
    let end = clip.startTime + (e - clip.inPoint) - (e < srcEnd ? opts.paddingSec : 0);
    if (start - clip.startTime < EDGE) start = clip.startTime;
    if (clipEnd - end < EDGE) end = clipEnd;
    if (end - start < opts.minSilenceSec) continue;
    out.push({ start: round(start), end: round(end) });
  }
  return out.sort((a, b) => a.start - b.start);
}

const round = (n: number) => Math.round(n * 1000) / 1000;


function findClip(project: Project, clipId: string) {
  for (const track of project.timeline.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { clip, track };
  }
  return null;
}

async function decode(blob: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try { return await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { void ctx.close(); }
}

/** Timeline ranges of silence in a clip, or a reason it can't be analysed. */
export async function analyseSilence(project: Project, clipId: string, opts: SilenceOptions): Promise<{ regions: Region[]; clipEnd: number } | { error: string }> {
  const found = findClip(project, clipId);
  if (!found) return { error: "Clip ID was not found; use list_clips" };
  const { clip, track } = found;
  if (track.type !== "video" && track.type !== "audio") return { error: "Only video or audio clips have sound to analyse" };
  if ((clip.speed ?? 1) !== 1 || clip.reversed) return { error: "Cut silences before changing the clip's speed or reversing it" };
  const media = project.mediaLibrary.items.find((m) => m.id === clip.mediaId);
  if (!media?.blob) return { error: "The clip's media file is not available in this browser" };
  let buffer: AudioBuffer;
  try { buffer = await decode(media.blob); } catch { return { error: "This clip has no decodable audio" }; }
  const source = getAudioEngine().detectSilence(buffer, opts.thresholdDb);
  return { regions: silenceRegions(clip, source, opts), clipEnd: clip.startTime + clip.duration };
}



/** Removes timeline `regions` (sorted, inside `clipId`) with split + ripple delete. Returns an error or null. */
export async function applySilenceCuts(host: EditingHost, clipId: string, regions: readonly Region[]): Promise<string | null> {
  const act = (type: string, params: Record<string, unknown>) =>
    host.applyAction({ type, id: crypto.randomUUID(), timestamp: Date.now(), params });

  // Latest pause first: the left part of every split keeps the original ID, so each earlier pause
  // still lies inside `clipId`, and ripple deletes never shift a range we have yet to cut.
  for (const r of [...regions].reverse()) {
    const current = findClip(host.getProject(), clipId);
    if (!current) return "The clip disappeared while cutting";
    const { clip, track } = current;
    const end = clip.startTime + clip.duration;
    if (r.end < end - EDGE) {
      const split = await act("clip/split", { clipId, time: r.end });
      if (!split.success) return split.error?.message ?? "Split failed";
    }
    let silentId = clipId;
    if (r.start > clip.startTime + EDGE) {
      const split = await act("clip/split", { clipId, time: r.start });
      if (!split.success) return split.error?.message ?? "Split failed";
      const piece = host.getProject().timeline.tracks.find((t) => t.id === track.id)?.clips
        .find((c) => c.id !== clipId && Math.abs(c.startTime - r.start) < 0.001 && c.mediaId === clip.mediaId);
      if (!piece) return "Could not find the silent piece after splitting";
      silentId = piece.id;
    }
    const del = await act("clip/rippleDelete", { clipId: silentId });
    if (!del.success) return del.error?.message ?? "Delete failed";
    if (silentId === clipId) break; // the first pause started at the clip start: nothing earlier is left
  }
  return null;
}
