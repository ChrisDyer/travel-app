'use client';

import { useState, useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';

interface CoverImageUploadProps {
  tripId: string;
  currentUrl: string | null;
  onChanged: (url: string | null) => void;
}

export function CoverImageUpload({ tripId, currentUrl, onChanged }: CoverImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large (max 10 MB).');
      return;
    }
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/trips/${tripId}/cover-image`, { method: 'POST', body: fd });
      if (res.ok) {
        const { coverImageUrl } = await res.json();
        setPreview(coverImageUrl);
        onChanged(coverImageUrl);
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setPreview(currentUrl);
        setError(data.error ?? 'Upload failed. Please try again.');
      }
    } catch {
      setPreview(currentUrl);
      setError('Upload failed. Please check your connection and try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/cover-image`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        setError('Could not remove the photo. Please try again.');
        return;
      }
      setPreview(null);
      onChanged(null);
    } catch {
      setError('Could not remove the photo. Please check your connection and try again.');
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-stone-700">Cover Photo</span>
      {preview ? (
        <div className="relative w-full h-32 rounded-lg overflow-hidden border border-stone-200 group">
          <img src={preview} alt="Cover" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="bg-white/90 text-stone-800 text-xs font-medium px-3 py-1.5 rounded-md hover:bg-white transition-colors"
            >
              Change
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="bg-white/90 text-red-600 text-xs font-medium px-3 py-1.5 rounded-md hover:bg-white transition-colors"
            >
              Remove
            </button>
          </div>
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white text-sm">Uploading…</span>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full h-24 rounded-lg border-2 border-dashed border-stone-200 hover:border-stone-400 flex flex-col items-center justify-center gap-1.5 text-stone-400 hover:text-stone-600 transition-colors"
        >
          <ImagePlus className="h-5 w-5" />
          <span className="text-xs">Add cover photo</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
