# Production Deployment Guide

This guide walks through deploying the JW Research architecture to production with Vercel frontend and DGX backend connected via Cloudflare Tunnel.

## Architecture

```
┌─────────────────┐         ┌──────────────────────┐         ┌──────────────────────┐
│   Vercel        │         │   Cloudflare Tunnel  │         │   DGX-Spark          │
│   (Frontend)    │────────▶│                      │────────▶│   (Backend + Qdrant) │
│                 │         │                      │         │                      │
│ theocracy.me    │  HTTPS  │ theocracy.theocracy  │  HTTP   │ localhost:8000 (API) │
│ www.theocracy.me│────────▶│ qdrant.theocracy.me  │────────▶│ localhost:6333 (DB)  │
└─────────────────┘         └──────────────────────┘         └──────────────────────┘
```

## Prerequisites

✓ `theocracy.me` domain registered  
✓ Cloudflare account with domain pointing to Cloudflare nameservers  
✓ DGX Spark access with Docker Engine running  
✓ Vercel account with GitHub integration  
✓ NVIDIA API key for LLM and embeddings  
✓ HuggingFace token for model downloads  

## Phase 1: Backend Setup (DGX Spark)

### 1.1 Create Cloudflare Tunnel

1. Go to **Cloudflare Zero Trust Dashboard** → **Networks** → **Tunnels**
2. Click **Create a tunnel**, choose **Cloudflared**
3. Name: `jw-research`
4. Copy the **installation token** (save to `CLOUDFLARE_TUNNEL_TOKEN`)

```bash
# On DGX, store the token
export CLOUDFLARE_TUNNEL_TOKEN="<paste-from-cloudflare>"
```

### 1.2 Deploy Backend Services

On DGX Spark, clone the repository and deploy:

```bash
cd ~/Documents/JW_Research

# Set environment variables
export CLOUDFLARE_TUNNEL_TOKEN="<from-cloudflare-step-1>"
export DGX_API_KEY="<generate-random-uuid-or-key>"
export HF_TOKEN="<your-hugging-face-token>"
export QDRANT_API_KEY="<optional-api-key>"

# Deploy
cd infra && docker compose up -d

# Verify services are running
docker compose ps

# Check Cloudflare tunnel is connected
docker logs jw_cloudflared | grep -i connected
```

Expected output:
```
CONTAINER ID   IMAGE                        STATUS                    NAMES
abc123...      cloudflare/cloudflared       Up 2 minutes              jw_cloudflared ← Connected
def456...      qdrant/qdrant:v1.12.4        Up 2 minutes              jw_qdrant
ghi789...      vllm/vllm-openai:v0.6.3      Up 2 minutes              jw_vllm
jkl012...      ghcr.io/huggingface/.../tei  Up 2 minutes              jw_embed
```

### 1.3 Verify Local Connectivity

Test that services respond locally:

```bash
# Qdrant health
curl http://localhost:6333/health

# vLLM models list
curl http://localhost:8000/v1/models -H "Authorization: Bearer $DGX_API_KEY"

# Embeddings health
curl http://localhost:8001/health
```

## Phase 2: DNS & Cloudflare Configuration

### 2.1 Configure DNS Records

In **Cloudflare Dashboard** → **Domains** → `theocracy.me` → **DNS**:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | @ | (from Vercel) | Proxied |
| CNAME | www | (from Vercel) | Proxied |
| CNAME | qdrant | {tunnel-uuid}.cfargotunnel.com | Proxied |
| CNAME | llm | {tunnel-uuid}.cfargotunnel.com | Proxied |
| CNAME | embed | {tunnel-uuid}.cfargotunnel.com | Proxied |

**To get your tunnel UUID:**
```bash
# Check Cloudflare dashboard or run
cloudflare-cli tunnel list  # if installed
```

### 2.2 Verify DNS Propagation

```bash
# Wait 5-10 minutes, then test
nslookup qdrant.theocracy.me
nslookup llm.theocracy.me
nslookup embed.theocracy.me

# All should resolve to Cloudflare IPs
```

## Phase 3: Vercel Frontend Deployment

### 3.1 Set Environment Variables in Vercel

In **Vercel Dashboard** → **Project Settings** → **Environment Variables**:

| Variable | Value |
|----------|-------|
| `QDRANT_URL` | `https://qdrant.theocracy.me` |
| `NVIDIA_LLM_URL` | `https://llm.theocracy.me` |
| `NVIDIA_EMBED_URL` | `https://embed.theocracy.me` |
| `NVIDIA_API_KEY` | `<your-nvidia-key>` |

### 3.2 Configure Domain in Vercel

1. Go to **Project Settings** → **Domains**
2. Add custom domain: `theocracy.me`
3. Follow Vercel's DNS setup (add CNAME to Cloudflare)
4. Add `www.theocracy.me` as alias

### 3.3 Deploy Frontend

Push to `main` branch to trigger Vercel deployment:

```bash
cd web
git add .
git commit -m "Enable production deployment"
git push origin main

# Monitor deployment at https://vercel.com/dashboard
```

## Phase 4: Test Production Setup

### 4.1 Test Backend via Tunnel

```bash
# From any internet-connected machine
curl https://qdrant.theocracy.me/health
curl https://llm.theocracy.me/v1/models \
  -H "Authorization: Bearer $DGX_API_KEY"
curl https://embed.theocracy.me/health
```

All should return `200 OK`.

### 4.2 Test Frontend

1. Visit `https://theocracy.me`
2. Type a question in the chat
3. Verify:
   - Chat shows thinking/loading indicator
   - Response appears with sources
   - No CORS or connectivity errors

### 4.3 Monitor Logs

**On DGX:**
```bash
# Cloudflare tunnel logs
docker logs jw_cloudflared -f

# Backend API logs
docker logs jw_vllm -f
docker logs jw_embed -f

# Search logs
docker logs jw_qdrant -f
```

**In Vercel:**
- Go to **Deployments** tab
- Click latest deployment
- View **Functions** logs for `/api/chat`

## Phase 5: Production Monitoring & Maintenance

### 5.1 Set Up Monitoring

**Cloudflare Dashboard:**
- Monitor tunnel status under **Zero Trust** → **Tunnels**
- Check DDoS analytics and threats

**Vercel Dashboard:**
- Monitor function invocations and duration
- Set up alerts for high error rates

**DGX Server:**
```bash
# Monitor GPU utilization
nvidia-smi -l 1  # updates every 1 second

# Monitor Docker disk usage
docker system df
```

### 5.2 Regular Maintenance

**Weekly:**
- Check Cloudflare tunnel connection status
- Review error logs for anomalies
- Monitor GPU memory usage

**Monthly:**
- Rotate API keys
- Update model versions if needed
- Review Qdrant collection statistics

**Quarterly:**
- Run security audit with `talisman` and `gitleaks`
- Update Docker images to latest patches
- Review cost analysis

### 5.3 Common Tasks

**Restart Backend Services**
```bash
cd infra && docker compose restart
```

**Update Model Versions**
Edit `infra/docker-compose.yml`, update image tags, then:
```bash
docker compose pull && docker compose up -d
```

**Scale GPU Resources**
In `docker-compose.yml`, adjust `gpu-memory-utilization` for vLLM:
```yaml
command: >
  --gpu-memory-utilization 0.9  # Increase from 0.85
```

**Check Tunnel Logs**
```bash
docker logs jw_cloudflared --tail 100 -f
```

## Troubleshooting

### Issue: "Tunnel is disconnected"

**Check:**
1. Verify `CLOUDFLARE_TUNNEL_TOKEN` is set correctly
2. Check DGX has internet connectivity: `ping 1.1.1.1`
3. View tunnel logs: `docker logs jw_cloudflared`

**Fix:**
```bash
# Restart tunnel
docker restart jw_cloudflared

# Or recreate tunnel in Cloudflare dashboard and update token
```

### Issue: "502 Bad Gateway" from frontend

**Check:**
1. Backend services running: `docker compose ps`
2. Services are healthy locally: `curl http://localhost:6333/health`
3. Tunnel is connected: `docker logs jw_cloudflared`
4. DNS resolves correctly: `nslookup qdrant.theocracy.me`

**Fix:**
```bash
# Restart all services
docker compose down && docker compose up -d

# Or debug specific service
docker logs jw_vllm -f
```

### Issue: Slow responses or timeouts

**Check:**
1. GPU utilization: `nvidia-smi`
2. Qdrant response time: `curl -w "Time: %{time_total}s" https://qdrant.theocracy.me/health`
3. Vercel function duration in dashboard

**Fix:**
- Reduce batch size in indexer if Qdrant is slow
- Increase GPU memory utilization for vLLM
- Consider scaling to multiple GPUs

### Issue: High API errors in Vercel logs

**Check:**
1. Backend is accessible: `curl https://qdrant.theocracy.me/health`
2. API key is correct in Vercel environment
3. Rate limiting not triggered on DGX

**Fix:**
- Verify `DGX_API_KEY` is set on DGX and matches Vercel
- Check DGX server logs: `docker logs jw_vllm`
- Restart API service: `docker restart jw_vllm`

## Rollback Procedure

If production is broken and needs rollback:

**Step 1: Revert DNS**
- Point `theocracy.me` back to old infrastructure or disable

**Step 2: Stop current tunnel**
```bash
docker compose down
```

**Step 3: Revert Vercel**
- Go to Vercel dashboard
- Click **Deployments**
- Select previous stable deployment
- Click **Promote to Production**

**Step 4: Investigate & Fix**
- Check logs for root cause
- Make fixes on `dev` branch
- Test thoroughly before re-deploying to `main`

## Success Criteria

✅ All services running on DGX  
✅ Cloudflare tunnel shows "Connected" status  
✅ DNS records resolve to Cloudflare IPs  
✅ `curl https://qdrant.theocracy.me/health` returns 200  
✅ Frontend loads at `https://theocracy.me`  
✅ Chat API works end-to-end  
✅ No errors in backend or frontend logs  

## Next Steps

1. Set up continuous monitoring (Datadog, Grafana, etc.)
2. Implement auto-scaling for DGX workloads
3. Add backup/disaster recovery procedures
4. Set up cost optimization alerts
5. Document runbook for on-call engineers
