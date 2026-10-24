/** Immich reports video duration as milliseconds (current servers) or "H:MM:SS.ffffff" (older ones). */
export function durationSeconds(duration: number | string | null | undefined): number {
  if (typeof duration === "number") return Number.isFinite(duration) ? duration / 1000 : 0;
  if (typeof duration === "string") {
    const m = /^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(duration.trim());
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return 0;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 75 -> "1:15", 3725 -> "1:02:05". */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
