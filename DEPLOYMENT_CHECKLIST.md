# Production Deployment Checklist

This checklist tracks all steps needed to deploy the JW Research production architecture.

```
┌─────────────────┐         ┌──────────────────────┐         ┌──────────────────────┐
│   Vercel        │         │   Cloudflare Tunnel  │         │   DGX-Spark          │
│ theocracy.me    │────────▶│                      │────────▶│ (Backend + Qdrant)   │
└─────────────────┘         └──────────────────────┘         └──────────────────────┘
```

## Phase 1: Preparation ✅

### Prerequisites
- [ ] `theocracy.me` domain registered (GoDaddy, Namecheap, etc.)
- [ ] Domain nameservers changed to Cloudflare
- [ ] Cloudflare account created and domain added
- [ ] NVIDIA API key obtained (https://catalog.ngc.nvidia.com/pricing)
- [ ] HuggingFace account created and token generated
- [ ] DGX Spark access with Docker Engine installed
- [ ] Vercel account with GitHub connected

## Phase 2: Cloudflare Tunnel Setup 🔗

### Create Tunnel
- [ ] Go to Cloudflare Zero Trust Dashboard
- [ ] Navigate to Networks → Tunnels → Create tunnel
- [ ] Name: `jw-research`
- [ ] Choose Cloudflared as connector
- [ ] Copy tunnel installation token
- [ ] Save token as `CLOUDFLARE_TUNNEL_TOKEN`

### Configure DNS Records
- [ ] In Cloudflare Dashboard, go to Domains → `theocracy.me` → DNS
- [ ] Add CNAME records (get `{tunnel-id}.cfargotunnel.com` from tunnel page):

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | @ | (get from Vercel) | Proxied |
| CNAME | www | (get from Vercel) | Proxied |
| CNAME | qdrant | {tunnel-id}.cfargotunnel.com | Proxied |
| CNAME | llm | {tunnel-id}.cfargotunnel.com | Proxied |
| CNAME | embed | {tunnel-id}.cfargotunnel.com | Proxied |

- [ ] Wait 5-10 minutes for DNS propagation
- [ ] Verify DNS: `nslookup qdrant.theocracy.me`

## Phase 3: Backend Deployment on DGX 🖥️

### Clone Repository
- [ ] SSH into DGX
- [ ] `git clone <repo> ~/Documents/JW_Research`
- [ ] `cd ~/Documents/JW_Research`

### Set Environment Variables
```bash
export CLOUDFLARE_TUNNEL_TOKEN="<from-step-phase-2>"
export DGX_API_KEY="<generate-strong-uuid>"
export HF_TOKEN="<from-huggingface>"
export QDRANT_API_KEY="<generate-or-leave-empty>"
```

- [ ] Environment variables exported

### Deploy Services
```bash
cd infra && docker compose up -d
```

- [ ] All services started (`docker compose ps`)
- [ ] Cloudflare tunnel connected: `docker logs jw_cloudflared | grep -i connected`
- [ ] Qdrant responsive: `curl http://localhost:6333/health` → 200 OK
- [ ] vLLM responsive: `curl http://localhost:8000/v1/models -H "Authorization: Bearer $DGX_API_KEY"` → 200 OK
- [ ] Embeddings responsive: `curl http://localhost:8001/health` → 200 OK

### Verify Tunnel Routes
- [ ] `curl https://qdrant.theocracy.me/health` → 200 OK
- [ ] `curl https://llm.theocracy.me/v1/models` → 200 OK
- [ ] `curl https://embed.theocracy.me/health` → 200 OK

## Phase 4: Vercel Frontend Setup 🚀

### Configure Environment Variables
In Vercel Dashboard → Project Settings → Environment Variables:

- [ ] `QDRANT_URL` = `https://qdrant.theocracy.me`
- [ ] `NVIDIA_LLM_URL` = `https://llm.theocracy.me`
- [ ] `NVIDIA_EMBED_URL` = `https://embed.theocracy.me`
- [ ] `NVIDIA_API_KEY` = `<your-nvidia-key>`

### Configure Domain
In Vercel Dashboard → Project Settings → Domains:

- [ ] Add `theocracy.me`
- [ ] Follow Vercel's CNAME setup (add to Cloudflare)
- [ ] Add `www.theocracy.me` as alias
- [ ] Wait for HTTPS certificate to issue (5-10 min)

### Deploy Frontend
```bash
cd web
git add .
git commit -m "Enable production deployment"
git push origin main
```

- [ ] GitHub Actions workflow triggered
- [ ] Vercel deployment succeeded
- [ ] Frontend accessible at `https://theocracy.me`

## Phase 5: Testing 🧪

### Health Checks
- [ ] `curl https://qdrant.theocracy.me/health` → 200 OK
- [ ] `curl https://llm.theocracy.me/v1/models` → 200 OK
- [ ] `curl https://embed.theocracy.me/health` → 200 OK
- [ ] `curl https://theocracy.me` → 200 OK (frontend HTML)

### API Tests
- [ ] Visit `https://theocracy.me` in browser
- [ ] Chat interface loads without errors
- [ ] Ask a test question: "What is the purpose of the watchtower magazine?"
- [ ] Response appears with citations
- [ ] Sources panel shows numbered references
- [ ] No CORS errors in browser console
- [ ] No 502/503 errors

### Production Logs
- [ ] DGX: `docker logs jw_cloudflared | tail -20` shows healthy tunnel
- [ ] DGX: `docker logs jw_vllm | tail -20` shows request processing
- [ ] Vercel: Check deployment logs for successful build and no errors

## Phase 6: Monitoring & Alerts ⚠️

### Set Up Monitoring
- [ ] Configure Vercel → Settings → Alerts
  - [ ] Deployment failures
  - [ ] Function errors
  - [ ] High latency (>5s)

- [ ] Configure Cloudflare → Analytics → Notifications
  - [ ] Tunnel disconnection
  - [ ] DDoS attack detected

### DGX Monitoring
- [ ] Set up cron job to check tunnel status daily:
  ```bash
  0 8 * * * docker logs jw_cloudflared | grep -q Connected || echo "Tunnel disconnected" | mail admin
  ```
- [ ] Monitor GPU: `watch -n 1 nvidia-smi`
- [ ] Monitor disk: `docker system df`

### Documentation
- [ ] Save tunnel ID and credentials to secure location
- [ ] Document DGX IP address and access credentials
- [ ] Document API keys and their rotation schedule
- [ ] Create runbook for common issues

## Phase 7: Post-Deployment 🎯

### Backup & Recovery
- [ ] Export Qdrant backup: `docker exec jw_qdrant qdrant-cli export ...`
- [ ] Store backup in secure location
- [ ] Document recovery procedure
- [ ] Test recovery procedure (dry-run)

### Performance Baseline
- [ ] Record response times:
  - [ ] First query (cold start)
  - [ ] Typical query (after warm-up)
  - [ ] Large knowledge base query
- [ ] Record resource usage:
  - [ ] GPU memory
  - [ ] CPU usage
  - [ ] Bandwidth

### Security
- [ ] Run security audit: `cd crawler && pip install talisman gitleaks && talisman`
- [ ] Verify API keys are NOT in Git history: `gitleaks detect --source . -v`
- [ ] Enable Cloudflare WAF rules
- [ ] Set rate limiting policy on DGX API

### Documentation
- [ ] Update README with production URL
- [ ] Add troubleshooting section based on any issues encountered
- [ ] Create on-call runbook
- [ ] Document cost breakdown

## Validation Checklist ✅

- [ ] All DNS records resolve correctly
- [ ] Cloudflare tunnel shows "Connected"
- [ ] All backend services respond to health checks
- [ ] Frontend loads without errors
- [ ] Chat API works end-to-end
- [ ] Sources are properly cited
- [ ] No CORS errors
- [ ] No 5xx errors in logs
- [ ] Response times < 5 seconds typical
- [ ] GPU memory under control (< 90%)
- [ ] Monitoring and alerts configured
- [ ] Backup strategy in place
- [ ] Team knows how to handle incidents

## Common Issues & Solutions

### Tunnel Disconnected
```bash
# Check status
docker logs jw_cloudflared

# Restart
docker restart jw_cloudflared

# Verify
docker logs jw_cloudflared | grep -i connected
```

### 502 Bad Gateway
```bash
# Check backend services
docker compose ps

# Health check each service
curl http://localhost:6333/health
curl http://localhost:8000/v1/models -H "Authorization: Bearer $DGX_API_KEY"
curl http://localhost:8001/health

# Restart all
docker compose down && docker compose up -d
```

### Slow Responses
```bash
# Check GPU
nvidia-smi

# Check tunnel latency
time curl https://qdrant.theocracy.me/health

# Check Vercel function logs
# Dashboard → Deployments → Latest → Functions
```

### DNS Not Resolving
```bash
# Flush DNS
sudo systemctl restart systemd-resolved

# Check Cloudflare
nslookup qdrant.theocracy.me 1.1.1.1

# Verify CNAME
dig qdrant.theocracy.me CNAME
```

## Sign-Off

- [ ] Deployment completed successfully
- [ ] All tests passed
- [ ] Monitoring configured
- [ ] Team trained on runbook
- [ ] Backup verified
- [ ] Ready for production traffic

**Date Completed:** _______________  
**Deployed By:** _______________  
**Verified By:** _______________  
