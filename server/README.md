# Exphunger MongoDB API (migration starter)

This folder is a **backend starter only**. The live GitHub Pages frontend is still using Supabase until its login, product sync, import, edit, delete, reports, and admin flows are migrated and tested. Do not remove the current Supabase project yet.

## Deploy
1. Create a Node web service from this repository using the `server` folder as the service root (or configure the build/start commands for that folder).
2. Runtime: Node.js 20 or newer. Install command: `npm install`. Start command: `npm start`.
3. Add environment variables in the hosting provider:
   - `MONGODB_URI`: MongoDB Atlas connection string for a dedicated database user with access only to this app's database.
   - `MONGODB_DB`: `exphunger` (optional).
   - `JWT_SECRET`: a long random secret, at least 32 characters.
   - `ALLOWED_ORIGINS`: `https://app-fahim.github.io` (or the exact site origin).
   - `ALLOW_SIGNUP`: keep `false` until controlled account creation is implemented.
4. In Atlas, allow network access only as appropriate for your host. Never put the Atlas URI or database password in `index.html`, GitHub Pages, or a public repository.

## Current endpoints
- `GET /api/health`
- `POST /api/auth/register` (disabled unless `ALLOW_SIGNUP=true`)
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/products`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`
- `POST /api/products/bulk` (up to 1,000 products per request)
- `DELETE /api/products` (only the authenticated user's products)

Every product query is scoped to the authenticated user's MongoDB user ID.

## Migration caveats
- This API does not automatically migrate existing Supabase users or data.
- Supabase password hashes cannot be copied directly into this login implementation. Users will need new accounts/passwords or a separate verified account-migration process.
- The frontend is not connected to this API yet. Do not treat this starter as a completed or live migration.
- Test the service and database in a staging deployment before switching the production frontend.
