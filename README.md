# Harvest Root – Premium Spices from Coorg

 **Harvest Root** is a modern full‑stack web shop for premium Coorg spices. Built with **Node.js**, **Express**, **SQLite**, and a clean vanilla‑JS front‑end.

## Features
- Beautiful product catalogue with local images
- Persistent shopping cart (localStorage)
- Customer accounts with email OTP verification
- Checkout flow with shipping details & order confirmation emails
- Order history in account profile
- Admin dashboard to view orders, contacts & manage products
- Order status management (pending / completed / cancelled)

## Tech Stack
- **Backend:** Node.js v20, Express, SQLite3
- **Frontend:** HTML / CSS / Vanilla JavaScript
- **Styling:** Google Fonts (Inter, Playfair Display), custom CSS with a dark‑green theme

## Quick Start
```bash
# Clone the repo
git clone <YOUR_REPO_URL>
cd harvest-root

# Install dependencies (Node.js is required)
npm install

# Copy env template and set SESSION_SECRET + email (for OTP & order emails)
cp .env.example .env

# Run the server
npm start
```
Open `http://localhost:3000` in your browser.

## Environment Variables
See `.env.example`.

### Verification emails (important)
Customers **will not** receive OTP codes unless real SMTP is configured:

1. Copy `.env.example` to `.env` locally, or set env vars on **Render** / your host.
2. Use `EMAIL_USER` = your Gmail (e.g. `harvestroot2020@gmail.com`).
3. Use `EMAIL_PASS` = a **Gmail App Password** (not your normal Gmail password).
4. Redeploy / restart the server.

Without this, signup shows success but mail never arrives (dev uses fake Ethereal inbox only).

## Admin
- URL: `http://localhost:3000/admin.html` (not linked in main nav — use footer or direct URL)
- Default credentials on first run: `admin` / `harvestroot2026` — **change immediately** with `npm run change-password`

## Project Structure
```
/public        # static assets (HTML, CSS, JS, images)
  index.html
  admin.html
  checkout.html
  script.js
  admin.js
/server.js     # Express server & API routes
/db.js         # SQLite init
/package.json
```

## License
MIT – see the `LICENSE` file for details.
