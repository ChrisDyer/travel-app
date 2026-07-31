import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getUserId } from '@/lib/auth';
import { applyTravelWriteTools, proposalsToWriteToolInputs } from '@/lib/assistant/write-tools';
import type { Proposal } from '@/types/travel';

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);

  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json() as { proposals?: Proposal[] };
  try {
    const inputs = proposalsToWriteToolInputs(body.proposals ?? []);
    return NextResponse.json(applyTravelWriteTools(tripId, inputs));
  } catch {
    return NextResponse.json({ error: 'Invalid proposal payload' }, { status: 400 });
  }
}
