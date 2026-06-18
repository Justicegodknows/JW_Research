# Cloudflare Tunnel & Domain Setup

This document describes the production architecture routing through Cloudflare Tunnel.

```
┌─────────────────┐         ┌──────────────────────┐         ┌──────────────────────┐
│   Vercel        │         │   Cloudflare Tunnel  │         │   DGX-Spark          │
│   (Frontend)    │────────▶│                      │────────▶│   (Backend + Qdrant) │
│                 │         │                      │         │                      │
│ theocracy.me    │  HTTPS  │ theocracy.theocracy  │  HTTP   │ localhost:8000 (API) │
│ www.theocracy.me│────────▶│ qdrant.theocracy.me  │────────▶│ localhost:6333 (DB)  │
└─────────────────┘         └──────────────────────┘         └──────────────────────┘
```

## Architecture Overview

### Vercel Frontend
- **Domains**: `theocracy.me`, `www.theocracy.me`
- **Configuration**: Set up in Vercel project
- **Environment**: Connects to backend via Cloudflare Tunnel URLs (`qdrant.theocracy.me`, etc.)

### Cloudflare Tunnel
- **Purpose**: Securely exposes DGX backend services without opening ports
- **Tunnel ID**: `jw-research` (set in `infra/cloudflared/config.yml`)
- **Status**: Running on DGX Spark as Docker service
- **Routes**:
  - `qdrant.theocracy.me` → `http://qdrant:6333` (vector DB)
  - `llm.theocracy.me` → `http://vllm:8000` (LLM API)
  - `embed.theocracy.me` → `http://embed:8001` (embeddings)

### DGX-Spark Backend
- **Services**: Qdrant, vLLM, Text Embeddings Inference
- **Tunnel Access**: Via Cloudflare Tunnel token (`CLOUDFLARE_TUNNEL_TOKEN`)
- **Local Ports**: 6333 (Qdrant), 8000 (vLLM), 8001 (Embeddings)
- **Network**: Internal Docker network (not exposed to internet)

## Prerequisites

1. **Cloudflare Account** with `theocracy.me` domain registered
2. **DNS Nameservers** set to Cloudflare (done during Cloudflare account setup)
3. **Cloudflare Tunnel** created in dashboard named `jw-research`
4. **Cloudflare API Token** with DNS and Tunnel permissions
5. **DGX Spark Access** with Docker engine running

## Step 1: Create Cloudflare Tunnel

### Via Cloudflare Dashboard

1. Navigate to **Zero Trust** → **Networks** → **Tunnels**
2. Click **Create a tunnel**
3. Choose **Cloudflared**
4. Name it: `jw-research`
5. Choose connector: **Docker** (or your infrastructure provider)
6. Copy the installation token (used in docker-compose environment)

### Via Cloudflare API

```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/{account-id}/cfd_tunnel" \
  -H "Authorization: Bearer {api-token}" \
  -H "Content-Type: application/json" \
  -d '{"name": "jw-research", "account_tag": "{account-id}"}'
```

## Step 2: Set Cloudflare Tunnel Token on DGX

Store the tunnel credentials file on DGX at `/etc/cloudflared/jw-research.json`:

```json
{
  "AccountTag": "your-account-id",
  "TunnelSecret": "your-tunnel-secret",
  "TunnelID": "jw-research-tunnel-id",
  "TunnelName": "jw-research",
  "OriginCertKey": "your-origin-cert-key"
}
```

Or set the environment variable in docker-compose:

```yaml
environment:
  - CLOUDFLARE_TUNNEL_TOKEN=<your-tunnel-token>
```

**Note**: The tunnel token is sensitive. Store it in environment variables, not in version control.

## Step 3: Configure DNS Records in Cloudflare

Create the following DNS records for `theocracy.me`:

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| CNAME | theocracy.me | (Vercel production domain) | Proxied |
| CNAME | www | (Vercel production domain) | Proxied |
| CNAME | qdrant | {tunnel-id}.cfargotunnel.com | Proxied |
| CNAME | llm | {tunnel-id}.cfargotunnel.com | Proxied |
| CNAME | embed | {tunnel-id}.cfargotunnel.com | Proxied |

**Steps**:
1. Go to Cloudflare Dashboard → Domains → `theocracy.me` → DNS
2. Add CNAME records as listed above
3. Ensure "Proxied" is selected (orange cloud icon)
4. Wait 5-10 minutes for DNS propagation

## Step 4: Deploy Docker Compose on DGX

```bash
cd /home/admin/Documents/JW_Research/infra

# Set environment variables
export CLOUDFLARE_TUNNEL_TOKEN="<your-tunnel-token>"
export DGX_API_KEY="<your-api-key>"
export HF_TOKEN="<your-hugging-face-token>"

# Start services
docker compose up -d

# Verify tunnel is connected
docker logs jw_cloudflared 2>&1 | grep -i "connected\|ready"

# Check services are running
docker compose ps
```

Expected output:
```
CONTAINER ID   IMAGE                        STATUS                    NAMES
...            cloudflare/cloudflared:latest   Up 2 minutes            jw_cloudflared
...            qdrant/qdrant:v1.12.4           Up 2 minutes            jw_qdrant
...            vllm/vllm-openai:v0.6.3         Up 2 minutes            jw_vllm
...            ghcr.io/huggingface/.../tei:1.5 Up 2 minutes            jw_embed
```

## Step 5: Configure Vercel Environment Variables

In Vercel Dashboard → Project Settings → Environment Variables:

```
QDRANT_URL=https://qdrant.theocracy.me
NVIDIA_LLM_URL=https://llm.theocracy.me
NVIDIA_EMBED_URL=https://embed.theocracy.me
NVIDIA_API_KEY=<your-nvidia-key>
```

**Note**: Use `https://` for Cloudflare Tunnel endpoints (Cloudflare adds TLS).

## Step 6: Test Connectivity

### Test from DGX (local)
```bash
# Verify services respond locally
curl http://localhost:6333/health        # Qdrant
curl http://localhost:8000/v1/models     # vLLM
curl http://localhost:8001/health        # Embeddings
```

### Test from Vercel Frontend
```bash
# In Next.js app or terminal
curl https://qdrant.theocracy.me/health
curl https://llm.theocracy.me/v1/models
curl https://embed.theocracy.me/health
```

All should return `200 OK` or service-specific success responses.

### Test Chat API
Visit `https://theocracy.me` and try asking a question. The chat should:
1. Query Qdrant (qdrant.theocracy.me)
2. Get LLM response from vLLM (llm.theocracy.me)
3. Use embeddings from (embed.theocracy.me)

## Monitoring & Troubleshooting

### Check Tunnel Status
```bash
# Via Cloudflare Dashboard
Zero Trust → Networks → Tunnels → jw-research

# Expected: "Connected" with IP address of DGX
```

### Check Logs on DGX
```bash
# Cloudflare Tunnel logs
docker logs jw_cloudflared -f

# Qdrant logs
docker logs jw_qdrant -f

# vLLM logs
docker logs jw_vllm -f
```

### Common Issues

**Issue: Tunnel shows "Disconnected"**
- Check `CLOUDFLARE_TUNNEL_TOKEN` is set correctly
- Verify DGX has internet connectivity
- Check firewall allows outbound HTTPS traffic

**Issue: DNS resolution fails for subdomains**
- Wait 5-10 minutes for DNS propagation
- Verify CNAME records are set to `{tunnel-id}.cfargotunnel.com`
- Clear local DNS cache: `sudo systemctl restart systemd-resolved`

**Issue: 502 Bad Gateway when accessing services**
- Verify Docker containers are running: `docker compose ps`
- Check services listen on correct ports (6333, 8000, 8001)
- Verify `infra/cloudflared/config.yml` routes are correct

**Issue: High latency or timeouts**
- Check DGX network connectivity
- Monitor GPU utilization for vLLM
- Consider regional Cloudflare worker for caching

## Cost Considerations

- **Cloudflare Tunnel**: Free tier includes unlimited tunnels and 100,000 requests/month for Cloudflare Workers
- **Vercel**: Typical Next.js hosting is ~$20/month for Hobby tier, more for Pro
- **DGX Spark**: GPU infrastructure costs (H100s) are ~$1-2/hour for on-demand

## Security Notes

1. **Never commit secrets** to Git (use `.gitignore` and environment variables)
2. **Rotate API keys** every 90 days
3. **Enable Cloudflare DDoS protection** (included in free tier)
4. **Use Cloudflare WAF rules** to block malicious traffic
5. **Monitor tunnel activity** via Cloudflare dashboard

## Next Steps

1. Create `DEPLOYMENT.md` with step-by-step deployment process
2. Set up monitoring via Cloudflare Analytics or Grafana
3. Configure log aggregation (e.g., via Datadog or Grafana Loki)
4. Implement auto-scaling for Vercel and DGX services
