const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const readline = require('readline');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error connecting to database:', err.message);
        process.exit(1);
    }
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('----------------------------------------------------');
console.log('🔐 Harvest Root — Admin Account Credential Updater');
console.log('----------------------------------------------------\n');

rl.question('👤 Enter new admin username (e.g. admin): ', (newUsername) => {
    if (!newUsername.trim()) {
        console.log('❌ Username cannot be empty.');
        rl.close();
        process.exit(1);
    }

    rl.question('🔑 Enter new admin password: ', (newPassword) => {
        if (newPassword.length < 6) {
            console.log('❌ Password must be at least 6 characters long.');
            rl.close();
            process.exit(1);
        }

        const username = newUsername.trim();
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(newPassword, salt);

        // Check if any admin exists
        db.get('SELECT COUNT(*) as count FROM admins', (err, row) => {
            if (err) {
                console.error('❌ Error reading database:', err.message);
                rl.close();
                process.exit(1);
            }

            if (row.count === 0) {
                // Insert new admin
                db.run('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, hash], (err) => {
                    if (err) {
                        console.error('❌ Failed to create admin account:', err.message);
                    } else {
                        console.log(`\n✅ Successfully created admin account: "${username}"!`);
                    }
                    rl.close();
                });
            } else {
                // Update the existing first admin, or all admins
                db.run('UPDATE admins SET username = ?, password_hash = ?', [username, hash], function(err) {
                    if (err) {
                        console.error('❌ Failed to update credentials:', err.message);
                    } else {
                        console.log(`\n✅ Successfully updated admin credentials!`);
                        console.log(`👤 New Username: ${username}`);
                        console.log(`🔑 Password updated and securely encrypted.`);
                    }
                    rl.close();
                });
            }
        });
    });
});
