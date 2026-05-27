'use client';

import { useState, useRef } from 'react';
import { PackingItem, PackingCategory } from '@/types/travel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const CATEGORIES: PackingCategory[] = [
  'Documents & Essentials',
  'Clothing',
  'Tech & Apps',
  'Health & Comfort',
];

interface PackingChecklistProps {
  tripId: string;
  initialItems: PackingItem[];
}

export function PackingChecklist({ tripId, initialItems }: PackingChecklistProps) {
  const [items, setItems] = useState<PackingItem[]>(initialItems);
  const [addingCategory, setAddingCategory] = useState<PackingCategory | null>(null);
  const [newItemCategory, setNewItemCategory] = useState<PackingCategory>(CATEGORIES[0]);
  const [showGlobalAdd, setShowGlobalAdd] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const globalInputRef = useRef<HTMLInputElement>(null);

  async function togglePacked(item: PackingItem) {
    const next = !item.isPacked;
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, isPacked: next } : i));
    await fetch(`/api/trips/${tripId}/packing/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPacked: next }),
    });
  }

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`/api/trips/${tripId}/packing/${id}`, { method: 'DELETE' });
  }

  async function addItem(category: PackingCategory, itemText: string) {
    if (!itemText.trim()) return;
    const sortOrder = items.filter((i) => i.category === category).length;
    const res = await fetch(`/api/trips/${tripId}/packing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, item: itemText.trim(), sortOrder }),
    });
    if (res.ok) {
      const saved = await res.json();
      setItems((prev) => [...prev, saved]);
    }
  }

  function handleInlineKeyDown(e: React.KeyboardEvent<HTMLInputElement>, category: PackingCategory) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem(category, e.currentTarget.value);
      e.currentTarget.value = '';
    }
    if (e.key === 'Escape') setAddingCategory(null);
  }

  function handleGlobalKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem(newItemCategory, e.currentTarget.value);
      e.currentTarget.value = '';
    }
    if (e.key === 'Escape') setShowGlobalAdd(false);
  }

  const byCategory = CATEGORIES.reduce<Record<PackingCategory, PackingItem[]>>((acc, cat) => {
    acc[cat] = items.filter((i) => i.category === cat);
    return acc;
  }, {} as Record<PackingCategory, PackingItem[]>);

  const packed = items.filter((i) => i.isPacked).length;

  return (
    <section className="mt-16 pt-10 border-t border-stone-200">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="text-2xl font-serif font-bold text-stone-900">Packing Checklist</h2>
        {items.length > 0 && (
          <span className="text-sm text-stone-400">{packed} / {items.length} packed</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        {CATEGORIES.map((cat) => {
          const catItems = byCategory[cat];
          return (
            <div key={cat}>
              <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">{cat}</h3>
              <ul className="space-y-1.5">
                {catItems.map((pi) => (
                  <li key={pi.id} className="flex items-center gap-2 group">
                    <input
                      type="checkbox"
                      checked={pi.isPacked}
                      onChange={() => togglePacked(pi)}
                      className="w-4 h-4 rounded border-stone-300 accent-stone-700 cursor-pointer shrink-0"
                    />
                    <span className={`text-sm flex-1 ${pi.isPacked ? 'line-through text-stone-400' : 'text-stone-700'}`}>
                      {pi.item}
                    </span>
                    <button
                      onClick={() => deleteItem(pi.id)}
                      className="opacity-0 group-hover:opacity-100 text-stone-300 hover:text-red-400 transition-opacity text-xs leading-none"
                      aria-label="Remove item"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>

              {addingCategory === cat ? (
                <div className="mt-2 flex gap-2">
                  <Input
                    ref={addInputRef}
                    autoFocus
                    placeholder="Item name, then Enter"
                    onKeyDown={(e) => handleInlineKeyDown(e, cat)}
                    onBlur={() => setAddingCategory(null)}
                    className="h-7 text-sm"
                  />
                </div>
              ) : (
                <button
                  onClick={() => { setAddingCategory(cat); setTimeout(() => addInputRef.current?.focus(), 0); }}
                  className="mt-2 text-xs text-stone-400 hover:text-stone-600 transition-colors"
                >
                  + Add item
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8">
        {showGlobalAdd ? (
          <div className="flex items-center gap-3 max-w-md">
            <Select value={newItemCategory} onValueChange={(v) => setNewItemCategory(v as PackingCategory)}>
              <SelectTrigger className="w-52 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              ref={globalInputRef}
              autoFocus
              placeholder="Item name, then Enter"
              onKeyDown={handleGlobalKeyDown}
              className="h-8 text-sm flex-1"
            />
            <Button variant="ghost" size="sm" onClick={() => setShowGlobalAdd(false)} className="text-stone-400">
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowGlobalAdd(true)}>
            + Add packing item
          </Button>
        )}
      </div>
    </section>
  );
}
