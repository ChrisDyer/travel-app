export type BookingKind = 'flight' | 'hotel' | 'parking' | 'rentalCar' | 'transit' | 'event';
export type BookingRef = { kind: BookingKind; id: string };
