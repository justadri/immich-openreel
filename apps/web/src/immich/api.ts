/**
 * Minimal Immich REST client. Every call goes to a same-origin path (default `/immich-api`) that the
 * web server proxies to Immich, so the browser needs no CORS and holds Immich's own session cookie:
 * Immich still decides what each signed-in user may see and change.
 */

const env = (import.meta as { env?: Record<string, string | undefined> }).env;
/** Same-origin path the web server proxies to `<immich>/api`. */
export const IMMICH_BASE: string = (env?.VITE_IMMICH_BASE ?? "/immich-api").replace(/\/+$/, "");

export class ImmichError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ImmichError";
  }
}

export interface ImmichUser { id: string; name: string; email: string }
export interface ImmichFeatures { passwordLogin: boolean; oauth: boolean; oauthAutoLaunch: boolean }

export interface ImmichAsset {
  id: string;
  type: "IMAGE" | "VIDEO" | "AUDIO" | "OTHER";
  originalFileName: string;
  originalMimeType?: string;
  /** Milliseconds on current servers; older ones send "H:MM:SS.ffffff". See durationSeconds. */
  duration: number | string | null;
  fileCreatedAt: string;
  fileModifiedAt: string;
  isTrashed?: boolean;
}

export interface ImmichAlbum {
  id: string;
  albumName: string;
  assetCount: number;
  albumThumbnailAssetId: string | null;
  shared: boolean;
}

export interface UploadResult { id: string; status: "created" | "duplicate" }

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === "string") return body.message;
    if (Array.isArray(body.message)) return body.message.join(", ");
  } catch { /* not JSON */ }
  return `Immich returned ${res.status}`;
}

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

async function request(path: string, init: FetchInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${IMMICH_BASE}${path}`, { credentials: "same-origin", ...init });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ImmichError(0, "Can't reach Immich.");
  }
  if (!res.ok) throw new ImmichError(res.status, await errorMessage(res));
  return res;
}

async function json<T>(path: string, init?: FetchInit): Promise<T> {
  return (await request(path, init)).json() as Promise<T>;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return json<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

/** True when the proxy is in place and Immich answers. A SPA fallback page (HTML) does not count. */
export async function ping(): Promise<boolean> {
  try {
    const res = await fetch(`${IMMICH_BASE}/server/ping`, { credentials: "same-origin" });
    if (!res.ok) return false;
    return ((await res.json()) as { res?: string }).res === "pong";
  } catch {
    return false;
  }
}

export async function getFeatures(): Promise<ImmichFeatures> {
  const f = await json<Partial<ImmichFeatures>>("/server/features");
  return { passwordLogin: f.passwordLogin !== false, oauth: !!f.oauth, oauthAutoLaunch: !!f.oauthAutoLaunch };
}

/** The signed-in user, or null when there is no valid session. */
export async function getMe(): Promise<ImmichUser | null> {
  try {
    const u = await json<ImmichUser>("/users/me");
    return { id: u.id, name: u.name, email: u.email };
  } catch (e) {
    if (e instanceof ImmichError && e.status === 401) return null;
    throw e;
  }
}

/** Email + password login. Immich answers with a session cookie, which the browser keeps. */
export async function login(email: string, password: string): Promise<ImmichUser> {
  await post("/auth/login", { email, password });
  const user = await getMe();
  if (!user) {
    throw new ImmichError(401, "Signed in, but the browser didn't keep the session. Open this page at the same address the proxy serves.");
  }
  return user;
}

export async function logout(): Promise<void> {
  try { await request("/auth/logout", { method: "POST" }); } catch { /* the cookie is gone either way */ }
}

export async function listAlbums(): Promise<ImmichAlbum[]> {
  return json<ImmichAlbum[]>("/albums");
}

export interface VideoPage { items: ImmichAsset[]; nextPage: number | null }

/** Videos newest first, optionally limited to one album. */
export async function searchVideos(opts: { albumId?: string; page?: number; size?: number } = {}): Promise<VideoPage> {
  const res = await post<{ assets: { items: ImmichAsset[]; nextPage: string | null } }>("/search/metadata", {
    type: "VIDEO",
    page: opts.page ?? 1,
    size: opts.size ?? 60,
    order: "desc",
    ...(opts.albumId ? { albumIds: [opts.albumId] } : {}),
  });
  const next = res.assets.nextPage ? Number(res.assets.nextPage) : NaN;
  return { items: res.assets.items.filter((a) => !a.isTrashed), nextPage: Number.isFinite(next) ? next : null };
}

/** For <img src>: same-origin, so the session cookie authorises it. */
export const thumbnailUrl = (assetId: string, size: "thumbnail" | "preview" = "thumbnail") =>
  `${IMMICH_BASE}/assets/${encodeURIComponent(assetId)}/thumbnail?size=${size}`;

/** Downloads the original file. `onProgress` gets 0..1 when the server reports a length. */
export async function downloadOriginal(assetId: string, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<Blob> {
  const res = await request(`/assets/${encodeURIComponent(assetId)}/original`, { signal });
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !onProgress || !total) return res.blob();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(1, received / total));
  }
  return new Blob(chunks as unknown as ArrayBuffer[], { type: res.headers.get("content-type") ?? "" });
}

/** Hex SHA-1, which Immich uses for duplicate detection (`x-immich-checksum`). */
export async function sha1Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Uploads a new asset (XHR, for upload progress). A matching checksum makes Immich answer "duplicate". */
export function uploadAsset(
  blob: Blob,
  filename: string,
  when: { fileCreatedAt: string; fileModifiedAt: string },
  opts: { checksum?: string; onProgress?: (fraction: number) => void } = {},
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("assetData", blob, filename);
    form.append("filename", filename);
    form.append("fileCreatedAt", when.fileCreatedAt);
    form.append("fileModifiedAt", when.fileModifiedAt);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${IMMICH_BASE}/assets`);
    xhr.withCredentials = true;
    if (opts.checksum) xhr.setRequestHeader("x-immich-checksum", opts.checksum);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total); };
    xhr.onerror = () => reject(new ImmichError(0, "Can't reach Immich."));
    xhr.onload = () => {
      let body: { id?: string; status?: string; message?: unknown } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* keep {} */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.id) {
        resolve({ id: body.id, status: body.status === "duplicate" ? "duplicate" : "created" });
      } else {
        const msg = typeof body.message === "string" ? body.message : `Immich returned ${xhr.status}`;
        reject(new ImmichError(xhr.status, msg));
      }
    };
    xhr.send(form);
  });
}

export async function addToAlbum(albumId: string, assetIds: string[]): Promise<void> {
  await json(`/albums/${encodeURIComponent(albumId)}/assets`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: assetIds }),
  });
}
