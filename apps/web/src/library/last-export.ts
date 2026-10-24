/**
 * Remembers the last browser export so it can be saved to the library provider afterwards.
 * Called by export-runner just before it hands the file to the browser download. OPFS temp files are
 * deleted about a minute later, so the bytes are copied into memory right away (only when a provider can
 * take exports and the file is within its size limit; otherwise nothing is kept).
 */
import { create } from "zustand";
import { canSaveExports, DEFAULT_MAX_EXPORT_BYTES, useLibrary } from "./provider";

interface LastExportState { blob: Blob | null; filename: string | null; at: number | null }
export const useLastExport = create<LastExportState>(() => ({ blob: null, filename: null, at: null }));

export function rememberExport(data: Blob, filename: string, mime?: string): void {
  const provider = useLibrary.getState().provider;
  if (!canSaveExports(provider)) return;
  if (data.size <= 0 || data.size > (provider.maxExportBytes ?? DEFAULT_MAX_EXPORT_BYTES)) return;
  void data.arrayBuffer().then(
    (buf) => useLastExport.setState({ blob: new Blob([buf], { type: mime || data.type }), filename, at: Date.now() }),
    () => undefined,
  );
}

export function clearLastExport(): void {
  useLastExport.setState({ blob: null, filename: null, at: null });
}
