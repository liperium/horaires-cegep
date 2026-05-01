# horaires-cegep

Typst-based teacher schedule generation with a web editor for drag-and-drop template editing.

## Web app (internal)

- `frontend/`: React editor (left = schedule blocks, right = PDF preview/download)
- `backend/`: Express API, template storage, Typst rendering bridge
- `data/templates.json`: persistent template store

## Quick start

1. Install dependencies:
   - `npm --prefix frontend install`
   - `npm --prefix backend install`
2. Import existing teacher TOML templates:
   - `npm run migrate`
3. Run backend and frontend:
   - `npm run dev:backend`
   - `npm run dev:frontend`

Frontend defaults to `http://localhost:5173` and proxies API requests to backend at `http://localhost:4000`.
