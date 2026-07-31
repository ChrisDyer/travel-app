import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getUserId } from '@/lib/auth';
import { withErrorHandling } from '@/lib/api-helpers';
import { getBriefAuthor, toBriefResponse, type BriefRow } from '../brief-helpers';

type TripBriefRow = BriefRow & {
  id: string;
};

export const POST = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  const row = db.prepare(`
    SELECT id, planning_notes, planning_notes_previous,
           planning_notes_updated_at, planning_notes_updated_by
      FROM trips
     WHERE id = ? AND user_id = ?
  `).get(tripId, userId) as TripBriefRow | undefined;

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.planning_notes_previous === null) {
    return NextResponse.json({ error: 'Nothing to undo.' }, { status: 400 });
  }

  const updated = db.prepare(`
    UPDATE trips
       SET planning_notes = planning_notes_previous,
           planning_notes_previous = planning_notes,
           planning_notes_updated_at = ?,
           planning_notes_updated_by = ?
     WHERE id = ? AND user_id = ?
     RETURNING planning_notes, planning_notes_previous,
               planning_notes_updated_at, planning_notes_updated_by
  `).get(new Date().toISOString(), getBriefAuthor(request), tripId, userId) as BriefRow;

  return NextResponse.json(toBriefResponse(updated));
});