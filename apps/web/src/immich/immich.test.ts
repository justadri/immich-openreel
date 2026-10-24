import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { durationSeconds, formatClock } from "./format";
import { exportTimestamps } from "./sources";
import { useImmichSession } from "./session";
import { immichProvider } from "./provider";
import { canSaveExports } from "../library/provider";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("durationSeconds / formatClock", () => {
  it("reads milliseconds and the older H:MM:SS string", () => {
    expect(durationSeconds(12500)).toBe(12.5);
    expect(durationSeconds("0:01:15.500000")).toBe(75.5);
    expect(durationSeconds("1:02:05")).toBe(3725);
    expect(durationSeconds(null)).toBe(0);
    expect(durationSeconds("nonsense")).toBe(0);
  });
  it("formats clocks", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(-3)).toBe("0:00");
  });
});

describe("exportTimestamps", () => {
  const now = new Date("2026-10-24T12:00:00Z");
  it("uses now without sources", () => {
    expect(exportTimestamps([], now)).toEqual({ fileCreatedAt: now.toISOString(), fileModifiedAt: now.toISOString() });
  });
  it("takes the earliest source date", () => {
    const t = exportTimestamps([
      { id: "a", fileCreatedAt: "2026-05-02T10:00:00.000Z", fileModifiedAt: "x" },
      { id: "b", fileCreatedAt: "2026-04-01T08:30:00.000Z", fileModifiedAt: "x" },
    ], now);
    expect(t.fileCreatedAt).toBe("2026-04-01T08:30:00.000Z");
    expect(t.fileModifiedAt).toBe(now.toISOString());
  });
});

describe("api", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("ping is true only for Immich's pong, not for an HTML fallback", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ res: "pong" }));
    expect(await api.ping()).toBe(true);
    fetchMock.mockResolvedValueOnce(new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }));
    expect(await api.ping()).toBe(false);
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    expect(await api.ping()).toBe(false);
  });

  it("login surfaces Immich's message and a missing session cookie", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Incorrect email or password" }, 401));
    await expect(api.login("a@b.c", "x")).rejects.toMatchObject({ status: 401, message: "Incorrect email or password" });

    fetchMock.mockResolvedValueOnce(jsonResponse({ accessToken: "t" }, 201));
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Unauthorized" }, 401));
    await expect(api.login("a@b.c", "x")).rejects.toThrow(/didn't keep the session/);
  });

  it("login returns the user and sends same-origin credentials", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ accessToken: "t" }, 201));
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "u1", name: "Ada", email: "ada@example.com", extra: 1 }));
    expect(await api.login("ada@example.com", "pw")).toEqual({ id: "u1", name: "Ada", email: "ada@example.com" });
    expect(fetchMock.mock.calls[0][0]).toBe("/immich-api/auth/login");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "same-origin" });
  });

  it("searchVideos asks for videos, pages, and drops trashed items", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ assets: { items: [{ id: "1" }, { id: "2", isTrashed: true }], nextPage: "3" } }));
    const page = await api.searchVideos({ albumId: "alb", page: 2 });
    expect(page).toEqual({ items: [{ id: "1" }], nextPage: 3 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ type: "VIDEO", page: 2, albumIds: ["alb"], order: "desc" });

    fetchMock.mockResolvedValueOnce(jsonResponse({ assets: { items: [], nextPage: null } }));
    expect((await api.searchVideos()).nextPage).toBeNull();
  });

  it("builds thumbnail URLs on the proxy path", () => {
    expect(api.thumbnailUrl("abc")).toBe("/immich-api/assets/abc/thumbnail?size=thumbnail");
  });

  it("downloadOriginal reports progress", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes.slice(0, 2)); c.enqueue(bytes.slice(2)); c.close(); } });
    fetchMock.mockResolvedValueOnce(new Response(stream, { headers: { "content-length": "4", "content-type": "video/mp4" } }));
    const seen: number[] = [];
    const blob = await api.downloadOriginal("abc", (f) => seen.push(f));
    expect(blob.size).toBe(4);
    expect(seen).toEqual([0.5, 1]);
  });

  it("sha1Hex matches the known digest", async () => {
    // jsdom's Blob has no arrayBuffer(); real browsers do.
    const blob = new Blob(["abc"]);
    Object.defineProperty(blob, "arrayBuffer", { value: async () => new TextEncoder().encode("abc").buffer });
    expect(await api.sha1Hex(blob)).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });
});

describe("uploadAsset", () => {
  class FakeXhr {
    static last: FakeXhr;
    upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
    headers: Record<string, string> = {};
    withCredentials = false;
    method = ""; url = ""; body: FormData | null = null;
    status = 201; responseText = JSON.stringify({ id: "new", status: "created" });
    onload?: () => void; onerror?: () => void;
    constructor() { FakeXhr.last = this; }
    open(method: string, url: string) { this.method = method; this.url = url; }
    setRequestHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; }
    send(body: FormData) { this.body = body; queueMicrotask(() => this.onload?.()); }
  }
  beforeEach(() => { vi.stubGlobal("XMLHttpRequest", FakeXhr); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("posts multipart with the checksum header and returns the status", async () => {
    const when = { fileCreatedAt: "2026-04-01T00:00:00.000Z", fileModifiedAt: "2026-04-02T00:00:00.000Z" };
    const res = await api.uploadAsset(new Blob(["x"]), "cut.mp4", when, { checksum: "abc" });
    expect(res).toEqual({ id: "new", status: "created" });
    const x = FakeXhr.last;
    expect(x.method).toBe("POST");
    expect(x.url).toBe("/immich-api/assets");
    expect(x.withCredentials).toBe(true);
    expect(x.headers["x-immich-checksum"]).toBe("abc");
    expect(x.body?.get("fileCreatedAt")).toBe(when.fileCreatedAt);
    expect((x.body?.get("assetData") as File).name).toBe("cut.mp4");
  });

  it("reports duplicates and errors", async () => {
    const when = { fileCreatedAt: "a", fileModifiedAt: "b" };
    const original = FakeXhr.prototype.send;
    FakeXhr.prototype.send = function (this: FakeXhr, body: FormData) { this.status = 200; this.responseText = JSON.stringify({ id: "old", status: "duplicate" }); original.call(this, body); };
    expect(await api.uploadAsset(new Blob(["x"]), "cut.mp4", when)).toEqual({ id: "old", status: "duplicate" });
    FakeXhr.prototype.send = function (this: FakeXhr, body: FormData) { this.status = 413; this.responseText = JSON.stringify({ message: "too big" }); original.call(this, body); };
    await expect(api.uploadAsset(new Blob(["x"]), "cut.mp4", when)).rejects.toMatchObject({ status: 413, message: "too big" });
    FakeXhr.prototype.send = original;
  });
});

describe("session + provider", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); useImmichSession.setState({ phase: "checking", user: null, error: null, busy: false }); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("is unavailable without the proxy", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404 }));
    await useImmichSession.getState().init();
    expect(useImmichSession.getState().phase).toBe("unavailable");
  });

  it("is signed-out with a pong but no session, ready with one", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ res: "pong" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ passwordLogin: true, oauth: true }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "no" }, 401));
    await useImmichSession.getState().init();
    expect(useImmichSession.getState().phase).toBe("signed-out");
    expect(useImmichSession.getState().features.oauth).toBe(true);

    fetchMock.mockResolvedValueOnce(jsonResponse({ res: "pong" }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ passwordLogin: true }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "u", name: "Ada", email: "a@b.c" }));
    await useImmichSession.getState().init();
    expect(useImmichSession.getState().phase).toBe("ready");
    expect(useImmichSession.getState().user?.name).toBe("Ada");
  });

  it("signIn keeps the error on failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Incorrect email or password" }, 401));
    expect(await useImmichSession.getState().signIn("a@b.c", "bad")).toBe(false);
    expect(useImmichSession.getState().error).toBe("Incorrect email or password");
    expect(useImmichSession.getState().phase).not.toBe("ready");
  });

  it("the provider only takes exports once signed in", () => {
    expect(canSaveExports(immichProvider("signed-out"))).toBe(false);
    expect(canSaveExports(immichProvider("ready"))).toBe(true);
    expect(immichProvider("signed-out").status).toBe("signed-out");
  });
});
