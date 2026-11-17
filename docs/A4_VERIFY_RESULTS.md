# תוצאות אימות אוטומטיות (deploy/verify.ps1)

נוצר: 2026-11-18 01:46 · דומיין: https://rewind.ddns.net · IP: 8.233.237.59

| # | בדיקה | תוצאה | פירוט |
|---|---|---|---|
| 1a | https://rewind.ddns.net | ✅ | HTTP 200, certificate verified by Windows (no -k) |
| 1b | http -> https | ✅ | 301 -> https://rewind.ddns.net:443/history |
| 1c | HSTS header | ✅ | strict-transport-security: max-age=31536000 |
| 2 | /health | ✅ | {"status":"ok"} 200 |
| 3 | E2E (register, login, YouTube, camera session + score, history, isolation, logout, no face, Second Pass) | ✅ | 13 passed (3.2m) |
| 4 | data persists + 20x GET /api/users/me with one token | ✅ | GET /api/users/me x20: 200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200 |
| 5a | min instances | ✅ | backend min=2, frontend min=1 |
| 5b | uptime check | ✅ | rewind-health exists (results: Console > Monitoring > Uptime checks) |
| + | rewind-backend direct URL | ✅ | https://rewind-backend-yeeq5wdzwa-ew.a.run.app -> 404 (expected 403/404: ingress = internal-and-cloud-load-balancing) |
| + | rewind-frontend direct URL | ✅ | https://rewind-frontend-yeeq5wdzwa-ew.a.run.app -> 404 (expected 403/404: ingress = internal-and-cloud-load-balancing) |
| + | secret scan (git grep) | ✅ | clean |
| + | backend env from Secret Manager | ✅ | MONGODB_URI / JWT_SECRET are secretKeyRef (Reference a secret) |
