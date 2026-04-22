# THAI AIR INTELLIGENCE

Simple, fast, and beautiful thesis demo web app for nationwide Thailand PM2.5 monitoring.

## 1) Dependencies (minimal and stable)

- `next` (App Router)
- `react`, `react-dom`
- `typescript`
- `tailwindcss`, `postcss`, `autoprefixer`
- `clsx`, `tailwind-merge` (utility classes)
- `lucide-react` (icons)
- `recharts` (charts)

> Note: No backend server, no database, no Supabase, no Python.

## 2) File Structure

```txt
/app
  /dashboard
  /map
  /province/[slug]
  /compare
  /settings
/components
/lib
/types
/public/data
```

## 3) Pages Implemented

1. Landing Page (`/`)
2. Dashboard (`/dashboard`)
3. Map View (`/map`)
4. Province Detail (`/province/[slug]`)
5. Compare (`/compare`)
6. Settings (`/settings`)

## Data Sources

- **Primary live source:** Open-Meteo Air Quality + Weather APIs (frontend fetch)
- **Fallback source:** `/public/data/fallback-air.json` (clearly labeled as fallback)

## Local Storage Usage

- favorite province
- dark mode
- compare province pair
- reset local data

## Forecast Logic (frontend only)

- Tomorrow estimate: `current * 1.03`
- Day 2 and Day 3: moving-average style smoothing

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Thesis Demo Notes

- Mobile-first responsive UI
- Clean modern cards with soft shadows
- No backend architecture needed
- Easy for presentation and deployment
