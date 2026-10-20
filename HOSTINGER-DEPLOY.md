# Deploy the full app to Hostinger

Fading Ember Games is a Node.js app with its own backend. Deploy the project root as a **Node.js Web App** so the client site, admin site, and `/api/*` routes all run on the same origin. Uploading only the `public` folder as a static site leaves the frontend visible but breaks projects, accounts, inquiries, and admin login.

## Hostinger setup

1. Confirm your Hostinger plan supports Node.js Web Apps. Hostinger currently lists Business and Cloud plans for managed Node.js apps; VPS plans need manual Node.js setup.
2. Back up the current website and its files before changing which app is connected to `fadingembergames.com`.
3. Create a Node.js Web App using this project root (ZIP upload or a connected Git repository). Include `server.js`, `package.json`, `package-lock.json`, and the complete `public/` folder. Do not upload `node_modules/`, `.git/`, `work/`, `.env`, or `data/store.json`.
4. Choose Node.js 20 or newer. If Hostinger asks for an app type, use **Other** for this plain Node.js HTTP server. Use `server.js` as the entry file and keep the project root as the app directory; the app serves files from its `public/` subfolder.
5. Keep the start command as `npm start` (the package already defines it as `node server.js`). Let Hostinger provide `PORT`; do not pin it to a local development port.
6. Connect `fadingembergames.com` to this Node.js Web App in hPanel. A static site already assigned to the domain must be backed up and replaced/migrated carefully. Do not delete it until the backup is verified.
7. Add the environment variables in Hostinger's Node.js app settings, not in a committed file:

   ```text
   APP_BASE_URL=https://fadingembergames.com
   HOST=0.0.0.0
   DATA_DIR=<absolute writable persistent path outside the deployment release>
   ADMIN_USERNAME=<your private admin username>
   ADMIN_EMAIL=<mailbox for admin notices and recovery>
   ADMIN_PASSWORD=<a long unique password for first-time setup>
   SMTP_HOST=<SMTP host from your mail provider>
   SMTP_PORT=<provider SMTP port>
   SMTP_SECURE=<true for implicit TLS, otherwise false>
   SMTP_USER=<SMTP username>
   SMTP_PASS=<SMTP password or provider app password>
   SMTP_FROM=<verified sender address>
   ```

   Use the persistent path provided by your hosting account for `DATA_DIR`; the JSON store contains client accounts, projects, and inquiries. Keep it outside versioned deployment folders so a redeploy does not reset the store. If the host cannot provide a persistent writable folder, use a database before relying on the live site. `ADMIN_PASSWORD` seeds a new admin record; on an existing store, change the password through password recovery. Never commit real credentials or the `.env` file.

8. Deploy/restart the app after setting the variables. Check Hostinger's deployment logs and confirm the Node.js app is running.

## Verify after deployment

Open these URLs in a private browser window:

- `https://fadingembergames.com/` — client site; selected projects should load.
- `https://fadingembergames.com/admin` — admin sign-in page.
- `https://fadingembergames.com/forgot-password?role=client` — recovery page.
- `https://fadingembergames.com/api/projects` — JSON with published projects.
- `https://fadingembergames.com/api/auth/session` — JSON showing an unauthenticated session.

If `/admin` or `/api/projects` shows Hostinger's “Page Not Found”, the domain is still serving the static deployment instead of this Node.js app. If pages load but recovery or notifications fail, check the Node.js app's SMTP environment variables and deployment logs.

## Hostinger references

- [Deploy a Node.js website in Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Add environment variables to a Hostinger Node.js app](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/)
- [Connect a custom domain to a Hostinger Node.js app](https://www.hostinger.com/support/how-to-connect-a-custom-domain-to-a-node-js-application/)
