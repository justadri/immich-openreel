import { describe, expect, it } from "vitest";
import { SILENCE_DEFAULTS, silenceRegions } from "./silence-tools";

const opts = SILENCE_DEFAULTS; // -40 dB, 0.5 s minimum, 0.1 s padding

describe("silenceRegions", () => {
  const clip = { startTime: 10, duration: 8, inPoint: 2 }; // source 2..10 on timeline 10..18

  it("maps source silences inside the clip to padded timeline ranges", () => {
    expect(silenceRegions(clip, [{ start: 4, end: 5 }], opts)).toEqual([{ start: 12.1, end: 12.9 }]);
  });
  it("clips to the source window and does not pad at the clip edges", () => {
    expect(silenceRegions(clip, [{ start: 0, end: 3 }, { start: 9, end: 12 }], opts)).toEqual([
      { start: 10, end: 10.9 },
      { start: 17.1, end: 18 },
    ]);
  });
  it("drops pauses shorter than the minimum (after padding) and ones outside the clip", () => {
    expect(silenceRegions(clip, [{ start: 4, end: 4.6 }, { start: 11, end: 13 }], opts)).toEqual([]);
  });
});

