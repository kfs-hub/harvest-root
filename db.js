const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const fs = require('fs');

const localDbPath = path.resolve(__dirname, 'database.sqlite');
const persistentDataDir = process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : (process.env.DATA_DIR || '/var/data');
let dbPath = localDbPath;

const usePersistentDisk = process.env.DB_PATH
    || process.env.DATA_DIR
    || process.env.NODE_ENV === 'production'
    || process.env.RENDER
    || process.env.RENDER_SERVICE_ID;

if (usePersistentDisk) {
    const persistentDbPath = process.env.DB_PATH
        ? path.resolve(process.env.DB_PATH)
        : path.join(persistentDataDir, 'database.sqlite');

    try {
        if (!fs.existsSync(persistentDataDir)) {
            fs.mkdirSync(persistentDataDir, { recursive: true });
        }
        if (!fs.existsSync(persistentDbPath) && fs.existsSync(localDbPath)) {
            fs.copyFileSync(localDbPath, persistentDbPath);
            console.log('Copied local database.sqlite into persistent disk:', persistentDbPath);
        }
        dbPath = persistentDbPath;
    } catch (e) {
        console.warn('⚠️ Could not write to persistent disk at', persistentDataDir, '. Falling back to local database.sqlite.', e.message);
    }
}
console.log('SQLite database file:', dbPath);
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Create contacts table
        db.run(`CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Create orders table
        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            customer_email TEXT NOT NULL,
            customer_address TEXT NOT NULL,
            total_amount REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Create order_items table
        db.run(`CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders (id)
        )`);

        // Create products table
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            origin TEXT NOT NULL,
            desc TEXT NOT NULL,
            price REAL NOT NULL,
            unit TEXT NOT NULL,
            badge TEXT,
            image TEXT NOT NULL
        )`, () => {
            db.get(`SELECT COUNT(*) as count FROM products`, (err, row) => {
                if (!err && row.count === 0) {
                    const initialProducts = [
                        [1, "Black Pepper", "Coorg Estate", "Bold, aromatic Tellicherry-grade peppercorns. Sun-dried for maximum pungency.", 350, "250g", "Bestseller", "images/black-pepper.png"],
                        [2, "Cloves", "Coorg Hills", "Intensely fragrant whole cloves, hand-sorted for premium quality.", 420, "100g", "Premium", "images/clove2.webp"],
                        [3, "Green Cardamom", "Western Ghats", "Plump, green pods bursting with sweet, floral aroma. Perfect for chai and desserts.", 580, "100g", "Popular", "images/cardomom.webp"],
                        [4, "Cinnamon Sticks", "Coorg Plantation", "True Ceylon-style cinnamon with delicate sweetness. Rolled by hand.", 310, "100g", "", "images/Cinnamon_1.webp"],
                        [5, "Star Anise", "Spice Valley", "Whole star anise with rich licorice notes. Essential for biryanis and stews.", 390, "100g", "", "images/Star Anise.jpg"],
                        [6, "Turmeric Powder", "Coorg Organic Farm", "Deep golden turmeric with high curcumin content. Stone-ground fresh.", 180, "250g", "Organic", "images/turmaric.webp"]
                    ];
                    const stmt = db.prepare(`INSERT INTO products (id, name, origin, desc, price, unit, badge, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
                    for (let p of initialProducts) {
                        stmt.run(p);
                    }
                    stmt.finalize();
                    console.log('Products table populated with initial catalog.');
                }
            });
        });

        // Create admins table
        db.run(`CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => {
            db.get(`SELECT COUNT(*) as count FROM admins`, (err, row) => {
                if (!err && row.count === 0) {
                    // Default admin: username = admin, password = harvestroot2026
                    const hash = bcrypt.hashSync('harvestroot2026', 10);
                    db.run(`INSERT INTO admins (username, password_hash) VALUES (?, ?)`,
                        ['admin', hash], (err) => {
                            if (!err) {
                                console.log('Default admin account created. (admin / harvestroot2026)');
                            }
                        });
                }
            });
        });

        // Create users table (customers)
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            address TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        console.log('Database tables initialized.');
    });
}

module.exports = db;
