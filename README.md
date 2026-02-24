# Bitespeed Identity Reconciliation

A backend service that links customer contacts across multiple purchases using different contact information.

## Live Endpoint

```
POST https://bitespeed-identity-qosp.onrender.com/
```

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL (via `pg`)

## Local Setup

### 1. Clone & install

```bash
git clone <your-repo-url>
cd bitespeed-identity
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and set your DATABASE_URL
```

```env
DATABASE_URL=postgresql://user:password@localhost:5432/bitespeed
PORT=3000
```

### 3. Run

```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

The server auto-creates the `Contact` table on startup — no manual migrations needed.

---

## API

### `POST /identify`

**Request Body** (JSON):
```json
{
  "email": "user@example.com",
  "phoneNumber": "123456"
}
```
At least one field is required. Both can be provided.

**Response (200)**:
```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```

### `GET /health`
Returns `{ "status": "ok" }` — useful for uptime checks.

---

## Business Logic

| Scenario | Behaviour |
|---|---|
| No matching contact | Create new `primary` |
| Match found, all info already known | Return consolidated cluster |
| Match found, new info present | Create new `secondary` linked to the primary |
| Two separate primaries linked | Older stays `primary`, newer is demoted to `secondary` |

All operations run inside a **Postgres transaction** to prevent race conditions.

---

## Deploy to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New Web Service** → connect your repo
3. Set build command: `npm install && npm run build`
4. Set start command: `npm start`
5. Add a **PostgreSQL** database (Render free tier) and copy the **Internal Database URL**
6. Add environment variable: `DATABASE_URL=<your-internal-db-url>`

That's it — Render will deploy and the service will auto-create the table on first boot.
