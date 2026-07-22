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
