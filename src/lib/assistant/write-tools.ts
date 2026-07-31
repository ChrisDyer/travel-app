import { z } from 'zod';
import { db, camelize } from '@/db';
import type {
  Proposal,
  TripEvent,
  TripFlight,
  TripHotel,
  TripParking,
  TripRentalCar,
  TripTransit,
} from '@/types/travel';

const bookingStatusSchema = z.enum(['unbooked', 'pending', 'confirmed']).default('unbooked');
const eventCategorySchema = z.enum(['activity', 'hike', 'restaurant', 'transport', 'note', 'hotel', 'flight', 'parking']);
const flightTripTypeSchema = z.enum(['one-way', 'round-trip']).default('one-way');
const transitTypeSchema = z.enum(['train', 'bus', 'ferry', 'subway', 'shuttle', 'taxi', 'rideshare', 'other']);

const optionalText = z.preprocess(
  (value) => value === '' ? null : value,
  z.string().nullable().optional()
);
const optionalNumber = z.preprocess(
  (value) => value === '' || value == null ? null : Number(value),
  z.number().finite().nonnegative().nullable().optional()
);

const eventInputSchema = z.object({
  type: z.literal('event'),
  tripDayId: z.string().min(1),
  category: eventCategorySchema,
  title: z.string().min(1),
  startTime: optionalText,
  endTime: optionalText,
  location: optionalText,
  locationUrl: optionalText,
  notes: optionalText,
  bookingStatus: bookingStatusSchema.optional(),
  confirmationNumber: optionalText,
  sourceEmailId: optionalText,
  bookingUrl: optionalText,
  cost: optionalNumber,
  currency: optionalText,
  seatInfo: optionalText,
  vendor: optionalText,
  orderNumber: optionalText,
  cancellationPolicy: optionalText,
  cancellationDeadline: optionalText,
  hikeDistance: optionalText,
  hikeElevation: optionalText,
  trailheadLocation: optionalText,
  alltrailsUrl: optionalText,
  takesReservations: z.boolean().nullable().optional(),
  partySize: optionalNumber,
});

const flightInputSchema = z.object({
  type: z.literal('flight'),
  tripType: flightTripTypeSchema.optional(),
  airline: optionalText,
  flightNumber: optionalText,
  departureAirport: optionalText,
  arrivalAirport: optionalText,
  departureDate: optionalText,
  departureTime: optionalText,
  arrivalDate: optionalText,
  arrivalTime: optionalText,
  confirmationNumber: optionalText,
  seats: optionalText,
  returnFlightNumber: optionalText,
  returnDepartureDate: optionalText,
  returnDepartureTime: optionalText,
  returnArrivalDate: optionalText,
  returnArrivalTime: optionalText,
  returnConfirmationNumber: optionalText,
  returnSeats: optionalText,
  bookingStatus: bookingStatusSchema.optional(),
  cancellationPolicy: optionalText,
  cost: optionalNumber,
  currency: optionalText,
  notes: optionalText,
});

const hotelInputSchema = z.object({
  type: z.literal('hotel'),
  name: z.string().min(1),
  address: optionalText,
  checkInDate: optionalText,
  checkInTime: optionalText,
  checkOutDate: optionalText,
  checkOutTime: optionalText,
  confirmationNumber: optionalText,
  roomType: optionalText,
  amenities: optionalText,
  bookingStatus: bookingStatusSchema.optional(),
  cancellationPolicy: optionalText,
  cancellationDeadline: optionalText,
  cost: optionalNumber,
  currency: optionalText,
  notes: optionalText,
});

const rentalCarInputSchema = z.object({
  type: z.literal('rental_car'),
  company: z.string().min(1),
  carClass: optionalText,
  confirmationNumber: optionalText,
  pickupDate: optionalText,
  pickupTime: optionalText,
  pickupLocation: optionalText,
  dropoffDate: optionalText,
  dropoffTime: optionalText,
  dropoffLocation: optionalText,
  driverName: optionalText,
  bookingStatus: bookingStatusSchema.optional(),
  cancellationPolicy: optionalText,
  cost: optionalNumber,
  currency: optionalText,
  notes: optionalText,
});

const parkingInputSchema = z.object({
  type: z.literal('parking'),
  location: z.string().min(1),
  address: optionalText,
  level: optionalText,
  startDate: optionalText,
  startTime: optionalText,
  endDate: optionalText,
  endTime: optionalText,
  confirmationNumber: optionalText,
  orderNumber: optionalText,
  vendor: optionalText,
  bookingStatus: bookingStatusSchema.optional(),
  cost: optionalNumber,
  currency: optionalText,
  notes: optionalText,
});

const transitInputSchema = z.object({
  type: z.literal('transit'),
  operator: z.string().min(1),
  transitType: transitTypeSchema.nullable().optional(),
  routeNumber: optionalText,
  fromLocation: optionalText,
  toLocation: optionalText,
  departureDate: optionalText,
  departureTime: optionalText,
  arrivalDate: optionalText,
  arrivalTime: optionalText,
  confirmationNumber: optionalText,
  seatInfo: optionalText,
  bookingStatus: bookingStatusSchema.optional(),
  cost: optionalNumber,
  currency: optionalText,
  notes: optionalText,
});

const writeToolInputSchema = z.discriminatedUnion('type', [
  eventInputSchema,
  flightInputSchema,
  hotelInputSchema,
  rentalCarInputSchema,
  parkingInputSchema,
  transitInputSchema,
]);

export type TravelWriteToolInput = z.infer<typeof writeToolInputSchema>;

const writeToolNames = {
  add_event: 'event',
  add_flight: 'flight',
  add_hotel: 'hotel',
  add_rental_car: 'rental_car',
  add_parking: 'parking',
  add_transit: 'transit',
} as const;

export type TravelWriteToolName = keyof typeof writeToolNames;

export interface TravelWriteResult {
  addedEvents: TripEvent[];
  addedFlights: TripFlight[];
  addedHotels: TripHotel[];
  addedRentalCars: TripRentalCar[];
  addedParking: TripParking[];
  addedTransit: TripTransit[];
  skipped: { type: string; reason: string }[];
}

export function emptyTravelWriteResult(): TravelWriteResult {
  return {
    addedEvents: [],
    addedFlights: [],
    addedHotels: [],
    addedRentalCars: [],
    addedParking: [],
    addedTransit: [],
    skipped: [],
  };
}

function isDuplicate(table: string, tripId: string, where: string, params: unknown[]): boolean {
  return !!db.prepare(`SELECT 1 FROM ${table} WHERE trip_id = ? AND ${where} LIMIT 1`).get(tripId, ...params);
}

export function applyTravelWriteTools(tripId: string, inputs: unknown[]): TravelWriteResult {  const result = emptyTravelWriteResult();
  const now = new Date().toISOString();
  const validDayIds = new Set(
    (db.prepare('SELECT id FROM trip_days WHERE trip_id = ?').all(tripId) as { id: string }[])
      .map((d) => d.id)
  );

  for (const rawInput of inputs) {
    const parsed = writeToolInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      result.skipped.push({ type: readInputType(rawInput), reason: 'invalid tool input' });
      continue;
    }

    const input = parsed.data;
    if (input.type === 'event') {
      if (!validDayIds.has(input.tripDayId)) {
        result.skipped.push({ type: 'event', reason: 'invalid tripDayId for this trip' });
        continue;
      }
      if (isDuplicate('trip_events', tripId, 'lower(title) = lower(?) AND trip_day_id = ?', [input.title, input.tripDayId])) {
        result.skipped.push({ type: 'event', reason: 'already on that day' });
        continue;
      }
      const id = crypto.randomUUID();
      const row = db.prepare(`
        INSERT INTO trip_events (
          id, trip_day_id, trip_id, category, title, start_time, end_time, location, location_url,
          booking_status, confirmation_number, confirmation_source, source_email_id, booking_url,
          cost, currency, seat_info, vendor, order_number, cancellation_policy, cancellation_deadline,
          hike_distance, hike_elevation, trailhead_location, alltrails_url, takes_reservations, party_size,
          sort_order, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        RETURNING *
      `).get(
        id, input.tripDayId, tripId, input.category, input.title,
        input.startTime ?? null, input.endTime ?? null, input.location ?? null, input.locationUrl ?? null,
        input.bookingStatus ?? 'unbooked', input.confirmationNumber ?? null,
        'gmail', input.sourceEmailId ?? null, input.bookingUrl ?? null,
        input.cost ?? null, input.currency ?? null, input.seatInfo ?? null, input.vendor ?? null,
        input.orderNumber ?? null, input.cancellationPolicy ?? null, input.cancellationDeadline ?? null,
        input.hikeDistance ?? null, input.hikeElevation ?? null, input.trailheadLocation ?? null, input.alltrailsUrl ?? null,
        input.takesReservations == null ? 1 : (input.takesReservations ? 1 : 0), input.partySize ?? null,
        input.notes ?? null, now, now
      ) as Record<string, unknown>;
      result.addedEvents.push(camelize<TripEvent>(row));
    } else if (input.type === 'flight') {
      if (input.flightNumber && input.departureDate &&
          isDuplicate('trip_flights', tripId, 'flight_number = ? AND departure_date = ?', [input.flightNumber, input.departureDate])) {
        result.skipped.push({ type: 'flight', reason: 'already added' });
        continue;
      }
      const id = crypto.randomUUID();
      const row = db.prepare(`
        INSERT INTO trip_flights (
          id, trip_id, trip_type, airline, flight_number, departure_airport, arrival_airport,
          departure_date, departure_time, arrival_date, arrival_time, confirmation_number, seats,
          return_flight_number, return_departure_date, return_departure_time, return_arrival_date,
          return_arrival_time, return_confirmation_number, return_seats,
          booking_status, cancellation_policy, cost, currency, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).get(
        id, tripId, input.tripType ?? 'one-way', input.airline ?? null,
        input.flightNumber ?? null, input.departureAirport ?? null, input.arrivalAirport ?? null,
        input.departureDate ?? null, input.departureTime ?? null,
        input.arrivalDate ?? null, input.arrivalTime ?? null,
        input.confirmationNumber ?? null, input.seats ?? null,
        input.returnFlightNumber ?? null, input.returnDepartureDate ?? null, input.returnDepartureTime ?? null,
        input.returnArrivalDate ?? null, input.returnArrivalTime ?? null, input.returnConfirmationNumber ?? null,
        input.returnSeats ?? null, input.bookingStatus ?? 'unbooked', input.cancellationPolicy ?? null,
        input.cost ?? null, input.currency ?? null, input.notes ?? null, now, now
      ) as Record<string, unknown>;
      result.addedFlights.push(camelize<TripFlight>(row));
    } else if (input.type === 'hotel') {
      if (input.checkInDate &&
          isDuplicate('trip_hotels', tripId, 'lower(name) = lower(?) AND check_in_date = ?', [input.name, input.checkInDate])) {
        result.skipped.push({ type: 'hotel', reason: 'already added' });
        continue;
      }
      const id = crypto.randomUUID();
      const row = db.prepare(`
        INSERT INTO trip_hotels (
          id, trip_id, name, address, check_in_date, check_in_time,
          check_out_date, check_out_time, confirmation_number, room_type,
          amenities, booking_status, cancellation_policy, cancellation_deadline, cost, currency, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).get(
        id, tripId, input.name, input.address ?? null,
        input.checkInDate ?? null, input.checkInTime ?? null,
        input.checkOutDate ?? null, input.checkOutTime ?? null,
        input.confirmationNumber ?? null, input.roomType ?? null,
        input.amenities ?? null, input.bookingStatus ?? 'unbooked',
        input.cancellationPolicy ?? null, input.cancellationDeadline ?? null,
        input.cost ?? null, input.currency ?? null, input.notes ?? null, now, now
      ) as Record<string, unknown>;
      result.addedHotels.push(camelize<TripHotel>(row));
    } else if (input.type === 'rental_car') {
      if (input.pickupDate &&
          isDuplicate('trip_rental_cars', tripId, 'lower(company) = lower(?) AND pickup_date = ?', [input.company, input.pickupDate])) {
        result.skipped.push({ type: 'rental_car', reason: 'already added' });
        continue;
      }
      const id = crypto.randomUUID();
      const row = db.prepare(`
        INSERT INTO trip_rental_cars (
          id, trip_id, company, car_class, confirmation_number,
          pickup_date, pickup_time, pickup_location,
          dropoff_date, dropoff_time, dropoff_location,
          driver_name, booking_status, cancellation_policy, cost, currency, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).get(
        id, tripId, input.company, input.carClass ?? null,
        input.confirmationNumber ?? null,
        input.pickupDate ?? null, input.pickupTime ?? null, input.pickupLocation ?? null,
        input.dropoffDate ?? null, input.dropoffTime ?? null, input.dropoffLocation ?? null,
        input.driverName ?? null, input.bookingStatus ?? 'unbooked', input.cancellationPolicy ?? null,
        input.cost ?? null, input.currency ?? null, input.notes ?? null, now, now
      ) as Record<string, unknown>;
      result.addedRentalCars.push(camelize<TripRentalCar>(row));
    } else if (input.type === 'parking') {
      if (input.startDate &&
          isDuplicate('trip_parking', tripId, 'lower(location) = lower(?) AND start_date = ?', [input.location, input.startDate])) {
        result.skipped.push({ type: 'parking', reason: 'already added' });
        continue;
      }
      const id = crypto.randomUUID();
      const row = db.prepare(`
        INSERT INTO trip_parking (
          id, trip_id, location, address, level, start_date, start_time, end_date, end_time,
          confirmation_number, order_number, vendor, booking_status, cost, currency, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).get(
        id, tripId, input.location, input.address ?? null, input.level ?? null,
        input.startDate ?? null, input.startTime ?? null,
        input.endDate ?? null, input.endTime ?? null,
        input.confirmationNumber ?? null, input.orderNumber ?? null, input.vendor ?? null,
        input.bookingStatus ?? 'unbooked', input.cost ?? null, input.currency ?? null,
        input.notes ?? null, now, now
      ) as Record<string, unknown>;
      result.addedParking.push(camelize<TripParking>(row));
    } else if (input.type === 'transit') {
      if (input.departureDate &&
          isDuplicate('trip_transit', tripId, 'lower(operator) = lower(?) AND departure_date = ?', [input.operator, input.departureDate])) {
        result.skipped.push({ type: 'transit', reason: 'already added' });
        continue;
      }
      const id = crypto.randomUUID();
      const row = db.prepare(`
        INSERT INTO trip_transit (
          id, trip_id, transit_type, operator, route_number, from_location, to_location,
          departure_date, departure_time, arrival_date, arrival_time,
          confirmation_number, seat_info, booking_status, cost, currency, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).get(
        id, tripId, input.transitType ?? null, input.operator,
        input.routeNumber ?? null, input.fromLocation ?? null, input.toLocation ?? null,
        input.departureDate ?? null, input.departureTime ?? null,
        input.arrivalDate ?? null, input.arrivalTime ?? null,
        input.confirmationNumber ?? null, input.seatInfo ?? null,
        input.bookingStatus ?? 'unbooked', input.cost ?? null, input.currency ?? null,
        input.notes ?? null, now, now
      ) as Record<string, unknown>;
      result.addedTransit.push(camelize<TripTransit>(row));
    }
  }

  return result;
}


export function proposalsToWriteToolInputs(proposals: Proposal[]): TravelWriteToolInput[] {
  return proposals.map((proposal) => writeToolInputSchema.parse(proposal));
}

export function writeToolUseToInput(name: string, rawInput: unknown): TravelWriteToolInput | null {
  if (!(name in writeToolNames)) return null;
  return writeToolInputSchema.parse({
    ...(rawInput && typeof rawInput === 'object' ? rawInput : {}),
    type: writeToolNames[name as TravelWriteToolName],
  });
}

function readInputType(input: unknown): string {
  if (input && typeof input === 'object' && 'type' in input && typeof input.type === 'string') {
    return input.type;
  }
  return 'unknown';
}
