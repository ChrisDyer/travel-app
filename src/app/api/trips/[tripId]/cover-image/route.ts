import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getUserId } from '@/lib/auth';
import { withErrorHandling } from '@/lib/api-helpers';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function requireTrip(tripId: string, userId: string) {
  return db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId) as { id: string } | undefined;
}

export const GET = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  if (!requireTrip(tripId, userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const row = db.prepare('SELECT data FROM trip_cover_images WHERE trip_id = ?').get(tripId) as { data: Buffer } | undefined;
  if (!row) return NextResponse.json({ error: 'No image' }, { status: 404 });

  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      'Content-Type': 'image/jpeg',
      // Immutable is safe: the URL carries a ?v= cache-buster that changes on re-upload.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
});

export const POST = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  if (!requireTrip(tripId, userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Please choose an image file.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image is too large (max 10 MB).' }, { status: 413 });
  }

  let resized: Buffer;
  try {
    const sharp = (await import('sharp')).default;
    resized = await sharp(Buffer.from(await file.arrayBuffer()))
      .resize(600, 400, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: 'That file could not be read as an image.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const coverImageUrl = `/api/trips/${tripId}/cover-image?v=${Date.now()}`;
  const save = db.transaction(() => {
    db.prepare(`
      INSERT INTO trip_cover_images (trip_id, data, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(trip_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `).run(tripId, resized, now);
    db.prepare('UPDATE trips SET cover_image_url = ?, updated_at = ? WHERE id = ?').run(coverImageUrl, now, tripId);
  });
  save();

  return NextResponse.json({ coverImageUrl });
});

export const DELETE = withErrorHandling(async (request: Request, { params }: { params: Promise<{ tripId: string }> }) => {
  const { tripId } = await params;
  const userId = getUserId(request);
  if (!requireTrip(tripId, userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date().toISOString();
  const remove = db.transaction(() => {
    db.prepare('DELETE FROM trip_cover_images WHERE trip_id = ?').run(tripId);
    db.prepare('UPDATE trips SET cover_image_url = NULL, updated_at = ? WHERE id = ?').run(now, tripId);
  });
  remove();

  return new NextResponse(null, { status: 204 });
});
