# /deploy — Build & Deploy to Production

Build, verify, and deploy the HMN Cascade application.

## Pre-Deploy Checks

1. **Git status** — Ensure working tree is clean (no uncommitted changes)
2. **TypeScript** — Run `npx tsc --noEmit` — must pass with zero errors
3. **Build** — Run `npm run build` — must succeed
4. **Env check** — Verify required env vars are documented

## Deploy Steps

### Option A: Git Push (DigitalOcean App Platform auto-deploy)
If the app is connected to GitHub for auto-deploy:
```bash
git push origin master
```
Then monitor the deployment via DigitalOcean dashboard.

### Option B: Docker Build & Push
```bash
docker build -t hmn-cascade .
docker tag hmn-cascade registry.digitalocean.com/<registry>/hmn-cascade:latest
docker push registry.digitalocean.com/<registry>/hmn-cascade:latest
```

### Option C: doctl CLI
```bash
doctl apps create-deployment <app-id>
```

## Post-Deploy Verification

1. Check the app is responding: `curl -s https://<app-url>/api/health`
2. Verify admin login works
3. Check browser console for errors (use chrome-devtools MCP if available)

## Rollback

If deployment fails:
```bash
# Check recent deployments
doctl apps list-deployments <app-id>

# Rollback to previous
doctl apps create-deployment <app-id> --wait
```

Ask the user which deploy method to use before proceeding.
