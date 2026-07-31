import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getUserId } from '@/lib/auth';
import { withErrorHandling } from '@/lib/api-helpers';
import { getBriefAuthor, toBriefResponse, type BriefRow } from './brief-helpers';

type BriefBody = {
  content?: unknown;
  mode?: unknown;
  expectedUpdatedAt?: unknown;
};

type TripBriefRow = BriefRow & {
  id: string;
};

function loadBriefRow(tripId: string, userId: string): TripBriefRow | undefined {
  return db.prepare(`
    SELECT id, planning_notes, planning_notes_previous,
           planning_notes_updated_at, planning_notes_updated_by
      FROM trips
     WHERE id = ? AND user_id = ?
  `).get(tripId, userId) as TripBriefRow | undefined;
}

export const GET = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const row = loadBriefRow(tripId, userId);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(toBriefResponse(row));
});

export const PUT = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const row = loadBriefRow(tripId, userId);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json() as BriefBody;
  if (typeof body.content !== 'string') {
    return NextResponse.json({ error: 'Missing required field: content' }, { status: 400 });
  }

  const mode = body.mode ?? 'replace';
  if (mode !== 'replace' && mode !== 'append') {
    return NextResponse.json({ error: 'mode must be "replace" or "append"' }, { status: 400 });
  }

  if (body.content.length > 20000) {
    return NextResponse.json(
      { error: `Brief content is too long (${body.content.length} chars, max 20000).` },
      { status: 400 }
    );
  }

  if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== row.planning_notes_updated_at) {
    return NextResponse.json(
      {
        error: `The brief changed since you read it (expected ${body.expectedUpdatedAt}, found ${row.planning_notes_updated_at}). Re-read it and reapply your change.`,
      },
      { status: 409 }
    );
  }

  const incoming = body.content.trim();
  const current = row.planning_notes;
  const next = mode === 'append' && current ? `${current}\n\n${incoming}` : incoming;
  const finalContent = next.trim() || null;
  const previous = row.planning_notes;
  const updatedAt = new Date().toISOString();
  const updatedBy = getBriefAuthor(request);

  const updated = db.prepare(`
    UPDATE trips
       SET planning_notes_previous = planning_notes,
           planning_notes = ?,
           planning_notes_updated_at = ?,
           planning_notes_updated_by = ?
     WHERE id = ? AND user_id = ?
     RETURNING planning_notes, planning_notes_previous,
               planning_notes_updated_at, planning_notes_updated_by
  `).get(finalContent, updatedAt, updatedBy, tripId, userId) as BriefRow;

  return NextResponse.json({ ...toBriefResponse(updated), previous });
});