/**
 * Media-library provider seam. A provider is a remote media source (for example an Immich server) the
 * editor can import from and save exports back to. The editor works without one; when one is registered
 * the phone editor offers "From <provider>" in the add menu and "Save to <provider>" after an export.
 */
import type React from "react";
import { create } from "zustand";

export interface LibraryPickerProps {
  onClose: () => void;
  /** Called with the media-library IDs of the items the user imported, to be placed on the timeline. */
  onAdded: (mediaIds: string[]) => void | Promise<void>;
}

export interface LibraryProvider {
  /** Stable identifier, e.g. "immich". */
  id: string;
  /** Short display name used in buttons, e.g. "Immich". */
  label: string;
  /** One line shown under the button in the add menu. */
  description: string;
  /** "ready" once the user is signed in. */
  status: "ready" | "connecting" | "signed-out";
  /** Where to send a signed-out user (rendered as a link in the add menu). */
  signInHref?: string;
  /** Browse/select UI. Rendered as a modal when the user picks the provider in the add menu. */
  Picker: React.ComponentType<LibraryPickerProps>;
  /** Saves a finished export back to the library. Providers without this only support import. */
  saveExport?: (blob: Blob, filename: string) => Promise<{ reused: boolean }>;
  /** Largest export (bytes) worth keeping in memory for saveExport. Defaults to 100 MB. */
  maxExportBytes?: number;
}

interface LibraryState {
  provider: LibraryProvider | null;
  setProvider: (provider: LibraryProvider | null) => void;
}

export const useLibrary = create<LibraryState>((set) => ({
  provider: null,
  setProvider: (provider) => set({ provider }),
}));

export const DEFAULT_MAX_EXPORT_BYTES = 100 * 1024 * 1024;

/** True when the registered provider is signed in and can take exports. */
export function canSaveExports(provider: LibraryProvider | null): provider is LibraryProvider & Required<Pick<LibraryProvider, "saveExport">> {
  return !!provider && provider.status === "ready" && typeof provider.saveExport === "function";
}
