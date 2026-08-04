# Dev Control Center

A private Cloudflare Worker dashboard for explicit GitHub and Cloudflare API actions.

## Security model

- Provider tokens remain only in the current browser tab's memory.
- Tokens are sent in request headers to this Worker only when you click an action.
- Tokens are never written to D1, KV, cookies, localStorage, source code, or logs.
- The Worker returns `Cache-Control: no-store`.
- Use newly issued, narrowly scoped tokens.
- Protect the deployed dashboard with Cloudflare Access before production use.

## Supported actions

### GitHub Manager
- Validate the token and show the authenticated user
- Create a public or private repository
- Create or replace a UTF-8 text file
- Create a starter website repository

### Cloudflare Manager
- Validate account access
- List Workers scripts
- Deploy a JavaScript Worker
- Delete a Worker after explicit confirmation

## Run locally

```bash
npm install
npm run dev
```

## Deploy

```bash
npx wrangler login
npm run deploy
```
