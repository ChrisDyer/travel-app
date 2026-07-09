'use client';

import { useEffect, useState } from 'react';

type Toast = { id: number; message: string; type: 'success' | 'error' };
type Listener = (t: Toast) => void;

let nextId = 1;
const listeners = new Set<Listener>();

export function toast(message: string, type: 'success' | 'error' = 'success') {
  const t = { id: nextId++, message, type };
  listeners.forEach((l) => l(t));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener: Listener = (t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 3500);
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 no-print" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg border px-4 py-2.5 text-sm shadow-lg bg-white animate-in fade-in slide-in-from-bottom-2 ${
            t.type === 'success' ? 'border-emerald-200 text-stone-700' : 'border-red-200 text-red-700'
          }`}
        >
          {t.type === 'success' ? '✓ ' : ''}{t.message}
        </div>
      ))}
    </div>
  );
}
