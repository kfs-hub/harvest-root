require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        // Get all tables
        const tables = await pool.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
        );

        console.log('\n=== YOUR POSTGRESQL TABLES ===\n');

        for (const t of tables.rows) {
            const name = t.table_name;

            // Get columns
            const cols = await pool.query(
                `SELECT column_name, data_type FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,
                [name]
            );

            // Get row count
            const count = await pool.query(`SELECT COUNT(*) as count FROM "${name}"`);

            console.log(`\n📋  ${name.toUpperCase()} (${count.rows[0].count} rows)`);
            console.log('─'.repeat(45));
            cols.rows.forEach(c => {
                console.log(`   ${c.column_name.padEnd(22)} ${c.data_type}`);
            });

            // Show data for small tables
            if (parseInt(count.rows[0].count) > 0 && parseInt(count.rows[0].count) <= 10) {
                const data = await pool.query(`SELECT * FROM "${name}" LIMIT 10`);
                console.log(`\n   Data:`);
                data.rows.forEach((row, i) => {
                    const summary = Object.entries(row).map(([k, v]) => {
                        let val = v;
                        if (typeof val === 'string' && val.length > 30) val = val.substring(0, 30) + '...';
                        return `${k}: ${val}`;
                    }).join(' | ');
                    console.log(`   [${i + 1}] ${summary}`);
                });
            }
        }

        console.log('\n✅ Done.\n');
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
})();
