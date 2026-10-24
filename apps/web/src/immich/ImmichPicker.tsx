/**
 * Browse and pick videos from Immich. A full-height sheet on phones, a dialog on larger screens.
 * Signed-out users get the sign-in form first. Picked videos are downloaded as originals, imported into
 * the project's media library, and handed to `onAdded` (the phone editor puts them on the timeline).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { LibraryPickerProps } from "../library/provider";
import { importToLibrary } from "../mobile/add-tools";
import {
  downloadOriginal, listAlbums, searchVideos, thumbnailUrl,
  type ImmichAlbum, type ImmichAsset,
} from "./api";
import { durationSeconds, formatClock } from "./format";
import { useImmichSession } from "./session";
import { useImportedSources } from "./sources";

const field = "w-full rounded-xl border border-border bg-bg-1 p-3 text-base outline-none focus:border-primary";
const primary = "w-full rounded-xl bg-primary py-3 text-sm font-bold text-white disabled:opacity-40";
const tab = (on: boolean) => `flex-1 py-2 text-sm font-semibold ${on ? "border-b-2 border-primary text-fg" : "text-fg-muted"}`;

const SignIn: React.FC = () => {
  const { signIn, busy, error, features } = useImmichSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form className="mx-auto w-full max-w-sm space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); void signIn(email, password); }}>
      <p className="text-sm text-fg-muted">Sign in with your Immich account to pick videos from your library.</p>
      {features.passwordLogin ? (
        <>
          <input className={field} type="email" autoComplete="username" placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)} aria-label="Immich email" required />
          <input className={field} type="password" autoComplete="current-password" placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)} aria-label="Immich password" required />
          <button type="submit" className={primary} disabled={busy || !email || !password}>{busy ? "Signing in…" : "Sign in"}</button>
        </>
      ) : (
        <p className="text-sm text-red-400">Password login is turned off on this Immich server, and single sign-on isn't supported here yet.</p>
      )}
      {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
    </form>
  );
};

const Thumb: React.FC<{ asset: ImmichAsset; selected: number; onToggle: () => void }> = ({ asset, selected, onToggle }) => (
  <button type="button" onClick={onToggle} aria-pressed={selected > 0} aria-label={asset.originalFileName}
    className={`relative aspect-video overflow-hidden rounded-lg bg-bg-2 ${selected ? "ring-2 ring-primary" : ""}`}>
    <img src={thumbnailUrl(asset.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
    <span className="absolute bottom-1 end-1 rounded bg-black/70 px-1 text-[11px] text-white">{formatClock(durationSeconds(asset.duration))}</span>
    {selected > 0 && (
      <span className="absolute start-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-primary text-xs font-bold text-white">{selected}</span>
    )}
  </button>
);

interface GridProps { albumId?: string; picked: ImmichAsset[]; onToggle: (a: ImmichAsset) => void }

const VideoGrid: React.FC<GridProps> = ({ albumId, picked, onToggle }) => {
  const [items, setItems] = useState<ImmichAsset[]>([]);
  const [next, setNext] = useState<number | null>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const load = useCallback(async (page: number) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await searchVideos({ albumId, page });
      setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
      setNext(res.nextPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setNext(null);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [albumId]);

  useEffect(() => { setItems([]); setNext(1); void load(1); }, [load]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || next === null || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) void load(next); }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [next, load, items.length]);

  return (
    <div className="p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {items.map((a) => (
          <Thumb key={a.id} asset={a} selected={picked.findIndex((p) => p.id === a.id) + 1} onToggle={() => onToggle(a)} />
        ))}
      </div>
      <div ref={sentinel} className="h-8" />
      {loading && <p className="py-3 text-center text-sm text-fg-muted" role="status">Loading…</p>}
      {!loading && !error && items.length === 0 && <p className="py-6 text-center text-sm text-fg-muted">No videos here.</p>}
      {error && <p className="py-3 text-center text-sm text-red-400" role="alert">{error}</p>}
    </div>
  );
};

const Albums: React.FC<{ onOpen: (a: ImmichAlbum) => void }> = ({ onOpen }) => {
  const [albums, setAlbums] = useState<ImmichAlbum[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    listAlbums().then((a) => { if (live) setAlbums(a.filter((x) => x.assetCount > 0)); },
      (e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, []);
  if (error) return <p className="p-4 text-center text-sm text-red-400" role="alert">{error}</p>;
  if (!albums) return <p className="p-4 text-center text-sm text-fg-muted" role="status">Loading…</p>;
  if (!albums.length) return <p className="p-6 text-center text-sm text-fg-muted">No albums.</p>;
  return (
    <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 md:grid-cols-4">
      {albums.map((a) => (
        <button key={a.id} type="button" onClick={() => onOpen(a)} className="text-start">
          <span className="block aspect-square overflow-hidden rounded-lg bg-bg-2">
            {a.albumThumbnailAssetId && <img src={thumbnailUrl(a.albumThumbnailAssetId)} alt="" loading="lazy" className="h-full w-full object-cover" />}
          </span>
          <b className="mt-1 block truncate text-sm">{a.albumName}</b>
          <span className="text-xs text-fg-muted">{a.assetCount} items</span>
        </button>
      ))}
    </div>
  );
};

export const ImmichPicker: React.FC<LibraryPickerProps> = ({ onClose, onAdded }) => {
  const { phase, user, signOut } = useImmichSession();
  const [view, setView] = useState<"videos" | "albums">("videos");
  const [album, setAlbum] = useState<ImmichAlbum | null>(null);
  const [picked, setPicked] = useState<ImmichAsset[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = status !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const toggle = (a: ImmichAsset) =>
    setPicked((p) => (p.some((x) => x.id === a.id) ? p.filter((x) => x.id !== a.id) : [...p, a]));

  const add = async () => {
    setError(null);
    const ids: string[] = [];
    let failed = 0;
    try {
      for (let i = 0; i < picked.length; i++) {
        const asset = picked[i];
        const label = picked.length > 1 ? ` ${i + 1}/${picked.length}` : "";
        setStatus(`Downloading${label}…`);
        const blob = await downloadOriginal(asset.id, (f) => setStatus(`Downloading${label} · ${Math.round(f * 100)}%`));
        setStatus(`Adding${label}…`);
        const file = new File([blob], asset.originalFileName, {
          type: asset.originalMimeType || blob.type || "video/mp4",
          lastModified: Date.parse(asset.fileModifiedAt) || Date.now(),
        });
        const res = await importToLibrary([file]);
        ids.push(...res.ids);
        failed += res.failed;
        if (res.ids.length) {
          useImportedSources.getState().add([{ id: asset.id, fileCreatedAt: asset.fileCreatedAt, fileModifiedAt: asset.fileModifiedAt }]);
        }
      }
      if (ids.length) await onAdded(ids);
      if (failed) setError(`Couldn't add ${failed} of ${picked.length}.`);
      else onClose();
    } catch (e) {
      if (ids.length) await onAdded(ids);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus(null);
      if (ids.length) setPicked([]);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 sm:items-center" onClick={() => { if (!busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Immich" onClick={(e) => e.stopPropagation()}
        className="flex h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-bg sm:h-[80vh] sm:max-w-3xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <b className="block text-sm">Immich</b>
            {user && <span className="block truncate text-xs text-fg-muted">{user.name || user.email}</span>}
          </div>
          <div className="flex items-center gap-1">
            {phase === "ready" && !busy && (
              <button type="button" className="rounded-lg px-2 py-1 text-xs text-fg-muted" onClick={() => { setPicked([]); void signOut(); }}>Sign out</button>
            )}
            <button type="button" aria-label="Close" disabled={busy} onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-lg disabled:opacity-40">✕</button>
          </div>
        </div>

        {phase !== "ready" ? (
          <div className="flex-1 overflow-y-auto">{phase === "checking" ? <p className="p-4 text-center text-sm text-fg-muted" role="status">Connecting…</p> : <SignIn />}</div>
        ) : (
          <>
            <div className="flex border-b border-border">
              <button type="button" className={tab(view === "videos")} onClick={() => { setView("videos"); setAlbum(null); }}>All videos</button>
              <button type="button" className={tab(view === "albums")} onClick={() => setView("albums")}>Albums</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {view === "videos" ? <VideoGrid picked={picked} onToggle={toggle} />
                : album ? (
                  <>
                    <button type="button" className="px-4 pt-3 text-sm text-primary" onClick={() => setAlbum(null)}>‹ Albums</button>
                    <p className="px-4 pt-1 text-sm font-bold">{album.albumName}</p>
                    <VideoGrid key={album.id} albumId={album.id} picked={picked} onToggle={toggle} />
                  </>
                ) : <Albums onOpen={setAlbum} />}
            </div>
            <div className="space-y-2 border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {error && <p className="text-center text-sm text-red-400" role="alert">{error}</p>}
              {status && <p className="text-center text-sm text-fg-muted" role="status">{status}</p>}
              <button type="button" className={primary} disabled={!picked.length || busy} onClick={() => void add()}>
                {picked.length ? `Add ${picked.length} video${picked.length > 1 ? "s" : ""}` : "Select videos"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
