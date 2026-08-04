# Dev Control Center

A private Cloudflare Worker dashboard for explicit GitHub and Cloudflare management.

## App Factory

The App Factory can create a complete authentication starter in one operation:

1. Create a GitHub repository.
2. Create a Cloudflare D1 database.
3. Create an R2 bucket.
4. Apply the SQL migration.
5. Push the full application source to GitHub.
6. Deploy a Worker with D1 and R2 bindings.
7. Enable the public workers.dev URL.
8. Optionally connect GitHub automatic builds.

The generated application includes real sign-up/sign-in, PBKDF2 password hashing, HttpOnly sessions, protected user data, and private R2 uploads.

## Required permissions

### GitHub fine-grained token

- Administration: write
- Contents: write

### Cloudflare user-scoped API token

- Workers Scripts: edit
- D1: write
- Workers R2 Storage: write
- Workers Builds Configuration: edit (only for automatic GitHub builds)
- Workers Scripts: read (for Builds setup)

Cloudflare's GitHub App must be authorized once before API-based repository connections can be created.

## Security model

- Provider tokens remain only in the current browser tab's memory.
- Tokens are never placed in source code, URLs, cookies, D1, KV, R2, or localStorage.
- Protect this manager with Cloudflare Access before entering credentials.
- Destructive Worker deletion requires browser confirmation.

## Deploy

```bash
npm install
npx wrangler deploy
```
