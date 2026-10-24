/**
 * After a desktop export, offers to save the file to the library provider (e.g. Immich). The phone
 * editor has its own step in the export sheet, so this stays out of its way.
 */
import React, { useEffect, useState } from "react";
import { usePhoneEditor } from "../mobile/phone";
import { canSaveExports, useLibrary } from "./provider";
import { clearLastExport, useLastExport } from "./last-export";

export const SaveToLibraryPrompt: React.FC = () => {
  const provider = useLibrary((s) => s.provider);
  const { blob, filename, at } = useLastExport();
  const phone = usePhoneEditor();
  const [state, setState] = useState<"idle" | "saving" | "done" | string>("idle");

  useEffect(() => { setState("idle"); }, [at]);
  useEffect(() => {
    if (state !== "done") return;
    const t = setTimeout(clearLastExport, 4000);
    return () => clearTimeout(t);
  }, [state]);

  if (phone || !canSaveExports(provider) || !blob || !filename) return null;

  const save = async () => {
    setState("saving");
    try {
      const { reused } = await provider.saveExport(blob, filename);
      setState(reused ? `Already in ${provider.label}.` : "done");
      if (reused) setTimeout(clearLastExport, 4000);
    } catch (e) {
      setState(e instanceof Error ? e.message : "Couldn't save.");
    }
  };

  const failed = state !== "idle" && state !== "saving" && state !== "done" && state !== `Already in ${provider.label}.`;
  return (
    <div role="status" data-testid="save-to-library"
      className="fixed bottom-4 end-4 z-[120] w-72 space-y-2 rounded-xl border border-border bg-bg-1 p-3 text-sm text-fg shadow-xl">
      {state === "done" ? <p>Saved to {provider.label}.</p>
        : state === `Already in ${provider.label}.` ? <p>{state}</p>
        : (
          <>
            <p className="truncate font-semibold">{filename}</p>
            <p className="text-xs text-fg-muted">Export finished. Save a copy to {provider.label}?</p>
            {failed && <p className="text-xs text-red-400" role="alert">{state}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={state === "saving"} onClick={() => void save()}
                className="flex-1 rounded-lg bg-primary py-2 font-semibold text-white disabled:opacity-40">
                {state === "saving" ? "Saving…" : failed ? "Try again" : `Save to ${provider.label}`}
              </button>
              <button type="button" disabled={state === "saving"} onClick={clearLastExport}
                className="rounded-lg px-3 py-2 text-fg-muted disabled:opacity-40">Dismiss</button>
            </div>
          </>
        )}
    </div>
  );
};
