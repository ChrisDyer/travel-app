# Travel App

A personal travel itinerary manager. Plan trips, track bookings, build day-by-day itineraries, and use an AI assistant to brainstorm ideas or extract booking details from your Gmail.

## Features

- **Trip management** — Create trips with dates, destination, and cover photos
- **Day-by-day itinerary** — Add events, restaurants, activities, and notes to each day
- **Key bookings** — Track flights, hotels, rental cars, parking, and transit
- **Interactive map** — See your hotels, events, and stops on a map
- **AI Trip Assistant** — Brainstorm ideas or scan Gmail booking confirmations (Claude-powered)
- **Packing checklist** — Organized by category with check-off tracking
- **Cancellation deadlines** — See what needs to be booked or cancelled and by when
- **Cost summary** — Running total of all trip expenses by currency
- **Print / PDF export** — Clean printable itinerary with all bookings

## Prerequisites

- Node.js 18+
- A [Google Cloud](https://console.cloud.google.com) project (free tier is fine)
- An [Anthropic](https://console.anthropic.com) account (pay-per-use, ~$0.01 per AI query)

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/ChrisDyer/travel-app.git
cd travel-app
npm install
```

### 2. Create your environment file

```bash
cp .env.example .env.local
```

Then open `.env.local` and fill in the values below.

---

### 3. Anthropic API key (AI Assistant)

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Go to **API Keys** → **Create Key**
3. Add to `.env.local`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

The AI assistant is optional — the rest of the app works without it.

---

### 4. Google Maps API key (map + address autocomplete)

1. Go to [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **Enable APIs**
2. Enable **Maps JavaScript API** and **Places API**
3. Go to **Credentials** → **Create Credentials** → **API Key**
4. (Recommended) Restrict the key to HTTP referrers: `http://localhost:3000/*`
5. Add to `.env.local`:
   ```
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
   ```

Maps and address autocomplete are optional — the app works without them.

---

### 5. Gmail OAuth credentials (email scanning)

This enables the AI assistant to scan your Gmail for booking confirmations. **Optional** — skip if you don't need it.

#### Step 1: Create the OAuth client

1. In Google Cloud Console → **APIs & Services** → **Enable APIs** → enable **Gmail API**
2. Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Under **Authorized redirect URIs**, add: `http://localhost:3000/api/gmail/callback`
5. Click **Create** — copy the **Client ID** and **Client Secret**

#### Step 2: Configure the OAuth consent screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. User type: **External** → **Create**
3. Fill in: App name (e.g. "Travel App"), your email address
4. Publishing status: **Testing**
5. Under **Test users**, add your own Gmail address
6. Save

#### Step 3: Add to `.env.local`

```
GOOGLE_GMAIL_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_GMAIL_CLIENT_SECRET=GOCSPX-...
```

#### Step 4: Create the Gmail label

1. In Gmail, create a label called **"Trip Bookings"** (Settings → Labels → Create new label)
2. Apply this label to any booking confirmation emails you want scanned
3. In the app, go to a trip → Open Trip Assistant → Extract from Email → Connect Gmail

> Note: The app requests `gmail.readonly` scope only. It cannot send or modify emails.

---

### 6. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The SQLite database (`local.db`) is created automatically on first run — no setup needed.

---

## Production Deployment

See [RUNBOOK.md](RUNBOOK.md) for instructions on deploying to a VPS with nginx, PM2, and Cloudflare Access for authentication.

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS** + shadcn/ui components
- **SQLite** via better-sqlite3 (file-based, zero config)
- **Anthropic Claude** for the AI assistant
- **Google Maps** for address autocomplete and trip map
- **Gmail API** for booking confirmation scanning

## Authentication

In local development, all requests run as a single `local` user — no login needed.

In production, authentication is handled by [Cloudflare Access](https://www.cloudflare.com/zero-trust/products/access/) which gates the entire site using Google SSO. The app reads the `cf-access-authenticated-user-email` header to identify users, enabling each person to have their own separate trips.
