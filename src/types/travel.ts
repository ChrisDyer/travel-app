export type TripStatus = 'planning' | 'confirmed' | 'in-progress' | 'completed';
export type BookingStatus = 'unbooked' | 'pending' | 'confirmed';
export type EventCategory = 'flight' | 'hotel' | 'restaurant' | 'activity' | 'hike' | 'transport' | 'parking' | 'note';
export type PackingCategory = 'Documents & Essentials' | 'Clothing' | 'Tech & Apps' | 'Health & Comfort';

export interface Traveler {
  name: string;
  email?: string;
}

export interface Trip {
  id: string;
  userId: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: TripStatus;
  coverImageUrl: string | null;
  travelers: Traveler[] | string;
  notes: string | null;
  travelMode: 'fly' | 'drive';
  rentalCarNeeded: boolean;
  digestEnabled: boolean;
  digestDayOfWeek: number;
  budget: number | null;
  budgetCurrency: string | null;
  planningNotes: string | null;
  planningNotesPrevious: string | null;
  planningNotesUpdatedAt: string | null;
  planningNotesUpdatedBy: 'you' | 'assistant' | null;
  /** Cached geocode of destination. NULL until first resolved, or after destination changes. */
  latitude: number | null;
  longitude: number | null;
  /** Geocoder display name, e.g. 'Paris, France'. Written only by GET /api/map. */
  resolvedName: string | null;
  /** Explicit IANA timezone override, e.g. 'America/Chicago'. NULL = derive from the destination.
   *  Survives destination edits — unlike resolvedTimezone, which is cleared with the geocode. */
  timezone: string | null;
  /** Cached IANA timezone of the destination. Derived; cleared whenever destination changes. */
  resolvedTimezone: string | null;
  /** Keep this whole trip off every calendar feed and the .ics download. Cascades to its
   *  events, flights, hotels, cars, parking and transit. Stored 0/1. */
  hideFromCalendar: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface TripDay {
  id: string;
  tripId: string;
  date: string;
  dayNumber: number;
  title: string | null;
  notes: string | null;
}
export interface TripLeg {
  id: string;
  tripId: string;
  /** What the traveller typed - the geocoder input. */
  place: string;
  startDate: string;
  endDate: string;
  /** Cached geocode. NULL until first resolved, or after `place` changes. */
  latitude: number | null;
  longitude: number | null;
  /** The geocoder's display name, e.g. 'Port Angeles, United States'. */
  resolvedName: string | null;
  /** Cached IANA timezone of this leg's place. Derived; cleared whenever `place` changes.
   *  The calendar feed stamps items on this leg's dates with it. */
  resolvedTimezone: string | null;
  /** Tiebreaker for overlapping legs only - legs display in date order. */
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface TripEvent {
  id: string;
  tripDayId: string;
  tripId: string;
  category: EventCategory;
  title: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  locationUrl: string | null;
  bookingStatus: BookingStatus;
  confirmationNumber: string | null;
  confirmationSource: 'manual' | 'gmail' | null;
  sourceEmailId: string | null;
  bookingUrl: string | null;
  cost: number | null;
  currency: string | null;
  seatInfo: string | null;
  vendor: string | null;
  orderNumber: string | null;
  cancellationPolicy: string | null;
  cancellationDeadline: string | null;
  hikeDistance: string | null;
  hikeElevation: string | null;
  trailheadLocation: string | null;
  alltrailsUrl: string | null;
  // "Does this need booking?" — restaurants that take reservations, activities you must
  // book ahead. 0 for a walk-in restaurant or a walk-up activity. Stored 0/1, treat as
  // truthy; always 1 for other categories. See src/lib/bookings.ts.
  takesReservations: boolean;
  partySize: number | null;     // restaurant only
  /** Keep this item off every calendar feed and the .ics download. Stored 0/1. */
  hideFromCalendar: number;
  sortOrder: number;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type FlightTripType = 'one-way' | 'round-trip';

export interface TripFlight {
  id: string;
  tripId: string;
  tripType: FlightTripType;
  airline: string | null;
  flightNumber: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
  departureDate: string | null;
  departureTime: string | null;
  arrivalDate: string | null;
  arrivalTime: string | null;
  confirmationNumber: string | null;
  seats: string | null;
  returnFlightNumber: string | null;
  returnDepartureDate: string | null;
  returnDepartureTime: string | null;
  returnArrivalDate: string | null;
  returnArrivalTime: string | null;
  returnConfirmationNumber: string | null;
  returnSeats: string | null;
  bookingStatus: BookingStatus;
  cancellationPolicy: string | null;
  cost: number | null;
  currency: string | null;
  notes: string | null;
  /** Keep this item off every calendar feed and the .ics download. Stored 0/1. */
  hideFromCalendar: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface TripParking {
  id: string;
  tripId: string;
  location: string;
  address: string | null;
  level: string | null;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  confirmationNumber: string | null;
  orderNumber: string | null;
  vendor: string | null;
  bookingStatus: BookingStatus;
  cost: number | null;
  currency: string | null;
  notes: string | null;
  /** Keep this item off every calendar feed and the .ics download. Stored 0/1. */
  hideFromCalendar: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface TripHotel {
  id: string;
  tripId: string;
  name: string;
  address: string | null;
  locationUrl: string | null;
  checkInDate: string | null;
  checkInTime: string | null;
  checkOutDate: string | null;
  checkOutTime: string | null;
  confirmationNumber: string | null;
  roomType: string | null;
  amenities: string | null;
  bookingStatus: BookingStatus;
  cancellationPolicy: string | null;
  cancellationDeadline: string | null;
  cost: number | null;
  currency: string | null;
  notes: string | null;
  /** Keep this item off every calendar feed and the .ics download. Stored 0/1. */
  hideFromCalendar: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface TripRentalCar {
  id: string;
  tripId: string;
  company: string;
  carClass: string | null;
  confirmationNumber: string | null;
  pickupDate: string | null;
  pickupTime: string | null;
  pickupLocation: string | null;
  dropoffDate: string | null;
  dropoffTime: string | null;
  dropoffLocation: string | null;
  driverName: string | null;
  bookingStatus: BookingStatus;
  cancellationPolicy: string | null;
  cost: number | null;
  currency: string | null;
  notes: string | null;
  /** Keep this item off every calendar feed and the .ics download. Stored 0/1. */
  hideFromCalendar: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type TransitType = 'train' | 'bus' | 'ferry' | 'subway' | 'shuttle' | 'taxi' | 'rideshare' | 'other';

export interface TripTransit {
  id: string;
  tripId: string;
  transitType: TransitType | null;
  operator: string;
  routeNumber: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  departureDate: string | null;
  departureTime: string | null;
  arrivalDate: string | null;
  arrivalTime: string | null;
  confirmationNumber: string | null;
  seatInfo: string | null;
  bookingStatus: BookingStatus;
  cost: number | null;
  currency: string | null;
  notes: string | null;
  /** Keep this item off every calendar feed and the .ics download. Stored 0/1. */
  hideFromCalendar: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PackingItem {
  id: string;
  tripId: string;
  category: PackingCategory;
  item: string;
  isPacked: boolean;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// --- Assistant proposal types ---

export interface ProposedEvent {
  type: 'event';
  tripDayId: string;
  category: EventCategory;
  title: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  notes?: string | null;
  bookingStatus?: BookingStatus;
  confirmationNumber?: string | null;
  cost?: number | null;
  currency?: string | null;
  takesReservations?: boolean | null;
}

export interface ProposedFlight {
  type: 'flight';
  tripType?: FlightTripType;
  airline?: string | null;
  flightNumber?: string | null;
  departureAirport?: string | null;
  arrivalAirport?: string | null;
  departureDate?: string | null;
  departureTime?: string | null;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  confirmationNumber?: string | null;
  seats?: string | null;
  bookingStatus?: BookingStatus;
  cost?: number | null;
  currency?: string | null;
}

export interface ProposedHotel {
  type: 'hotel';
  name: string;
  address?: string | null;
  checkInDate?: string | null;
  checkInTime?: string | null;
  checkOutDate?: string | null;
  checkOutTime?: string | null;
  confirmationNumber?: string | null;
  roomType?: string | null;
  bookingStatus?: BookingStatus;
  cost?: number | null;
  currency?: string | null;
  notes?: string | null;
}

export interface ProposedRentalCar {
  type: 'rental_car';
  company: string;
  carClass?: string | null;
  confirmationNumber?: string | null;
  pickupDate?: string | null;
  pickupTime?: string | null;
  pickupLocation?: string | null;
  dropoffDate?: string | null;
  dropoffTime?: string | null;
  dropoffLocation?: string | null;
  bookingStatus?: BookingStatus;
  cost?: number | null;
  currency?: string | null;
  notes?: string | null;
}

export interface ProposedParking {
  type: 'parking';
  location: string;
  address?: string | null;
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  confirmationNumber?: string | null;
  orderNumber?: string | null;
  vendor?: string | null;
  bookingStatus?: BookingStatus;
  cost?: number | null;
  currency?: string | null;
  notes?: string | null;
}

export interface ProposedTransit {
  type: 'transit';
  operator: string;
  transitType?: TransitType | null;
  routeNumber?: string | null;
  fromLocation?: string | null;
  toLocation?: string | null;
  departureDate?: string | null;
  departureTime?: string | null;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  confirmationNumber?: string | null;
  seatInfo?: string | null;
  bookingStatus?: BookingStatus;
  cost?: number | null;
  currency?: string | null;
  notes?: string | null;
}

export type Proposal = ProposedEvent | ProposedFlight | ProposedHotel | ProposedRentalCar | ProposedParking | ProposedTransit;
