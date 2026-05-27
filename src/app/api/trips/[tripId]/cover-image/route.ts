import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getUserId } from '@/lib/auth';
import path from 'path';
import fs from 'fs/promises';

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);

  const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId) as { id: string } | undefined;
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  const sharp = (await import('sharp')).default;
  const resized = await sharp(buffer)
    .resize(600, 400, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85 })
    .toBuffer();

  const filename = `${tripId}.jpg`;
  const uploadDir = path.join(process.cwd(), 'public', 'trip-photos');
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, filename), resized);

  const coverImageUrl = `/trip-photos/${filename}`;
  db.prepare('UPDATE trips SET cover_image_url = ?, updated_at = ? WHERE id = ?')
    .run(coverImageUrl, new Date().toISOString(), tripId);

  return NextResponse.json({ coverImageUrl });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);

  const trip = db.prepare('SELECT id, cover_image_url FROM trips WHERE id = ? AND user_id = ?')
    .get(tripId, userId) as { id: string; cover_image_url: string | null } | undefined;
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (trip.cover_image_url) {
    const filePath = path.join(process.cwd(), 'public', trip.cover_image_url);
    await fs.unlink(filePath).catch(() => {});
  }

  db.prepare('UPDATE trips SET cover_image_url = NULL, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), tripId);

  return new NextResponse(null, { status: 204 });
}
