const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Use DATABASE_URL from environment (external for local dev, internal on Render)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: false } // Render requires SSL even for external connections
});

pool.on('connect', () => {
    console.log('Connected to PostgreSQL database.');
});

pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err.message);
});

async function initDb() {
    const client = await pool.connect();
    try {
        // Create contacts table
        await client.query(`
            CREATE TABLE IF NOT EXISTS contacts (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create orders table
        await client.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                customer_name TEXT NOT NULL,
                customer_email TEXT NOT NULL,
                customer_address TEXT NOT NULL,
                total_amount REAL NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create order_items table
        await client.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES orders(id),
                product_id INTEGER NOT NULL,
                product_name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                price REAL NOT NULL
            )
        `);

        // Create session table for connect-pg-simple
        await client.query(`
            CREATE TABLE IF NOT EXISTS "session" (
                "sid" varchar NOT NULL COLLATE "default" PRIMARY KEY,
                "sess" json NOT NULL,
                "expire" timestamp(6) NOT NULL
            )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")`);

        // Create products table
        // Note: "desc" is a reserved word in PostgreSQL, so we quote it
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                origin TEXT NOT NULL,
                "desc" TEXT NOT NULL,
                price REAL NOT NULL,
                unit TEXT NOT NULL,
                badge TEXT,
                image TEXT NOT NULL,
                stock INTEGER DEFAULT 50
            )
        `);

        // Create admins table
        await client.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create users table (customers)
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT,
                google_id TEXT UNIQUE,
                avatar TEXT,
                auth_provider TEXT DEFAULT 'local',
                address TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Seed products if empty
        const productCount = await client.query('SELECT COUNT(*) as count FROM products');
        if (parseInt(productCount.rows[0].count) === 0) {
            const initialProducts = [
                [1, "Black Pepper", "Coorg Estate", "Bold, aromatic Tellicherry-grade peppercorns. Sun-dried for maximum pungency.", 169, "100g", "Bestseller", "images/Black Pepper.png", 80],
                [2, "Cloves", "Coorg Hills", "Intensely fragrant whole cloves, hand-sorted for premium quality.", 420, "100g", "Premium", "images/Cloves.png", 45],
                [3, "Green Cardamom", "Western Ghats", "Plump, green pods bursting with sweet, floral aroma. Perfect for chai and desserts.", 580, "100g", "Popular", "images/Cardamom.png", 15],
                [4, "Cinnamon Sticks", "Coorg Plantation", "True Ceylon-style cinnamon with delicate sweetness. Rolled by hand.", 310, "100g", "", "images/Cinnamon Sticks.png", 0]
            ];

            for (const p of initialProducts) {
                await client.query(
                    `INSERT INTO products (id, name, origin, "desc", price, unit, badge, image, stock) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    p
                );
            }
            // Reset the sequence to match the max ID
            await client.query(`SELECT setval('products_id_seq', (SELECT MAX(id) FROM products))`);
            console.log('Products table populated with initial catalog.');
        }

        // Seed admin if empty
        const adminCount = await client.query('SELECT COUNT(*) as count FROM admins');
        if (parseInt(adminCount.rows[0].count) === 0) {
            const hash = bcrypt.hashSync('harvestroot2026', 10);
            await client.query(
                `INSERT INTO admins (username, password_hash) VALUES ($1, $2)`,
                ['admin', hash]
            );
            console.log('Default admin account created. (admin / harvestroot2026)');
        }

        console.log('Database tables initialized.');
    } catch (err) {
        console.error('Database initialization error:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

// Initialize on startup
initDb().catch(err => {
    console.error('Fatal: Could not initialize database.', err.message);
    process.exit(1);
});

module.exports = pool;
