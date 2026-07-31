'use client';

import { useState } from 'react';
import { toast } from '@/components/ui/toast';
import { apiUrl } from '@/lib/api';
import { formatRelativeTime } from '@/lib/dates';
import { useReadOnly } from '@/lib/read-only';
import { cn } from '@/lib/utils';

interface TripBriefProps {
  tripId: string;
  initialContent: string | null;
  initialUpdatedAt: string | null;
  initialUpdatedBy: 'you' | 'assistant' | null;
  initialHasUndo: boolean;
}

interface BriefResponse {
  content: string | null;
  updatedAt: string | null;
  updatedBy: 'you' | 'assistant' | null;
  hasUndo: boolean;
}

function shouldCollapse(content: string): boolean {
  return content.split('\n').length > 3 || content.length > 240;
}

function authorLabel(updatedBy: 'you' | 'assistant' | null): string {
  return updatedBy === 'assistant' ? 'Claude' : 'you';
}

export function TripBrief({
  tripId,
  initialContent,
  initialUpdatedAt,
  initialUpdatedBy,
  initialHasUndo,
}: TripBriefProps) {
  const readOnly = useReadOnly();
  const [content, setContent] = useState(initialContent);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [updatedBy, setUpdatedBy] = useState(initialUpdatedBy);
  const [hasUndo, setHasUndo] = useState(initialHasUndo);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialContent ?? '');
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasContent = Boolean(content);
  const collapsible = content ? shouldCollapse(content) : false;

  function applyBrief(next: BriefResponse) {
    setContent(next.content);
    setUpdatedAt(next.updatedAt);
    setUpdatedBy(next.updatedBy);
    setHasUndo(next.hasUndo);
    setDraft(next.content ?? '');
    setExpanded(false);
  }

  function startEditing() {
    setDraft(content ?? '');
    setEditing(true);
  }

  function cancelEditing() {
    setDraft(content ?? '');
    setEditing(false);
  }

  async function saveBrief() {
    const previous = { content, updatedAt, updatedBy, hasUndo };
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/trips/${tripId}/brief`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft, mode: 'replace' }),
      });
      if (!res.ok) throw new Error();
      applyBrief(await res.json() as BriefResponse);
      setEditing(false);
      toast('Trip brief saved');
    } catch {
      setContent(previous.content);
      setUpdatedAt(previous.updatedAt);
      setUpdatedBy(previous.updatedBy);
      setHasUndo(previous.hasUndo);
      toast('Could not save the trip brief. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function undoBrief() {
    const previous = { content, updatedAt, updatedBy, hasUndo };
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/trips/${tripId}/brief/undo`), { method: 'POST' });
      if (!res.ok) throw new Error();
      applyBrief(await res.json() as BriefResponse);
      setEditing(false);
      toast('Trip brief restored');
    } catch {
      setContent(previous.content);
      setUpdatedAt(previous.updatedAt);
      setUpdatedBy(previous.updatedBy);
      setHasUndo(previous.hasUndo);
      toast('Could not undo the trip brief. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="no-print mb-8">
      <div className="mb-2 flex min-h-10 items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-stone-600">Trip Brief</h2>
        {!readOnly && hasContent && !editing && (
          <button
            type="button"
            onClick={startEditing}
            className="min-h-10 rounded-md px-2 text-xs font-medium text-stone-400 transition-colors hover:text-stone-700"
          >
            Edit
          </button>
        )}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        {editing ? (
          <div className="space-y-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEditing();
                }
              }}
              className="w-full rounded-md border border-stone-300 p-2 text-sm text-stone-700 focus:border-stone-500 focus:outline-none"
              rows={10}
              autoFocus
            />
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                className="min-h-10 rounded-md px-3 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveBrief}
                disabled={saving}
                className="min-h-10 rounded-md bg-stone-800 px-3 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {hasContent ? (
              <>
                <p className={cn(
                  'whitespace-pre-wrap text-sm text-stone-700',
                  collapsible && !expanded && 'line-clamp-3'
                )}>
                  {content}
                </p>
                {collapsible && (
                  <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    className="mt-2 min-h-10 text-xs font-medium text-stone-500 transition-colors hover:text-stone-800"
                  >
                    {expanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm italic text-stone-400">
                  No brief yet. Claude will fill this in as you plan, or write one yourself.
                </p>
                {!readOnly && (
                  <div>
                    <button
                      type="button"
                      onClick={startEditing}
                      className="min-h-10 rounded-md bg-stone-800 px-3 text-sm font-medium text-white transition-colors hover:bg-stone-700"
                    >
                      Add brief
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* Attribution and Undo sit outside the content/empty split on purpose: clearing
                the brief is the most destructive thing this panel does, so that is exactly
                when Undo has to stay reachable. */}
            {updatedAt && (
              <div className="mt-3 flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-400">
                <span>
                  Updated by {authorLabel(updatedBy)} &middot; {formatRelativeTime(updatedAt)}
                </span>
                {!readOnly && hasUndo && (
                  <button
                    type="button"
                    onClick={undoBrief}
                    disabled={saving}
                    title="Restore the previous trip brief version"
                    className="rounded-md px-2 py-1 font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:opacity-50"
                  >
                    Undo
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
