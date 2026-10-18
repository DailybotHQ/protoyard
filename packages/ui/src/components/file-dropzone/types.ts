/** A selected file tracked by FileDropzone (preview URL only for image/*). */
export interface DropzoneFile {
  id: string;
  file: File;
  /** Upload progress 0–100; `null` is indeterminate. */
  progress: number | null;
  status: 'ready' | 'uploading' | 'done' | 'error';
  /** Per-file message when status is `error` or a rejection reason. */
  error?: string;
  /** Object URL for image/* previews; revoked when the item is removed. */
  previewUrl?: string;
}

export interface DropzoneReject {
  name: string;
  reason: string;
}
