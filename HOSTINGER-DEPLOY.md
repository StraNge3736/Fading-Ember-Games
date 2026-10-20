# Deploy the PHP/MySQL app to Hostinger Premium

The production backend is now PHP and MySQL. Keep the existing `public/` folder and upload the PHP files and `.htaccess` from this project into the domain's `public_html` directory. The `.htaccess` file maps `/api/*` to PHP and routes the site's existing page and asset URLs into `public/`.

## 1. Create the database

In Hostinger hPanel, create a MySQL database and a database user, then grant that user access to the database. Copy the exact host, database name, username, and password shown by hPanel; the database host is not always `localhost`.

## 2. Prepare and upload the PHP app

1. Set the domain's PHP version to 8.1 or newer and enable PDO MySQL and OpenSSL.
2. Upload these project files and folders into `public_html`:
   - `.htaccess`
   - `api.php`, `config.php`, `database.php`, and `router.php`
   - `public/`
   - `tools/` (needed only for importing old data; web access is blocked)
3. Do not upload `node_modules/`, `.git/`, `work/`, or the old private `data/store.json` into the web root.
4. Create a private `.env` file in `public_html` using `.env.example` as a template. The included `.htaccess` blocks web requests to `.env`. Set these values to your real host and account values:

   ```text
   APP_BASE_URL=https://fadingembergames.com
   DB_HOST=<MySQL host from hPanel>
   DB_PORT=3306
   DB_NAME=<database name from hPanel>
   DB_USER=<database user from hPanel>
   DB_PASS=<database password from hPanel>
   ADMIN_USERNAME=<your private admin username>
   ADMIN_EMAIL=<mailbox for studio notices and recovery>
   ADMIN_PASSWORD=<a long unique initial admin password>
   SMTP_HOST=<mail provider SMTP host>
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=<SMTP username>
   SMTP_PASS=<SMTP password or app password>
   SMTP_FROM=<verified sender email address>
   ```

   For Gmail, use an App Password as `SMTP_PASS`; never put your normal Google account password there. For port `587`, set `SMTP_SECURE=false` so the app negotiates STARTTLS.

The first API request creates the MySQL tables. The database user must be allowed to create tables. To verify the PHP backend, open `https://fadingembergames.com/api/projects`; it should return JSON, even when there are no published projects.

## 3. Move existing local data

Before changing the live site, make a private backup of the current `data/store.json`. When the PHP app can connect to the new MySQL database, run the importer from a Hostinger terminal, or from your computer if the database host permits remote connections:

```sh
php tools/import_json.php /path/to/store.json
```

It imports projects, client profiles, and inquiries once; running it again skips rows already present. The original JSON file remains unchanged. It does not copy old password hashes: client accounts need a one-time password reset. The admin account is created from the configured environment values. If you cannot run PHP CLI or connect remotely, keep the backup and tell me which Hostinger access method is available before changing the live domain.

## 4. Test the deployment

- `https://fadingembergames.com/` — client portfolio
- `https://fadingembergames.com/admin` — verified admin login
- `https://fadingembergames.com/forgot-password?role=client` — client reset page
- `https://fadingembergames.com/forgot-password?role=admin` — admin reset page
- `https://fadingembergames.com/api/projects` — published project JSON
- `https://fadingembergames.com/api/auth/session` — unauthenticated client session JSON

If the site returns a PHP/Apache 500, check the PHP error log and the database credentials in `.env`. If the pages work but `/api/projects` fails, check that `.htaccess` rewriting is enabled and that the database user can create tables. If recovery emails fail, check SMTP settings and outbound SMTP access in the hosting account.

## Git deployment notes

If Hostinger is connected to the GitHub repository, pushing the converted PHP files may trigger a deployment according to that site's deployment settings. If it is not connected, upload the changed PHP files to `public_html` manually. Keep `.env` and `data/store.json` out of GitHub.
