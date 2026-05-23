const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
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

        console.log('Database tables initialized.');
    });
}

module.exports = db;
