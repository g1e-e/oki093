# oki093

Ara's art portfolio. Live at https://g1e-e.github.io/oki093/ (admin page: `admin.html`).

## Deploy the backend

1. Go to https://script.google.com and create a new project.
2. Replace the contents of `Code.gs` with this repo's `Code.gs` and save.
3. Project Settings → Script Properties → add `ADMIN_PASSWORD` with the admin password.
4. Deploy → New deployment → type Web app. Execute as: Me. Who has access: Anyone. Deploy and authorize.
5. Copy the `/exec` URL into `config.js` as `window.APPS_SCRIPT_URL` and push.

After editing `Code.gs` later, use Deploy → Manage deployments → Edit → New version so the URL stays the same.

Images are stored in a Drive folder named `oki093` and shared as "anyone with the link can view" so the site can show them.
