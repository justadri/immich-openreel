/**
 * Remembers which Immich assets were imported into this editing session, so an export saved back to
 * Immich can take the date of the footage it was made from (it then sorts into the timeline next to it,
 * not at "now").
 */
import { create } from "zustand";

export interface SourceAsset {
  id: string;
  fileCreatedAt: string;
  fileModifiedAt: string;
  /** The project media item this asset was imported as, so picking it again doesn't download it again. */
  mediaId?: string;
}

interface SourcesState {
  assets: SourceAsset[];
  add: (assets: SourceAsset[]) => void;
  clear: () => void;
  /** The media item already holding this asset, if it is still in the project (`exists` checks that). */
  mediaFor: (assetId: string, exists: (mediaId: string) => boolean) => string | null;
}

export const useImportedSources = create<SourcesState>((set, get) => ({
  mediaFor: (assetId, exists) => {
    const mediaId = get().assets.find((a) => a.id === assetId)?.mediaId;
    return mediaId && exists(mediaId) ? mediaId : null;
  },
  assets: [],
  add: (assets) => set((s) => ({
    assets: [...s.assets.filter((a) => !assets.some((n) => n.id === a.id)), ...assets],
  })),
  clear: () => set({ assets: [] }),
}));

/** Earliest source date, or `now` when there is none. Both fields share it. */
export function exportTimestamps(assets: readonly SourceAsset[], now: Date = new Date()): { fileCreatedAt: string; fileModifiedAt: string } {
  const times = assets.map((a) => Date.parse(a.fileCreatedAt)).filter(Number.isFinite);
  const created = times.length ? new Date(Math.min(...times)) : now;
  return { fileCreatedAt: created.toISOString(), fileModifiedAt: now.toISOString() };
}
