/**
 * Phone editor shell: top bar, large preview with one play button, the touch timeline, and a bottom
 * tool bar whose tools open as bottom sheets. Rendered by EditorInterface instead of its desktop/compact
 * layout on phones (see phone.ts), after the editor is initialised, so all editor services keep running.
 * While a clip is selected the bottom bar becomes that clip's tools (ClipTools). "Export" opens the
 * phone export sheet (PhoneExport) instead of the desktop dialog.
 *
 * Ported from KAShow/openreel-video (MIT), commits 9e159dd..2e436ce, and adapted.
 */
import React, { useState } from "react";
import { useProjectStore } from "../stores/project-store";
import { useTimelineStore } from "../stores/timeline-store";
import { useUIStore } from "../stores/ui-store";
import { useRouter } from "../hooks/use-router";
import { Preview } from "../components/editor/Preview";
import { TouchTimeline } from "./TouchTimeline";
import { ClipTools } from "./ClipTools";
import { selectedTarget } from "./clip-tools";
import { AddMediaButton, TextComposer } from "./AddSheets";
import { PhoneExport } from "./PhoneExport";

type SheetId = "text";

const TOOLS: { id: SheetId; label: string; icon: string }[] = [
  { id: "text", label: "Text", icon: "T" },
];

const fmt = (t: number) => {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const MobileEditor: React.FC = () => {
  const { navigate } = useRouter();
  const projectName = useProjectStore((s) => s.project.name);
  const duration = useProjectStore((s) => s.project.timeline?.duration ?? 0);
  const playing = useTimelineStore((s) => s.playbackState === "playing");
  const playhead = useTimelineStore((s) => s.playheadPosition);
  const togglePlayback = useTimelineStore((s) => s.togglePlayback);
  const project = useProjectStore((s) => s.project);
  const selectedItems = useUIStore((s) => s.selectedItems);
  const clipSelected = selectedTarget(project, selectedItems) !== null;
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [exporting, setExporting] = useState(false);
  const current = TOOLS.find((t) => t.id === sheet);

  return (
    <div className="phone-editor flex h-full w-full flex-col overflow-hidden bg-bg text-fg" data-testid="phone-editor">

      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <button type="button" aria-label="Back" onClick={() => navigate("welcome")} className="grid h-10 w-10 place-items-center rounded-full text-lg">←</button>
        <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold" dir="auto">{projectName}</div>
        <button type="button" onClick={() => setExporting(true)} className="h-9 rounded-full bg-primary px-4 text-sm font-bold text-white">Export</button>
      </header>

      <section className="relative min-h-0 shrink-0 basis-[46%] bg-black" aria-label="Preview">
        <Preview hideControls />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-2 pt-6 text-white" dir="ltr">
          <span className="w-20 font-mono text-xs tabular-nums">{fmt(playhead)} / {fmt(duration)}</span>
          <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={togglePlayback} className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-lg text-black">
            {playing ? "❚❚" : "▶"}
          </button>
          <UndoRedo />
        </div>
      </section>

      <section className="relative min-h-0 flex-1 overflow-hidden" aria-label="Timeline">
        <TouchTimeline />
        <AddMediaButton />
      </section>

      {clipSelected ? <ClipTools /> : (
      <nav className="flex h-16 shrink-0 items-stretch border-t border-border bg-bg-1 pb-[env(safe-area-inset-bottom)]" aria-label="Editing tools">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" onClick={() => setSheet(t.id)}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${sheet === t.id ? "text-primary" : "text-fg-2"}`}>
            <span className="text-lg leading-none" aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      )}

      {current && (
        <div className="fixed inset-0 z-[90] flex flex-col justify-end bg-black/40" onClick={() => setSheet(null)}>
          <div role="dialog" aria-modal="true" aria-label={current.label} onClick={(e) => e.stopPropagation()}
            className="flex max-h-[70%] min-h-[40%] flex-col rounded-t-2xl border-t border-border bg-bg shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-bold">{current.label}</span>
              <button type="button" aria-label="Close" onClick={() => setSheet(null)} className="grid h-8 w-8 place-items-center rounded-full text-lg">✕</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {sheet === "text" && <TextComposer onDone={() => setSheet(null)} />}
            </div>
          </div>
        </div>
      )}
      {exporting && <PhoneExport onClose={() => setExporting(false)} />}
    </div>
  );
};

/** Undo / redo for the phone (the desktop has keyboard shortcuts and the toolbar). */
const UndoRedo: React.FC = () => {
  // Re-render on every project change so the enabled state follows the history.
  useProjectStore((s) => s.project);
  const { undo, redo, canUndo, canRedo } = useProjectStore.getState();
  const btn = "grid h-9 w-9 place-items-center rounded-full bg-white/15 text-lg disabled:opacity-30";
  return (
    <div className="flex w-20 justify-end gap-2" data-testid="undo-redo">
      <button type="button" aria-label="Undo" className={btn} disabled={!canUndo()} onClick={() => void undo()}>↶</button>
      <button type="button" aria-label="Redo" className={btn} disabled={!canRedo()} onClick={() => void redo()}>↷</button>
    </div>
  );
};
