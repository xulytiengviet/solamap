# GitHub Actions → Cloudflare Worker

The workflow `.github/workflows/deploy-solamap-worker.yml` is manual (`workflow_dispatch`) and deploys to the existing Cloudflare Worker named `solamap`.

## Configure GitHub Actions secrets

In GitHub repo `xulytiengviet/solamap`, go to **Settings → Secrets and variables → Actions → New repository secret**. Add four values:

- `CLOUDFLARE_API_TOKEN` — Cloudflare API token scoped to this account with permission to edit/deploy Workers scripts and secrets.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID, not a token.
- `SOLANA_RPC_PRIMARY` — full HTTPS Solana Mainnet JSON-RPC endpoint from a real provider (private; may include an API key in URL).
- `SOLANA_RPC_BACKUP` — full HTTPS Mainnet endpoint from an independent provider.

Never put endpoint credentials in source files, logs, issues, or chat. GitHub Actions secrets are encrypted, and are passed to `wrangler secret put` through stdin. Note: anyone allowed to change deployment workflow/code could exfiltrate secrets; protect the `main` branch and review changes carefully.

## Deploy

Open **Actions → Deploy SolaMap RPC Worker → Run workflow** on `main`. This deploys `cloudflare-rpc/src/index.js` using `cloudflare-rpc/wrangler.toml`, then provisions both upstream URLs as Cloudflare Worker Secrets. A GitHub commit does not by itself deploy your Worker unless an auto-deployment is correctly configured.

**Warning:** Do not use this workflow at the same time as an independent auto-deployment pipeline targeting `solamap`. Choose a single deployment owner or ensure their configuration stays identical.

## Verify

- `https://solamap.bilabot-cvnss4-71bd4651.workers.dev/health` should return `service:solamap-rpc` and `configured:true`.
- A health response does not prove the RPC upstream works. In SolaMap click **Kiểm tra Worker** or **Kiểm tra RPC**, then refresh balance.
- If HTTP 404 remains, review the Actions deploy logs and check Cloudflare's active deployment version/route.
- If `getGenesisHash` or `getBalance` fails, check the provider's network, API token permissions, outbound access, and usage limits.

Security: Gateway's CORS restriction is not authentication. Apply Cloudflare WAF/rate limiting and manage RPC-provider quotas. The browser-only wallet should not be trusted with significant funds without security review.
