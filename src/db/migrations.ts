import type Database from 'better-sqlite3';

const migrations = [
  {
    name: '001_initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        destination TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planning',
        cover_image_url TEXT,
        travelers TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        travel_mode TEXT NOT NULL DEFAULT 'fly',
        rental_car_needed INTEGER NOT NULL DEFAULT 0,
        digest_enabled INTEGER NOT NULL DEFAULT 0,
        digest_day_of_week INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trip_days (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        day_number INTEGER NOT NULL,
        title TEXT,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS trip_events (
        id TEXT PRIMARY KEY,
        trip_day_id TEXT NOT NULL REFERENCES trip_days(id) ON DELETE CASCADE,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        location TEXT,
        location_url TEXT,
        booking_status TEXT NOT NULL DEFAULT 'unbooked',
        confirmation_number TEXT,
        confirmation_source TEXT,
        source_email_id TEXT,
        booking_url TEXT,
        cost REAL,
        currency TEXT,
        seat_info TEXT,
        vendor TEXT,
        order_number TEXT,
        cancellation_policy TEXT,
        cancellation_deadline TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS packing_items (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        item TEXT NOT NULL,
        is_packed INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trip_flights (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        trip_type TEXT NOT NULL DEFAULT 'one-way',
        airline TEXT,
        flight_number TEXT,
        departure_airport TEXT,
        arrival_airport TEXT,
        departure_date TEXT,
        departure_time TEXT,
        arrival_date TEXT,
        arrival_time TEXT,
        confirmation_number TEXT,
        seats TEXT,
        return_flight_number TEXT,
        return_departure_date TEXT,
        return_departure_time TEXT,
        return_arrival_date TEXT,
        return_arrival_time TEXT,
        return_confirmation_number TEXT,
        return_seats TEXT,
        booking_status TEXT NOT NULL DEFAULT 'unbooked',
        cancellation_policy TEXT,
        cost REAL,
        currency TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trip_parking (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        location TEXT NOT NULL,
        address TEXT,
        level TEXT,
        start_date TEXT,
        start_time TEXT,
        end_date TEXT,
        end_time TEXT,
        confirmation_number TEXT,
        order_number TEXT,
        vendor TEXT,
        booking_status TEXT NOT NULL DEFAULT 'unbooked',
        cost REAL,
        currency TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trip_hotels (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        address TEXT,
        location_url TEXT,
        check_in_date TEXT,
        check_in_time TEXT,
        check_out_date TEXT,
        check_out_time TEXT,
        confirmation_number TEXT,
        room_type TEXT,
        amenities TEXT,
        booking_status TEXT NOT NULL DEFAULT 'unbooked',
        cancellation_policy TEXT,
        cancellation_deadline TEXT,
        cost REAL,
        currency TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trip_rental_cars (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        company TEXT NOT NULL,
        car_class TEXT,
        confirmation_number TEXT,
        pickup_date TEXT,
        pickup_time TEXT,
        pickup_location TEXT,
        dropoff_date TEXT,
        dropoff_time TEXT,
        dropoff_location TEXT,
        driver_name TEXT,
        booking_status TEXT NOT NULL DEFAULT 'unbooked',
        cancellation_policy TEXT,
        cost REAL,
        currency TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trip_transit (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        transit_type TEXT,
        operator TEXT NOT NULL,
        route_number TEXT,
        from_location TEXT,
        to_location TEXT,
        departure_date TEXT,
        departure_time TEXT,
        arrival_date TEXT,
        arrival_time TEXT,
        confirmation_number TEXT,
        seat_info TEXT,
        booking_status TEXT NOT NULL DEFAULT 'unbooked',
        cost REAL,
        currency TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS gmail_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at TEXT NOT NULL,
        scope TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    name: '002_trip_budget',
    sql: `
      ALTER TABLE trips ADD COLUMN budget REAL;
      ALTER TABLE trips ADD COLUMN budget_currency TEXT;
    `,
  },
  {
    name: '003_cover_images',
    sql: `
      CREATE TABLE IF NOT EXISTS trip_cover_images (
        trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
        data BLOB NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    name: '004_hike_event_fields',
    sql: `
      ALTER TABLE trip_events ADD COLUMN hike_distance TEXT;
      ALTER TABLE trip_events ADD COLUMN hike_elevation TEXT;
      ALTER TABLE trip_events ADD COLUMN trailhead_location TEXT;
      ALTER TABLE trip_events ADD COLUMN alltrails_url TEXT;
    `,
  },
  {
    name: '005_restaurant_event_fields',
    sql: `
      ALTER TABLE trip_events ADD COLUMN takes_reservations INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE trip_events ADD COLUMN party_size INTEGER;
    `,
  },
  {
    name: '006_trip_brief',
    sql: `
      ALTER TABLE trips ADD COLUMN planning_notes TEXT;
      ALTER TABLE trips ADD COLUMN planning_notes_previous TEXT;
      ALTER TABLE trips ADD COLUMN planning_notes_updated_at TEXT;
      ALTER TABLE trips ADD COLUMN planning_notes_updated_by TEXT;
    `,
  },
  {
    name: '007_trip_legs',
    sql: `
      CREATE TABLE IF NOT EXISTS trip_legs (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        place TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        resolved_name TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_trip_legs_trip ON trip_legs (trip_id, start_date);
    `,
  },
  {
    name: '008_trip_geocode',
    sql: `
      ALTER TABLE trips ADD COLUMN latitude REAL;
      ALTER TABLE trips ADD COLUMN longitude REAL;
      ALTER TABLE trips ADD COLUMN resolved_name TEXT;
    `,
  },
  {
    // CREATE-only, so no runCustomMigration branch: IF NOT EXISTS is already idempotent
    // (same idiom as 003_cover_images and 007_trip_legs). No seed row either — generating a
    // token needs node:crypto and this file has never generated data. ensureFeed() inserts
    // lazily on first use.
    name: '009_calendar_feed',
    sql: `
      -- Subscribe-able ICS feeds. One row today (slug 'shared'); the (user_id, slug) unique
      -- index means a second feed needs no migration, only a new row.
      CREATE TABLE IF NOT EXISTS calendar_feeds (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        slug TEXT NOT NULL DEFAULT 'shared',
        name TEXT NOT NULL DEFAULT 'Zo Travel',
        -- The ONLY credential. 32 random bytes, base64url. Rotating it revokes every
        -- subscription: the old URL 404s and subscribers' copies stop updating.
        token TEXT NOT NULL,
        -- One JSON object; parseFeedFilters() in src/lib/calendar/filters.ts owns the schema,
        -- the defaults, and the tolerance for unknown/missing keys.
        filters TEXT NOT NULL DEFAULT '{}',
        last_fetched_at TEXT,
        last_fetched_user_agent TEXT,
        token_rotated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_feeds_token ON calendar_feeds (token);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_feeds_user_slug ON calendar_feeds (user_id, slug);
    `,
  },
  {
    name: '010_hide_from_calendar',
    sql: `
      ALTER TABLE trips            ADD COLUMN hide_from_calendar INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE trip_events      ADD COLUMN hide_from_calendar INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE trip_flights     ADD COLUMN hide_from_calendar INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE trip_hotels      ADD COLUMN hide_from_calendar INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE trip_rental_cars ADD COLUMN hide_from_calendar INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE trip_parking     ADD COLUMN hide_from_calendar INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE trip_transit     ADD COLUMN hide_from_calendar INTEGER NOT NULL DEFAULT 0;
    `,
  },
];

/** Tables carrying hide_from_calendar. Shared by migration 010 and the normalizer's contract. */
const HIDE_FROM_CALENDAR_TABLES = [
  'trips', 'trip_events', 'trip_flights', 'trip_hotels',
  'trip_rental_cars', 'trip_parking', 'trip_transit',
];

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function runCustomMigration(db: Database.Database, name: string): boolean {
  if (name === '004_hike_event_fields') {
    addColumnIfMissing(db, 'trip_events', 'hike_distance', 'TEXT');
    addColumnIfMissing(db, 'trip_events', 'hike_elevation', 'TEXT');
    addColumnIfMissing(db, 'trip_events', 'trailhead_location', 'TEXT');
    addColumnIfMissing(db, 'trip_events', 'alltrails_url', 'TEXT');
    return true;
  }
  if (name === '005_restaurant_event_fields') {
    addColumnIfMissing(db, 'trip_events', 'takes_reservations', 'INTEGER NOT NULL DEFAULT 1');
    addColumnIfMissing(db, 'trip_events', 'party_size', 'INTEGER');
    return true;
  }
  if (name === '006_trip_brief') {
    addColumnIfMissing(db, 'trips', 'planning_notes', 'TEXT');
    addColumnIfMissing(db, 'trips', 'planning_notes_previous', 'TEXT');
    addColumnIfMissing(db, 'trips', 'planning_notes_updated_at', 'TEXT');
    addColumnIfMissing(db, 'trips', 'planning_notes_updated_by', 'TEXT');
    return true;
  }
  if (name === '008_trip_geocode') {
    addColumnIfMissing(db, 'trips', 'latitude', 'REAL');
    addColumnIfMissing(db, 'trips', 'longitude', 'REAL');
    addColumnIfMissing(db, 'trips', 'resolved_name', 'TEXT');
    return true;
  }
  if (name === '010_hide_from_calendar') {
    // Global "never put this on a calendar" flag, not per-feed: a hidden item is hidden
    // from every feed AND from the per-trip .ics download. The trips column cascades — a
    // hidden trip hides its span event and every item beneath it.
    for (const table of HIDE_FROM_CALENDAR_TABLES) {
      addColumnIfMissing(db, table, 'hide_from_calendar', 'INTEGER NOT NULL DEFAULT 0');
    }
    return true;
  }
  return false;
}

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    const existing = db.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(migration.name);
    if (!existing) {
      if (!runCustomMigration(db, migration.name)) {
        db.exec(migration.sql);
      }
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(
        migration.name,
        new Date().toISOString()
      );
    }
  }
}
