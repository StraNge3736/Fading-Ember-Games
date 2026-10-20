# Fading Ember Games

A small server-backed studio website with two connected surfaces:

- **Client site:** `http://localhost:4173` — browse published projects, create a client account or sign in, then send a project inquiry.
- **Admin studio:** `http://localhost:4173/admin` — sign in, publish or edit projects, and manage incoming inquiries.

Both surfaces use the same JSON API and `data/store.json` file. Projects, client accounts, and inquiries persist between server restarts. A client must create an account or sign in before sending an inquiry; the server uses that account's name and email on the inquiry. Client and admin passwords are stored as salted scrypt hashes. Inquiry receipts, studio notifications, admin replies, and password resets are sent by the website server through SMTP. Four sample portfolio entries are included so the site has something to show on first launch; edit or remove them from the admin studio.

## Run locally

Requires Node.js 18 or newer.

```powershell
cd "C:\Users\Acer\Documents\Codex\2026-10-14\e\outputs\fading-ember-games"
npm install
Copy-Item .env.example .env
# Set SMTP_USER and SMTP_PASS in .env for the server-side mail relay.
npm start
```

Open the client site at [http://localhost:4173](http://localhost:4173) and the admin studio at [http://localhost:4173/admin](http://localhost:4173/admin). Configure a private `ADMIN_USERNAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `.env` before using the admin studio.

For production deployment on Hostinger, see [HOSTINGER-DEPLOY.md](HOSTINGER-DEPLOY.md). Deploy the project as a Node.js Web App so the public pages and backend API share the same domain.

The website follows the attached HTML's charcoal, ember orange, and warm cream palette, while its sections and sample work describe creative services. Admin access is limited to one server-configured identity: login requires the username in `ADMIN_USERNAME`, the matching email in `ADMIN_EMAIL`, a verified server-side admin record, and its password. There is no public admin registration. The record is marked verified only while both username and email match the private `.env` configuration. `ADMIN_PASSWORD` seeds a new admin password; an existing password hash is preserved. `ADMIN_EMAIL` also sets the admin recovery and notification mailbox.

Client and admin password reset links are sent to the account email over SMTP, expire after 60 minutes, and can only be used once. Inquiry submissions send a confirmation to the client and a notification to the admin; the admin can reply from the studio dashboard, with the message sent by the same server mail relay. New client registrations and successful client or studio sign-ins trigger account activity emails. Admin inquiry status changes email both the client and studio mailbox; Maintenance is available as an inquiry service and workflow status. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `APP_BASE_URL` in `.env`. For Gmail, use `smtp.gmail.com`, port `465`, and `SMTP_SECURE=true` (the tested settings for this project); create an App Password for the Gmail account and put it in `SMTP_PASS` (never use or share the account's normal password). This sends email from the website server through Gmail's SMTP relay; it does not use Google sign-in. For another mail provider or a relay installed on the website host, use that provider's SMTP settings. The host must permit outbound SMTP traffic, and custom domains should authorize sending with SPF/DKIM/DMARC. Set `ADMIN_EMAIL` to the mailbox that should receive studio notifications and admin recovery messages. `ADMIN_PASSWORD` only seeds a new admin record; for an existing installation, use password recovery to change it. Keep `.env` private and never commit it.

Project cover art can currently be set with an image URL; image uploads are not included.




