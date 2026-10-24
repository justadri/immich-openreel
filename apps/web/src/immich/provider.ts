/** Registers Immich as the editor's media-library provider (browse/import originals, save exports back). */
import { useLibrary, type LibraryProvider } from "../library/provider";
import { ImmichPicker } from "./ImmichPicker";
import { sha1Hex, uploadAsset } from "./api";
import { useImmichSession, type ImmichPhase } from "./session";
import { exportTimestamps, useImportedSources } from "./sources";

/** The export is copied into memory for saving, so keep it to what a phone can hold. */
const MAX_EXPORT_BYTES = 250 * 1024 * 1024;

async function saveExport(blob: Blob, filename: string): Promise<{ reused: boolean }> {
  if (useImmichSession.getState().phase !== "ready") throw new Error("Sign in to Immich first.");
  // crypto.subtle only exists in secure contexts (HTTPS/localhost); without it Immich just can't pre-check duplicates.
  const checksum = typeof crypto !== "undefined" && crypto.subtle ? await sha1Hex(blob) : undefined;
  const when = exportTimestamps(useImportedSources.getState().assets);
  const res = await uploadAsset(blob, filename, when, { checksum });
  return { reused: res.status === "duplicate" };
}

export function immichProvider(phase: ImmichPhase): LibraryProvider {
  return {
    id: "immich",
    label: "Immich",
    description: "Pick videos from your Immich library",
    status: phase === "ready" ? "ready" : phase === "checking" ? "connecting" : "signed-out",
    Picker: ImmichPicker,
    saveExport,
    maxExportBytes: MAX_EXPORT_BYTES,
  };
}

/**
 * Probes `/immich-api` once. If Immich answers, registers the provider and keeps its status in step
 * with the session; if not (no proxy configured), the editor stays exactly as it was.
 */
export async function registerImmich(): Promise<void> {
  let last: ImmichPhase | null = null;
  useImmichSession.subscribe(({ phase }) => {
    if (phase === last) return;
    last = phase;
    // Nothing is offered until the proxy has answered, so there is no flash of a dead button.
    useLibrary.getState().setProvider(phase === "unavailable" || phase === "checking" ? null : immichProvider(phase));
  });
  await useImmichSession.getState().init();
}
