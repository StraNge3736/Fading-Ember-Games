# Fading Ember Games

Fading Ember Games is a portfolio and client inquiry site with a connected admin studio. The Hostinger Premium deployment uses PHP and MySQL: PHP serves the API, MySQL stores projects, client accounts, and inquiries, and the existing HTML/CSS/JavaScript client and admin pages use the same API paths as before.

## Local setup

Requirements: PHP 8.1+ with PDO MySQL (or PDO SQLite for local testing), and MySQL/MariaDB.

1. Create a database and database user, then grant the user access to that database.
2. Copy `.env.example` to `.env` if you do not already have a private `.env`, then set `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `APP_BASE_URL`, and SMTP settings. Keep `.env` private.
3. Start the PHP development server from this project directory:

   ```powershell
   php -S 127.0.0.1:4173 router.php
   ```

4. Open [http://127.0.0.1:4173](http://127.0.0.1:4173) or [http://127.0.0.1:4173/admin](http://127.0.0.1:4173/admin).

The database tables are created by the PHP backend on its first API request. The MySQL user needs permission to create tables in this database. The `data/store.json` file is not used by the PHP app.

## Moving existing Node.js data

Keep a private copy of `data/store.json`. Once PHP has access to the destination MySQL database, run this from the project folder (on the host terminal, or locally if the database allows your computer to connect):

```powershell
php tools/import_json.php data/store.json
```

The importer is CLI-only and idempotent. It copies projects, client profiles, and inquiries and leaves the JSON file unchanged. Old Node.js scrypt password hashes cannot be verified by PHP, so migrated client accounts must use **Forgot password** once to set a PHP password. Admin sign-in is seeded from the private `ADMIN_USERNAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` settings.

## Email

The PHP backend sends reset links, inquiry receipts, admin notifications, sign-in alerts, inquiry status updates, and admin replies through the configured SMTP server. For Gmail, use `smtp.gmail.com`, port `465`, `SMTP_SECURE=true`, and a Gmail App Password in `SMTP_PASS`. `SMTP_FROM` should be a sender address accepted by that mail provider. The host must allow outbound SMTP traffic.

## Hostinger Premium deployment

See [HOSTINGER-DEPLOY.md](HOSTINGER-DEPLOY.md) for the PHP/MySQL deployment and data migration steps. Do not deploy `node_modules/`, `.git/`, `.env.example` as live credentials, or the private `data/store.json` file.

The original `server.js` is kept in the repository for rollback/reference. The PHP deployment does not run `npm start` and does not use the Node.js JSON store.
