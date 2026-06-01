# Harvest Root – Premium Spices from Coorg

 **Harvest Root** is a modern full‑stack web shop for premium Coorg spices. Built with **Node.js**, **Express**, **PostgreSQL**, and a clean vanilla‑JS front‑end.

## Features
- Beautiful product catalogue with local images
- Persistent shopping cart (localStorage)
- Checkout flow with shipping details
- Admin dashboard to view orders & contacts
- Order status management (pending / completed / cancelled)

## Tech Stack
- **Backend:** Node.js v20, Express, PostgreSQL
- **Frontend:** HTML / CSS / Vanilla JavaScript
- **Styling:** Google Fonts (Inter, Playfair Display), custom CSS with a dark‑green theme

## Quick Start
```bash
# Clone the repo
git clone <YOUR_REPO_URL>
cd harvest-root

# Install dependencies (Node.js is required)
npm install

# Run the server
npm start   # or: node server.js
```
Open `http://localhost:3000` in your browser.

## Admin
- URL: `http://localhost:3000/admin.html`
- Change order status directly from the table.

## Project Structure
```
/public        # static assets (HTML, CSS, JS, images)
  index.html
  admin.html
  checkout.html
  script.js
  admin.js
/server.js     # Express server & API routes
/db.js         # PostgreSQL connection pool init
/package.json
```

## License
MIT – see the `LICENSE` file for details.
