# JW Research Production Architecture Implementation

This folder contains all the documentation and configuration needed to deploy the JW Research project with the production architecture:

```
┌─────────────────┐         ┌──────────────────────┐         ┌──────────────────────┐
│   Vercel        │         │   Cloudflare Tunnel  │         │   DGX-Spark          │
│   (Frontend)    │────────▶│                      │────────▶│   (Backend + Qdrant) │
│                 │         │                      │         │                      │
│ theocracy.me    │  HTTPS  │ theocracy.theocracy  │  HTTP   │ localhost:8000 (API) │
│ www.theocracy.me│────────▶│ qdrant.theocracy.me  │────────▶│ localhost:6333 (DB)  │
└─────────────────┘         └──────────────────────┘         └──────────────────────┘
```

## 📚 Documentation

### Core Setup Guides
1. **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** — Start here! One-minute overview and common commands
2. **[DEPLOYMENT.md](DEPLOYMENT.md)** — Detailed step-by-step deployment guide (20-30 minutes)
3. **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** — Verification checklist with all steps to validate

### Configuration Details
- **[CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md)** — Cloudflare Tunnel and DNS configuration
- **[ARCHITECTURE_PRODUCTION.md](ARCHITECTURE_PRODUCTION.md)** — Architecture diagrams, data flow, security model
- **[ENVIRONMENT.md](ENVIRONMENT.md)** — Environment variables reference
- **[infra/cloudflared/config.yml](infra/cloudflared/config.yml)** — Tunnel ingress routes

### Related Documentation
- **[README.md](README.md)** — Project overview and quick start
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Original architecture decisions
- **[PLAN.md](PLAN.md)** — Milestones and implementation details

## 🎯 Quick Start

### 1. DGX Backend (15 minutes)

```bash
cd ~/Documents/JW_Research

# Set credentials
export CLOUDFLARE_TUNNEL_TOKEN="<from-cloudflare-dashboard>"
export DGX_API_KEY="<generate-strong-token>"
export HF_TOKEN="<from-huggingface>"

# Deploy
cd infra && docker compose up -d

# Verify tunnel is connected
docker logs jw_cloudflared | grep -i connected
```

### 2. Cloudflare Tunnel & DNS (10 minutes)

1. Create tunnel at [Cloudflare Zero Trust](https://dash.teams.cloudflare.com/) named `jw-research`
2. Add DNS CNAME records in Cloudflare Dashboard:
   - `qdrant.theocracy.me` → `{tunnel-id}.cfargotunnel.com`
   - `llm.theocracy.me` → `{tunnel-id}.cfargotunnel.com`
   - `embed.theocracy.me` → `{tunnel-id}.cfargotunnel.com`

### 3. Vercel Frontend (10 minutes)

1. Set environment variables in Vercel Dashboard:
   - `QDRANT_URL=https://qdrant.theocracy.me`
   - `NVIDIA_LLM_URL=https://llm.theocracy.me`
   - `NVIDIA_EMBED_URL=https://embed.theocracy.me`
   - `NVIDIA_API_KEY=<your-key>`

2. Add domain `theocracy.me` to Vercel project
3. Push to main branch to deploy

### 4. Verify (5 minutes)

```bash
# Check all endpoints respond
curl https://qdrant.theocracy.me/health      # 200 OK
curl https://llm.theocracy.me/v1/models      # 200 OK
curl https://embed.theocracy.me/health       # 200 OK
curl https://theocracy.me                    # HTML response

# Test chat
Visit https://theocracy.me and try asking a question
```

## 🚀 What Gets Deployed

### Frontend (Vercel)
- Next.js 15 React app
- Route: `/api/chat` — Streaming chat API
- Environment: Production URLs pointing to DGX via Cloudflare
- Auto-deployment: Every push to `main` branch

### Backend (DGX Spark)
- **Qdrant** (6333) — Vector database with JW content chunks
- **vLLM** (8000) — LLM API (Qwen2.5-14B)
- **TEI** (8001) — Embeddings service (bge-large-en-v1.5)
- **Crawler** — Scrapy spider (weekly schedule)
- **Indexer** — Chunking + embedding pipeline (continuous)
- **Tunnel** — Cloudflare agent (always running)

All services run in Docker containers with GPU acceleration.

### Network (Cloudflare)
- **Tunnel**: Securely connects DGX to internet without open ports
- **DNS**: Routes domains to Vercel and tunnel endpoints
- **WAF**: Protects against DDoS and attacks
- **TLS**: HTTPS encryption end-to-end

## 🔍 Monitoring & Troubleshooting

### Check Status
```bash
# DGX services
docker compose ps

# Tunnel connection
docker logs jw_cloudflared | tail -10

# GPU usage
nvidia-smi

# Each service
curl http://localhost:6333/health  # Qdrant
curl http://localhost:8000/v1/models -H "Authorization: Bearer $DGX_API_KEY"  # vLLM
curl http://localhost:8001/health  # TEI
```

### Common Issues

| Issue | Check | Fix |
|-------|-------|-----|
| Tunnel disconnected | `docker logs jw_cloudflared` | Restart: `docker restart jw_cloudflared` |
| 502 Bad Gateway | `docker compose ps` | Restart: `docker compose restart` |
| DNS not resolving | `nslookup qdrant.theocracy.me` | Wait 5-10 min, verify CNAME records |
| Slow responses | `nvidia-smi` | Check GPU memory, reduce batch size |
| Vercel errors | Vercel dashboard logs | Check backend connectivity via tunnel |

See [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for more troubleshooting.

## 📋 Deployment Phases

### Phase 1: Preparation
- [ ] Domain registered and nameservers changed to Cloudflare
- [ ] NVIDIA API key obtained
- [ ] HuggingFace token generated
- [ ] DGX access confirmed

### Phase 2: Cloudflare Tunnel
- [ ] Tunnel created named `jw-research`
- [ ] DNS records added for all subdomains
- [ ] DNS propagation verified

### Phase 3: DGX Backend
- [ ] Services deployed: `docker compose up -d`
- [ ] Tunnel connected: tunnel shows "Connected"
- [ ] All health checks pass

### Phase 4: Vercel Frontend
- [ ] Environment variables set
- [ ] Domain configured
- [ ] Deployed to production

### Phase 5: Validation
- [ ] All endpoints respond
- [ ] Chat works end-to-end
- [ ] No errors in logs
- [ ] Performance acceptable

## 📊 Architecture Overview

### Data Flow
1. User asks question at `theocracy.me`
2. Frontend calls `/api/chat` (Vercel)
3. Vercel routes through Cloudflare Tunnel to DGX
4. DGX embeds query and searches Qdrant
5. vLLM generates response using context
6. Response streamed back to browser

### Security
- Vercel ← HTTPS → Cloudflare (public internet)
- Cloudflare ← Tunnel (encrypted) → DGX (private network)
- DGX services isolated in Docker, not exposed to internet
- All API keys stored in environment variables, not in code

### Performance
- Warm queries: 1-2 seconds
- Cold start: 3-5 seconds
- Concurrent users: 4-8 (limited by GPU memory)
- Token generation: ~40 tokens/sec

## 🔐 Security Checklist

- [ ] No API keys in Git (use `.env.local` and environment variables)
- [ ] Cloudflare WAF enabled
- [ ] DGX firewall restricts outbound (only to internet via tunnel)
- [ ] Rate limiting configured on API endpoints
- [ ] TLS certificates auto-renewed by Cloudflare and Vercel
- [ ] Regular backups of Qdrant collection

## 📈 Next Steps

1. **Deploy**: Follow [DEPLOYMENT.md](DEPLOYMENT.md)
2. **Test**: Use [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
3. **Monitor**: Set up monitoring per [ARCHITECTURE_PRODUCTION.md](ARCHITECTURE_PRODUCTION.md)
4. **Optimize**: Review performance baseline and scale if needed

## 🔗 Related Files

**Configuration**:
- `infra/docker-compose.yml` — Backend services
- `infra/cloudflared/config.yml` — Tunnel routes
- `web/.env.example` — Frontend environment variables
- `ENVIRONMENT.md` — Complete env var reference

**Documentation**:
- Original architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Project README: [README.md](README.md)
- Implementation plan: [PLAN.md](PLAN.md)

## 💡 Tips

- Use `docker compose logs -f` to follow all logs in real-time
- Set `DEBUG=true` in environment for verbose logging
- Run health checks via `curl` to verify each endpoint
- Monitor GPU with `watch -n 1 nvidia-smi` to spot OOM issues
- Check Vercel logs in dashboard for frontend errors
- Review Cloudflare tunnel logs for network issues

## ❓ FAQ

**Q: What if the tunnel keeps disconnecting?**
A: Usually DNS or firewall. Check `docker logs jw_cloudflared`, verify DGX can reach internet, and ensure firewall allows outbound HTTPS.

**Q: Can I run this on my own hardware?**
A: Yes, the architecture is portable. Replace DGX with any machine with GPU(s), update Cloudflare tunnel token, and adjust resource limits.

**Q: How do I scale to multiple DGX nodes?**
A: Add load balancer in front of Cloudflare Tunnel, deploy Qdrant cluster mode, and share HuggingFace cache volume.

**Q: What's the cost breakdown?**
A: Vercel ~$20/mo, Cloudflare ~$0 (Tunnel is free), DGX ~$1-2/hr for H100s. Typical production: $50-100/month.

---

**Last Updated**: 2026-06-18  
**Status**: Ready for production deployment  
**Next Review**: After first deployment
