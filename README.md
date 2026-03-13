# statbate-scraper

Private tool for scraping model earnings data from statbate.com.

## Stack

- **Backend**: Flask + Playwright (Python) — runs in Docker
- **Frontend**: React + Vite — deploy to Vercel (or serve statically)
- **Hosting**: Railway (backend) + Vercel (frontend)

## Local Development

### Backend

```bash
cd backend
pip install -r requirements.txt
playwright install chromium
python app.py
# Runs on http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
# Proxies /api to localhost:5000
```

---

## Deploy to Railway (Backend)

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select this repo
3. Railway will auto-detect the `railway.toml` and use the Dockerfile in `/backend`
4. Once deployed, copy the Railway URL (e.g. `https://statbate-scraper-production.up.railway.app`)

---

## Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import this repo
2. Set **Root Directory** to `frontend`
3. Add environment variable:
   ```
   VITE_API_URL=https://your-railway-url.up.railway.app
   ```
4. Deploy

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/scrape` | Start a scrape job |
| GET | `/api/jobs` | List recent jobs |
| GET | `/api/jobs/:id` | Get job status + log |
| GET | `/api/jobs/:id/download/xlsx` | Download Excel |
| GET | `/api/jobs/:id/download/csv` | Download CSV |
| GET | `/api/health` | Health check |

### POST /api/scrape

```json
{
  "platform": "3",
  "usernames": "model1\nmodel2\nmodel3",
  "delay": 3.0
}
```

Returns: `{ "job_id": "uuid" }`

---

## Platforms

| ID | Platform |
|----|----------|
| 1 | Chaturbate |
| 2 | BongaCams |
| 3 | Stripchat |
| 4 | CamSoda |
| 6 | MFC |

---

## Output Sheets (Excel)

- **Summary** — Type, Last online, Last month $, All time $
- **Last 30d** — Day-by-day: Dons, Tips, Avg USD, Total USD
- **Recent tips** — Date, Donator, Tokens, USD
- **Top monthly** — Top 100 tippers last 30 days
- **Top all-time** — Top 100 tippers all time
- **Biggest tips** — Top 100 single tips
- **Earnings (chart)** — Cumulative USD time series
- **Daily (chart)** — Daily USD time series
- **Tippers (chart)** — Cumulative unique tippers time series
