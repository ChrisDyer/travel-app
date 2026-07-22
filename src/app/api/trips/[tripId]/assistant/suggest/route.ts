import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { db, camelize, camelizeAll } from '@/db';
import { getUserId } from '@/lib/auth';
import type { Trip, TripDay, TripEvent, TripFlight, TripHotel, TripRentalCar, TripParking, TripTransit, Proposal } from '@/types/travel';

const anthropic = new Anthropic();

// Simple fixed-window rate limiter to cap AI spend against a runaway client loop.
// Single-user app, so one global window suffices.
const AI_MAX_PER_WINDOW = 15;
const AI_WINDOW_MS = 60_000;
let aiWindowStart = 0;
let aiWindowCount = 0;
function aiRateLimitOk(): boolean {
  const now = Date.now();
  if (now - aiWindowStart >= AI_WINDOW_MS) {
    aiWindowStart = now;
    aiWindowCount = 0;
  }
  aiWindowCount++;
  return aiWindowCount <= AI_MAX_PER_WINDOW;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'propose_event',
    description: 'Propose adding an activity, restaurant, or other event to a specific day of the itinerary.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tripDayId: { type: 'string', description: 'The ID of the trip day to add this event to.' },
        category: { type: 'string', enum: ['activity', 'hike', 'restaurant', 'transport', 'note', 'hotel', 'flight', 'parking'], description: 'Event category.' },
        title: { type: 'string', description: 'Event name or title.' },
        startTime: { type: 'string', description: 'Start time in HH:MM format (24h).' },
        endTime: { type: 'string', description: 'End time in HH:MM format (24h).' },
        location: { type: 'string', description: 'Address or place name.' },
        notes: { type: 'string', description: 'Any additional notes.' },
        confirmationNumber: { type: 'string', description: 'Booking confirmation number if available.' },
        bookingStatus: { type: 'string', enum: ['unbooked', 'pending', 'confirmed'], description: 'Booking status.' },
        cost: { type: 'number', description: 'Cost amount.' },
        currency: { type: 'string', description: 'Currency code, e.g. USD.' },
      },
      required: ['tripDayId', 'category', 'title'],
    },
  },
  {
    name: 'propose_flight',
    description: 'Propose adding a flight to the trip.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tripType: { type: 'string', enum: ['one-way', 'round-trip'] },
        airline: { type: 'string' },
        flightNumber: { type: 'string' },
        departureAirport: { type: 'string', description: 'Airport name or code, e.g. "Los Angeles (LAX)".' },
        arrivalAirport: { type: 'string' },
        departureDate: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
        departureTime: { type: 'string', description: 'Time in HH:MM format.' },
        arrivalDate: { type: 'string' },
        arrivalTime: { type: 'string' },
        confirmationNumber: { type: 'string' },
        seats: { type: 'string', description: 'Seat assignment(s).' },
        bookingStatus: { type: 'string', enum: ['unbooked', 'pending', 'confirmed'] },
        cost: { type: 'number' },
        currency: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'propose_hotel',
    description: 'Propose adding a hotel stay to the trip.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Hotel name.' },
        address: { type: 'string' },
        checkInDate: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
        checkInTime: { type: 'string' },
        checkOutDate: { type: 'string' },
        checkOutTime: { type: 'string' },
        confirmationNumber: { type: 'string' },
        roomType: { type: 'string' },
        bookingStatus: { type: 'string', enum: ['unbooked', 'pending', 'confirmed'] },
        cost: { type: 'number' },
        currency: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'propose_rental_car',
    description: 'Propose adding a car rental to the trip.',
    input_schema: {
      type: 'object' as const,
      properties: {
        company: { type: 'string', description: 'Rental car company name, e.g. "Hertz".' },
        carClass: { type: 'string', description: 'Car class or type, e.g. "Compact SUV".' },
        confirmationNumber: { type: 'string' },
        pickupDate: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
        pickupTime: { type: 'string', description: 'Time in HH:MM format.' },
        pickupLocation: { type: 'string', description: 'Pick-up location name or address.' },
        dropoffDate: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
        dropoffTime: { type: 'string', description: 'Time in HH:MM format.' },
        dropoffLocation: { type: 'string', description: 'Drop-off location name or address.' },
        bookingStatus: { type: 'string', enum: ['unbooked', 'pending', 'confirmed'] },
        cost: { type: 'number' },
        currency: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['company'],
    },
  },
  {
    name: 'propose_parking',
    description: 'Propose adding a parking reservation to the trip.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location: { type: 'string', description: 'Parking lot or garage name.' },
        address: { type: 'string' },
        startDate: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
        startTime: { type: 'string', description: 'Time in HH:MM format.' },
        endDate: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
        endTime: { type: 'string', description: 'Time in HH:MM format.' },
        confirmationNumber: { type: 'string' },
        orderNumber: { type: 'string' },
        vendor: { type: 'string', description: 'Vendor or booking service name.' },
        bookingStatus: { type: 'string', enum: ['unbooked', 'pending', 'confirmed'] },
        cost: { type: 'number' },
        currency: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['location'],
    },
  },
  {
    name: 'propose_transit',
    description: 'Propose adding a transit booking (train, bus, ferry, etc.) to the trip.',
    input_schema: {
      type: 'object' as const,
      properties: {
        operator: { type: 'string', description: 'Transit operator or service name, e.g. "Amtrak" or "Eurostar".' },
        transitType: { type: 'string', enum: ['train', 'bus', 'ferry', 'subway', 'shuttle', 'taxi', 'rideshare', 'other'] },
        routeNumber: { type: 'string' },
        fromLocation: { type: 'string', description: 'Departure station or stop.' },
        toLocation: { type: 'string', description: 'Arrival station or stop.' },
        departureDate: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
        departureTime: { type: 'string', description: 'Time in HH:MM format.' },
        arrivalDate: { type: 'string' },
        arrivalTime: { type: 'string' },
        confirmationNumber: { type: 'string' },
        seatInfo: { type: 'string', description: 'Seat or coach assignment.' },
        bookingStatus: { type: 'string', enum: ['unbooked', 'pending', 'confirmed'] },
        cost: { type: 'number' },
        currency: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['operator'],
    },
  },
];

async function refreshGmailToken(userId: string, refreshToken: string): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_GMAIL_CLIENT_ID!,
      client_secret: process.env.GOOGLE_GMAIL_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  db.prepare('UPDATE gmail_tokens SET access_token = ?, expires_at = ?, updated_at = ? WHERE user_id = ?')
    .run(data.access_token, expiresAt, new Date().toISOString(), userId);
  return data.access_token;
}

const TRAVEL_LABEL_NAME = 'Trip Bookings';

async function getTravelLabelId(accessToken: string): Promise<string | null> {
  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/labels',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  const data = await res.json() as { labels?: { id: string; name: string }[] };
  return data.labels?.find((l) => l.name === TRAVEL_LABEL_NAME)?.id ?? null;
}

interface GmailBodyPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailBodyPart[];
}

function decodeBase64(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractTextBody(payload: GmailBodyPart): string {
  // Prefer text/plain — search recursively through the full MIME tree
  const plain = findPart(payload, 'text/plain');
  if (plain) return decodeBase64(plain);

  // Fall back to text/html, stripping tags so Claude gets readable text
  const html = findPart(payload, 'text/html');
  if (html) return stripHtml(decodeBase64(html));

  return '';
}

function findPart(part: GmailBodyPart, mimeType: string): string | null {
  if (part.mimeType === mimeType && part.body?.data) return part.body.data;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

async function fetchTravelEmails(accessToken: string): Promise<{ emails: string; labelMissing: boolean }> {
  const labelId = await getTravelLabelId(accessToken);
  if (!labelId) return { emails: '', labelMissing: true };

  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('labelIds', labelId);
  url.searchParams.set('maxResults', '20');

  const listRes = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!listRes.ok) return { emails: '', labelMissing: false };
  const listData = await listRes.json() as { messages?: { id: string }[] };
  const messages = listData.messages ?? [];

  const emailTexts: string[] = [];
  for (const msg of messages.slice(0, 15)) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!msgRes.ok) continue;
    const msgData = await msgRes.json() as {
      payload?: GmailBodyPart & { headers?: { name: string; value: string }[] };
    };
    const hdrs = msgData.payload?.headers ?? [];
    const subject = hdrs.find((h) => h.name === 'Subject')?.value ?? '';
    const from = hdrs.find((h) => h.name === 'From')?.value ?? '';
    const date = hdrs.find((h) => h.name === 'Date')?.value ?? '';
    const body = msgData.payload ? extractTextBody(msgData.payload).slice(0, 6000) : '';
    emailTexts.push(`From: ${from}\nDate: ${date}\nSubject: ${subject}\n---\n${body}`);
  }

  return { emails: emailTexts.join('\n\n===\n\n'), labelMissing: false };
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const userId = getUserId(request);

  if (!aiRateLimitOk()) {
    return NextResponse.json({ error: 'Rate limit exceeded — try again shortly.' }, { status: 429 });
  }

  const tripRow = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId) as Record<string, unknown> | undefined;
  if (!tripRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const trip = camelize<Trip>(tripRow);

  const body = await request.json() as {
    mode: 'email' | 'brainstorm';
    query?: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
  };

  const daysRows = db.prepare('SELECT * FROM trip_days WHERE trip_id = ? ORDER BY day_number ASC').all(tripId) as Record<string, unknown>[];
  const days = camelizeAll<TripDay>(daysRows);
  const eventsRows = db.prepare('SELECT id, title, category, trip_day_id FROM trip_events WHERE trip_id = ?').all(tripId) as Record<string, unknown>[];
  const events = camelizeAll<Pick<TripEvent, 'id' | 'title' | 'category' | 'tripDayId'>>(eventsRows);
  const flightRows = db.prepare('SELECT airline, flight_number, departure_date FROM trip_flights WHERE trip_id = ?').all(tripId) as Record<string, unknown>[];
  const flights = camelizeAll<Pick<TripFlight, 'airline' | 'flightNumber' | 'departureDate'>>(flightRows);
  const hotelRows = db.prepare('SELECT name, check_in_date, check_out_date FROM trip_hotels WHERE trip_id = ?').all(tripId) as Record<string, unknown>[];
  const hotels = camelizeAll<Pick<TripHotel, 'name' | 'checkInDate' | 'checkOutDate'>>(hotelRows);
  const rentalCarRows = db.prepare('SELECT company, pickup_date, dropoff_date FROM trip_rental_cars WHERE trip_id = ?').all(tripId) as Record<string, unknown>[];
  const rentalCars = camelizeAll<Pick<TripRentalCar, 'company' | 'pickupDate' | 'dropoffDate'>>(rentalCarRows);
  const parkingRows = db.prepare('SELECT location, start_date, end_date FROM trip_parking WHERE trip_id = ?').all(tripId) as Record<string, unknown>[];
  const parkingItems = camelizeAll<Pick<TripParking, 'location' | 'startDate' | 'endDate'>>(parkingRows);
  const transitRows = db.prepare('SELECT operator, departure_date FROM trip_transit WHERE trip_id = ?').all(tripId) as Record<string, unknown>[];
  const transitItems = camelizeAll<Pick<TripTransit, 'operator' | 'departureDate'>>(transitRows);

  // Build context for Claude
  const dayMap = days.map((d) => `  Day ${d.dayNumber} (${d.date}) — id: ${d.id}`).join('\n');
  const existingEvents = events.map((e) => {
    const day = days.find((d) => d.id === e.tripDayId);
    return `  - ${e.title} (${e.category})${day ? ` on Day ${day.dayNumber}` : ''}`;
  }).join('\n');
  const existingFlights = flights.map((f) => `  - ${f.airline ?? ''} ${f.flightNumber ?? ''} on ${f.departureDate ?? ''}`).join('\n');
  const existingHotels = hotels.map((h) => `  - ${h.name} (${h.checkInDate ?? '?'} to ${h.checkOutDate ?? '?'})`).join('\n');
  const existingRentalCars = rentalCars.map((c) => `  - ${c.company} (${c.pickupDate ?? '?'} to ${c.dropoffDate ?? '?'})`).join('\n');
  const existingParking = parkingItems.map((p) => `  - ${p.location} (${p.startDate ?? '?'} to ${p.endDate ?? '?'})`).join('\n');
  const existingTransit = transitItems.map((t) => `  - ${t.operator} on ${t.departureDate ?? '?'}`).join('\n');

  let emailContent = '';
  if (body.mode === 'email') {
    const tokenRow = db.prepare('SELECT * FROM gmail_tokens WHERE user_id = ?').get(userId) as {
      access_token: string; refresh_token: string | null; expires_at: string;
    } | undefined;

    if (!tokenRow) {
      return NextResponse.json({ error: 'gmail_not_connected' }, { status: 401 });
    }

    let accessToken = tokenRow.access_token;
    if (new Date(tokenRow.expires_at) <= new Date() && tokenRow.refresh_token) {
      const refreshed = await refreshGmailToken(userId, tokenRow.refresh_token);
      if (!refreshed) return NextResponse.json({ error: 'gmail_token_expired' }, { status: 401 });
      accessToken = refreshed;
    }

    const result = await fetchTravelEmails(accessToken);
    if (result.labelMissing) {
      return NextResponse.json({ error: 'gmail_label_missing', label: TRAVEL_LABEL_NAME }, { status: 422 });
    }
    emailContent = result.emails;
  }

  const systemPrompt = `You are a travel planning assistant helping to build an itinerary for "${trip.title}" — a trip to ${trip.destination} from ${trip.startDate} to ${trip.endDate}.

Trip days and their IDs (use these IDs when calling propose_event):
${dayMap}

What's already in the itinerary:
Events:
${existingEvents || '  (none yet)'}
Flights:
${existingFlights || '  (none yet)'}
Hotels:
${existingHotels || '  (none yet)'}
Rental Cars:
${existingRentalCars || '  (none yet)'}
Parking:
${existingParking || '  (none yet)'}
Transit:
${existingTransit || '  (none yet)'}

Your role: analyse the information provided and call the proposal tools for anything worth adding. Briefly narrate what you found and why you're proposing each item. Don't propose things already in the itinerary.`;

  const userMessage = body.mode === 'email'
    ? `Here are recent travel-related emails. Extract any bookings or itinerary information relevant to this trip and propose them as additions:\n\n${emailContent || '(No travel emails found in the last 6 months.)'}`
    : body.query ?? 'Suggest activities and experiences that would make this trip great.';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const msgStream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [
            ...(body.history ?? []),
            { role: 'user', content: userMessage },
          ],
          tools: TOOLS,
        });

        msgStream.on('text', (text) => {
          send({ type: 'text', content: text });
        });

        const finalMsg = await msgStream.finalMessage();

        for (const block of finalMsg.content) {
          if (block.type === 'tool_use') {
            const input = block.input as Record<string, unknown>;
            let proposal: Proposal | null = null;

            if (block.name === 'propose_event') {
              proposal = { type: 'event', ...input } as Proposal;
            } else if (block.name === 'propose_flight') {
              proposal = { type: 'flight', ...input } as Proposal;
            } else if (block.name === 'propose_hotel') {
              proposal = { type: 'hotel', ...input } as Proposal;
            } else if (block.name === 'propose_rental_car') {
              proposal = { type: 'rental_car', ...input } as Proposal;
            } else if (block.name === 'propose_parking') {
              proposal = { type: 'parking', ...input } as Proposal;
            } else if (block.name === 'propose_transit') {
              proposal = { type: 'transit', ...input } as Proposal;
            }

            if (proposal) send({ type: 'proposal', proposal });
          }
        }

        send({ type: 'done' });
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
