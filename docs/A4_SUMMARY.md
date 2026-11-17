# מטלה 4 בעמוד אחד

**מה נבנה:** Rewind (מטלה 3), מוכן לרוץ ב-Google Cloud מאחורי Load Balancer גלובלי עם דומיין, HTTPS וסודות ב-Secret Manager. **אותן שתי תמונות** רצות גם ב-`docker compose` המקומי וגם בענן.

**הכתובת:** `https://<DOMAIN>`. עדיין `TODO_USER`, ונקבעת ב-`deploy/config.ps1`. ראו "מה פתוח".

**איך זה בנוי** (פירוט ב-[CLOUD_GUIDE.md](CLOUD_GUIDE.md)):
- **דומיין:** No-IP, רשומת A אחת ← IP סטטי של **Global External Application LB**.
- **HTTPS:** תעודה מנוהלת של Google, ו-301 מ-http ל-https על אותו IP. בלי HTTPS הדפדפן לא נותן גישה למצלמה.
- **ניתוב (URL map):** `/api`, `/api/*` ו-`/health` ← Cloud Run `rewind-backend` (FastAPI, **2–5 מופעים**). כל השאר ← Cloud Run `rewind-frontend` (nginx + React, 1–5).
- **Cloud Run:** נגיש רק דרך ה-LB (ingress). התמונות `1.1.0` ב-Artifact Registry.
- **מסד:** MongoDB Atlas M0 ב-europe-west1, עם משתמש `readWrite` רק על `rewind`, ו-TLS.
- **סודות:** `MONGODB_URI` ו-`JWT_SECRET` ב-Secret Manager. ה-SA של השרת קורא רק אותם. השרת stateless, ו-`JWT_SECRET` משותף לכל המופעים: ב-production בלי סוד השרת לא עולה.
- **ניטור ועלות:** Uptime check על `/health` כל 5 דקות, ו-Budget של 50$ עם התראות ב-50/90/100%. הערכה: כ-40–50$ לחודש.
- **סקריפטים (PowerShell):** `deploy` (אידמפוטנטי, עם `-DryRun`), `redeploy`, `status -Wait`, `verify`, `teardown`, `make-submission`.

**מה שונה בקוד ממטלה 3** (D-052 עד D-055):
- nginx מאזין על `$PORT`, ועושה proxy ל-`/api` רק כש-`BACKEND_URL` מוגדר;
- השרת מאזין על `$PORT` עם `--proxy-headers`;
- `JWT_SECRET` חובה ב-production;
- מגבלת התחברות גם לפי אימייל;
- HSTS מאחורי HTTPS;
- התיעוד ב-`/api/docs` בענן;
- compose: `3000:3000` ו-tag `1.1.0`.

**מה נבדק:** pytest 77, Vitest 52, E2E של מטלה 3 מול compose ומול תיקייה ריקה, הלקוח במצב Cloud Run, השרת ב-production בלי סוד, ו-DryRun של הפריסה. הכול ירוק ([A4_TEST_REPORT.md](A4_TEST_REPORT.md)).

**מה פתוח:** כל מה שדורש את החשבונות שלכן. מילוי `config.ps1`, התחברויות, `deploy.ps1`, עדכון רשומת ה-A ב-No-IP, המתנה לתעודה, `verify.ps1` ו-`make-submission.ps1`. השלבים המדויקים בראש [USER_TODO.md](USER_TODO.md). ההגשה היא `submission/rewind.json` בלבד.
