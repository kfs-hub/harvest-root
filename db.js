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
            image TEXT NOT NULL,
            stock INTEGER DEFAULT 50
        )`, () => {
            // Check if column 'stock' exists for backward compatibility
            db.all(`PRAGMA table_info(products)`, (err, columns) => {
                if (!err && columns) {
                    const hasStock = columns.some(col => col.name === 'stock');
                    if (!hasStock) {
                        db.run(`ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 50`, (alterErr) => {
                            if (!alterErr) {
                                console.log('Added stock column to products table.');
                            } else {
                                console.error('Error adding stock column:', alterErr.message);
                            }
                        });
                    }
                }
            });

            db.get(`SELECT COUNT(*) as count FROM products`, (err, row) => {
                if (!err && row.count === 0) {
                    const initialProducts = [
                        [1, "Black Pepper", "Coorg Estate", "Bold, aromatic Tellicherry-grade peppercorns. Sun-dried for maximum pungency.", 169, "100g", "Bestseller", "images/Black Pepper.png", 80],
                        [2, "Cloves", "Coorg Hills", "Intensely fragrant whole cloves, hand-sorted for premium quality.", 420, "100g", "Premium", "images/Cloves.png", 45],
                        [3, "Green Cardamom", "Western Ghats", "Plump, green pods bursting with sweet, floral aroma. Perfect for chai and desserts.", 580, "100g", "Popular", "images/Cardamom.png", 15],
                        [4, "Cinnamon Sticks", "Coorg Plantation", "True Ceylon-style cinnamon with delicate sweetness. Rolled by hand.", 310, "100g", "", "images/Cinnamon Sticks.png", 0]
                    ];
                    const stmt = db.prepare(`INSERT INTO products (id, name, origin, desc, price, unit, badge, image, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
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
            password_hash TEXT,
            google_id TEXT UNIQUE,
            avatar TEXT,
            auth_provider TEXT DEFAULT 'local',
            address TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => {
            // Migrate existing users table: add new columns if they don't exist
            db.all(`PRAGMA table_info(users)`, (err, columns) => {
                if (!err && columns) {
                    const colNames = columns.map(col => col.name);

                    if (!colNames.includes('google_id')) {
                        db.run(`ALTER TABLE users ADD COLUMN google_id TEXT`, (e) => {
                            if (!e) {
                                console.log('Added google_id column to users table.');
                                db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)`, (e2) => {
                                    if (!e2) console.log('Created unique index on users.google_id.');
                                });
                            }
                        });
                    }
                    if (!colNames.includes('avatar')) {
                        db.run(`ALTER TABLE users ADD COLUMN avatar TEXT`, (e) => {
                            if (!e) console.log('Added avatar column to users table.');
                        });
                    }
                    if (!colNames.includes('auth_provider')) {
                        db.run(`ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'`, (e) => {
                            if (!e) console.log('Added auth_provider column to users table.');
                        });
                    }
                }
            });
        });

        console.log('Database tables initialized.');
    });
}

module.exports = db;
