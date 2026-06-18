# Quick Reference: Production Architecture

## 🚀 One-Minute Overview

**Architecture**: Vercel (frontend) ← HTTPS → Cloudflare Tunnel ← HTTP → DGX Spark (backend)

**Domains**:
- `theocracy.me` → Vercel (frontend)
- `www.theocracy.me` → Vercel (frontend)
- `qdrant.theocracy.me` → DGX Qdrant (via Tunnel)
- `llm.theocracy.me` → DGX vLLM (via Tunnel)
- `embed.theocracy.me` → DGX TEI (via Tunnel)

## 📋 Deployment Quick Start

### DGX Setup (5 minutes)

```bash
cd ~/Documents/JW_Research
export CLOUDFLARE_TUNNEL_TOKEN="<from-cloudflare-dashboard>"
export DGX_API_KEY="<generate-uuid>"
export HF_TOKEN="<from-huggingface>"

cd infra && docker compose up -d

# Verify
docker compose ps  # all 5 containers running
docker logs jw_cloudflared | grep -i connected
curl https://qdrant.theocracy.me/health  # 200 OK
```

### Vercel Setup (5 minutes)

1. Go to Vercel Dashboard → Environment Variables
2. Add:
   - `QDRANT_URL=https://qdrant.theocracy.me`
   - `NVIDIA_LLM_URL=https://llm.theocracy.me`
   - `NVIDIA_EMBED_URL=https://embed.theocracy.me`
   - `NVIDIA_API_KEY=<your-key>`
3. Add domain: `theocracy.me` (get CNAME from Vercel, add to Cloudflare)
4. Push to main: `git push origin main`

### Cloudflare DNS (5 minutes)

In Cloudflare Dashboard → Domains → theocracy.me → DNS:

| Name | Type | Content | Proxy |
|------|------|---------|-------|
| @ | A | (from Vercel) | ✓ |
| www | CNAME | (from Vercel) | ✓ |
| qdrant | CNAME | {tunnel-id}.cfargotunnel.com | ✓ |
| llm | CNAME | {tunnel-id}.cfargotunnel.com | ✓ |
| embed | CNAME | {tunnel-id}.cfargotunnel.com | ✓ |

## 🔍 Verification Checklist

```bash
# All should return 200 OK

# DGX local
curl http://localhost:6333/health          # Qdrant
curl http://localhost:8000/v1/models       # vLLM
curl http://localhost:8001/health          # Embeddings

# Via Cloudflare Tunnel
curl https://qdrant.theocracy.me/health    # Qdrant
curl https://llm.theocracy.me/v1/models    # vLLM
curl https://embed.theocracy.me/health     # Embeddings

# Frontend
curl https://theocracy.me                  # HTML response
```

## 🐛 Troubleshooting

### Tunnel Disconnected?
```bash
docker logs jw_cloudflared -f
docker restart jw_cloudflared
```

### 502 Bad Gateway?
```bash
docker compose ps  # check all running
curl http://localhost:6333/health  # check each service
docker compose restart  # if needed
```

### DNS Not Working?
```bash
nslookup qdrant.theocracy.me
nslookup theocracy.me

# Clear local cache
sudo systemctl restart systemd-resolved
```

### Slow Responses?
```bash
# Check GPU
nvidia-smi

# Check tunnel latency
time curl https://qdrant.theocracy.me/health

# Check Vercel logs: Dashboard → Deployments → Functions
```

## 📊 Monitoring

### DGX Monitoring
```bash
# Tunnel status (should show "Connected")
docker logs jw_cloudflared | tail -5

# GPU usage
nvidia-smi  # or: watch -n 1 nvidia-smi

# Disk usage
docker system df

# Service health
docker compose ps
```

### Vercel Monitoring
- Dashboard → Deployments (latest build status)
- Dashboard → Functions (invocation count, duration, errors)
- Set alerts for errors and high latency

### Cloudflare Monitoring
- Zero Trust → Tunnels → jw-research (should show "Connected")
- Analytics & Logs → Requests
- Analytics → DDoS/Threats

## 🔐 Security Quick Checks

```bash
# Verify no secrets in Git
git log -S "CLOUDFLARE_TUNNEL_TOKEN" --oneline
git log -S "NVIDIA_API_KEY" --oneline

# Both should be empty

# Check environment variables are not hardcoded
grep -r "CLOUDFLARE_TUNNEL_TOKEN=" . --exclude-dir=.git
grep -r "NVIDIA_API_KEY=" . --exclude-dir=.git

# Should only show .env.example (no actual values)
```

## 📈 Performance Baseline

Record these for comparison:

```bash
# Response time test
time curl -X POST https://theocracy.me/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}' \
  2>&1 | head -1

# GPU memory check
nvidia-smi | grep " Free"

# Qdrant health
curl https://qdrant.theocracy.me/health -w "Time: %{time_total}s\n"
```

## 📝 Common Operations

### Restart All Services
```bash
cd infra && docker compose down && docker compose up -d
```

### Check Specific Logs
```bash
docker logs jw_cloudflared -f        # Tunnel
docker logs jw_qdrant -f              # Vector DB
docker logs jw_vllm -f                # LLM
docker logs jw_embed -f               # Embeddings
```

### Scale GPU Memory
```bash
# Edit infra/docker-compose.yml
# Change --gpu-memory-utilization from 0.85 to 0.90

cd infra && docker compose restart jw_vllm
```

### Update Models
```bash
# Edit infra/docker-compose.yml
# Update image tags, then:

docker compose pull
docker compose up -d
```

### Backup Qdrant
```bash
docker exec jw_qdrant qdrant-cli \
  --url http://localhost:6333 \
  export --collection jw_research --output backup.snapshot
```

## 🆘 Emergency Procedures

### Tunnel Repeatedly Disconnecting
```bash
# 1. Check DGX network
ping 8.8.8.8

# 2. Check firewall
sudo iptables -L -n | grep HTTPS

# 3. Recreate tunnel in Cloudflare dashboard
# 4. Update CLOUDFLARE_TUNNEL_TOKEN
# 5. Restart: docker restart jw_cloudflared
```

### Cannot Access Backend via Tunnel
```bash
# 1. Verify local access
curl http://localhost:6333/health

# 2. Check tunnel logs
docker logs jw_cloudflared | grep -i error

# 3. Verify DNS CNAME
dig qdrant.theocracy.me +short

# 4. Check Cloudflare tunnel routes
# Dashboard → Zero Trust → Tunnels → jw-research
```

### GPU Out of Memory
```bash
# 1. Reduce GPU memory utilization (in docker-compose.yml)
# --gpu-memory-utilization 0.75  (down from 0.85)

# 2. Reduce batch size if processing

# 3. Restart services
docker compose restart jw_vllm
```

## 📚 Documentation Map

- [DEPLOYMENT.md](DEPLOYMENT.md) — Full deployment guide with all steps
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) — Verification checklist
- [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md) — Detailed tunnel configuration
- [ARCHITECTURE_PRODUCTION.md](ARCHITECTURE_PRODUCTION.md) — Diagrams and architecture
- [ENVIRONMENT.md](ENVIRONMENT.md) — Environment variables reference
- [README.md](README.md) — Project overview

## 📞 Support

**Issue**  | **Check** | **Fix**
-----------|----------|--------
Tunnel disconnected | `docker logs jw_cloudflared` | Restart tunnel or recreate in Cloudflare
502 error | `docker compose ps` | Restart services
DNS fails | `nslookup` check | Wait for propagation, verify CNAME
Slow response | `nvidia-smi` | Check GPU, reduce batch size
High errors | Frontend/Vercel logs | Check backend connectivity
