/**
 * Phone export sheet: replaces the desktop export dialog, which is wider than a phone. Two choices on
 * the same export engine as the desktop (useExportRunner, MP4/H.264, browser download), a progress
 * bar, and afterwards "Save to <library>" when a library provider that accepts exports is registered
 * (the export is kept by rememberExport for that).
 */
import React, { useState } from "react";
import type { VideoExportSettings } from "@openreel/core";
import { useProjectStore } from "../stores/project-store";
import { exportFilename, useExportRunner } from "../services/export-runner";
import { canSaveExports, useLibrary } from "../library/provider";
import { clearLastExport, useLastExport } from "../library/last-export";

export type Quality = "high" | "small";

/** Export size: the project's own size, or scaled so the short side is 720 (even numbers for H.264). */
export function exportSettings(project: { settings: { width: number; height: number; frameRate: number } }, quality: Quality): Partial<VideoExportSettings> {
  const { width, height, frameRate } = project.settings;
  const scale = quality === "small" ? Math.min(1, 720 / Math.min(width, height)) : 1;
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return {
    width: even(width), height: even(height), frameRate: frameRate || 30,
    format: "mp4", codec: "h264",
    bitrate: quality === "small" ? 5000 : 12000, quality: quality === "small" ? 75 : 85,
  };
}

const choice = (on: boolean) => `flex-1 rounded-xl border p-3 text-start ${on ? "border-primary bg-primary/10" : "border-border bg-bg-1"}`;
const primary = "w-full rounded-xl bg-primary py-3 text-sm font-bold text-white disabled:opacity-40";

export const PhoneExport: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const project = useProjectStore((s) => s.project);
  const hasContent = (project.timeline?.duration ?? 0) > 0;
  const provider = useLibrary((s) => s.provider);
  const saver = canSaveExports(provider) ? provider : null;
  const { blob, filename } = useLastExport();
  const [quality, setQuality] = useState<Quality>("high");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "done" | string>("idle");
  const runner = useExportRunner({ project });
  const { isExporting, progress, error } = runner.state;
  const done = startedAt !== null && !isExporting && !error && progress >= 100;
  // Only offer saving the file this sheet just exported, not an older one.
  const exported = done && blob && filename ? { blob, filename } : null;

  const start = async () => {
    clearLastExport();
    setSaved("idle");
    setStartedAt(Date.now());
    try {
      const writable = await runner.showSavePicker(exportFilename(project.name, "mp4"), "mp4", { delivery: "download" });
      runner.beginExport(writable);
      await runner.runExport(exportSettings(project, quality), "mp4", writable);
    } catch (e) {
      runner.failExport(e);
      if (e instanceof DOMException && e.name === "AbortError") setStartedAt(null);
    }
  };

  const save = async () => {
    if (!exported || !saver) return;
    setSaved("saving");
    try {
      await saver.saveExport(exported.blob, exported.filename);
      setSaved("done");
      clearLastExport();
    } catch (e) {
      setSaved(e instanceof Error ? e.message : "Couldn't save.");
    }
  };

  const close = () => { if (isExporting) runner.cancel(); onClose(); };
  const s = exportSettings(project, quality);
  const phase = !startedAt || (!isExporting && error) ? "choose" : done ? "done" : "progress";

  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end bg-black/40" onClick={() => { if (!isExporting) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Export video" onClick={(e) => e.stopPropagation()}
        data-testid="phone-export" className="space-y-3 rounded-t-2xl border-t border-border bg-bg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">Export video</span>
          <button type="button" aria-label="Close" onClick={close} className="grid h-8 w-8 place-items-center rounded-full text-lg">✕</button>
        </div>

        {phase === "choose" ? (
          <>
            <div className="flex gap-2">
              <button type="button" className={choice(quality === "high")} onClick={() => setQuality("high")} aria-pressed={quality === "high"}>
                <b className="block text-sm">High quality</b>
                <span className="text-xs text-fg-muted" dir="ltr">{exportSettings(project, "high").width}×{exportSettings(project, "high").height}</span>
              </button>
              <button type="button" className={choice(quality === "small")} onClick={() => setQuality("small")} aria-pressed={quality === "small"}>
                <b className="block text-sm">Smaller file</b>
                <span className="text-xs text-fg-muted" dir="ltr">{exportSettings(project, "small").width}×{exportSettings(project, "small").height}</span>
              </button>
            </div>
            {error && <p className="text-sm text-red-400">Export failed: {error}</p>}
            <button type="button" className={primary} disabled={!hasContent} onClick={() => void start()}>
              {hasContent ? "Export video" : "Add footage first"}
            </button>
            <p className="text-center text-xs text-fg-muted">MP4 · {s.frameRate} fps · saved to your device's downloads</p>
          </>
        ) : phase === "progress" ? (
          <div className="space-y-2" role="status">
            <div className="h-2 overflow-hidden rounded-full bg-bg-2">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(progress)}%` }} />
            </div>
            <p className="text-center text-sm">Exporting… {Math.round(progress)}%</p>
            <p className="text-center text-xs text-fg-muted">Keep this page open until it finishes.</p>
            <button type="button" className="w-full py-2 text-sm text-fg-muted" onClick={() => runner.cancel()}>Cancel</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-center text-sm">✅ Exported. The video is in your device's downloads.</p>
            {saver && (
              saved === "done" ? <p className="text-center text-sm text-primary">Saved to {saver.label}.</p>
                : <button type="button" className={primary} disabled={!exported || saved === "saving"} onClick={() => void save()}>
                  {saved === "saving" ? "Saving…" : exported ? `Save to ${saver.label}` : "Preparing…"}
                </button>
            )}
            {saved !== "idle" && saved !== "saving" && saved !== "done" && <p className="text-center text-sm text-red-400">{saved}</p>}
            <button type="button" className="w-full py-2 text-sm text-fg-muted" onClick={() => setStartedAt(null)}>Export again</button>
          </div>
        )}
      </div>
    </div>
  );
};
