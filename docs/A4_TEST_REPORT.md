# מטלה 4: דוח בדיקות

**מצב נכון ל-18.11.2026:** הקוד המוכן לענן נבדק מקומית במלואו. **הפריסה לענן עוד לא בוצעה**: בסשן העבודה אף חשבון לא היה מחובר (gcloud, Atlas, gh, Docker Hub), ופרטי הפרויקט ב-`deploy/config.ps1` עדיין `TODO_USER`. לכן כל בדיקות הענן מסומנות ⚠️ "ממתין", עם הפקודה שמשלימה אותן. לא המצאנו תוצאות.

## א. טבלת הבדיקה של מטלה 4 (סעיף 7)

| # | נושא | בדיקה | מצב | איך משלימים |
|---|---|---|---|---|
| 1 | דומיין ו-HTTPS | `https://DOMAIN` עם תעודה תקינה, ו-`http://` ← 301 | ⚠️ ממתין לפריסה ולתעודה | `deploy\deploy.ps1` ← No-IP ← `deploy\status.ps1 -Wait` ← `deploy\verify.ps1` |
| 2 | השרת | `https://DOMAIN/health` ← 200 `{"status":"ok"}` | ⚠️ ממתין (מקומית ✅: 200 ישירות וגם דרך nginx) | `deploy\verify.ps1` |
| 3 | האתר | E2E מלא מול הדומיין | ⚠️ ממתין (מקומית ✅, ראו ב') | `deploy\verify.ps1` (מריץ Playwright עם `BASE_URL=https://DOMAIN`) |
| 4 | נתונים נשמרים + 20 בקשות עם אותו טוקן | `cloud.spec.js` | ⚠️ ממתין (מקומית ✅: 20/20 החזירו 200, הנתונים נשמרו אחרי רענון, התנתקות והתחברות) | `deploy\verify.ps1` |
| 5 | זמינות | Uptime check ירוק, min-instances 2/1 | ⚠️ ממתין | `deploy\verify.ps1` + Console ← Monitoring ← Uptime checks |
| + | בידוד | `*.run.app` ← 403/404 מבחוץ | ⚠️ ממתין | `deploy\verify.ps1` |
| + | סודות | סריקת `git grep` | ✅ נקייה לפני כל commit, וגם בסוף | |
| + | סודות | `.env` לא בתמונות | ✅ `.dockerignore` בשתי התיקיות מוציא `.env` ו-`*.env` | |

## ב. מה כן נבדק (מקומית), עם תוצאות

| בדיקה | איך | תוצאה |
|---|---|---|
| pytest | `scripts/run_tests.sh` (מונגו אמיתי ב-Docker) | **77 עברו**: 72 קיימות + 5 חדשות (production בלי `JWT_SECRET` לא עולה; development עולה; `/api/docs` ב-production; `/docs` מקומית; מגבלת ניסיונות לפי אימייל מ-20 IP) |
| Vitest | `npx vitest run` | **52 עברו** |
| בדיקת מודל | `node scripts/check_model.mjs` | 3 פלטים, OK |
| מטלה 3 לא נשברה (compose dev) | `docker compose -f docker-compose.dev.yml up --build` | האתר 200; `/health` דרך nginx 200; `/api` מגיע לשרת (401); בלי HSTS ב-http. E2E: grading, noface, secondpass, debugpanel: **11/11** |
| מטלה 3 מתיקייה ריקה | רק 3 הקבצים מ-`assignment3.zip` (tag `1.1.0`, תמונות מקומיות בשם `rewindlocal`) | `/health` 200, האתר 200, `/health` דרך nginx 200. E2E grading + cloud: **6/6** |
| הלקוח כמו ב-Cloud Run | `docker run -e PORT=8080 -e BACKEND_URL= rewind-frontend` | nginx עלה והאתר 200 על 8080. בלוג: "no /api proxy". HSTS נשלח רק עם `X-Forwarded-Proto: https` |
| השרת ב-production בלי סוד | `docker run -e ENV=production -e JWT_SECRET= rewind-backend` | `FATAL: JWT_SECRET is required when ENV=production ...`, והשרת לא עלה |
| אין `localhost:8000` בקוד הבנוי | `grep -r localhost:8000 dist/` | 0 |
| 20 בקשות עם אותו טוקן + שמירת נתונים | `e2e/tests/cloud.spec.js` מול localhost:3000 | 2/2 (`200` ×20) |
| סקריפטי הפריסה | PowerShell parser על כל ה-`.ps1`, ו-`deploy.ps1 -DryRun` / `redeploy.ps1 -DryRun` עם config לדוגמה | כל הסקריפטים עוברים parse. ה-DryRun מדפיס את כל רצף הפקודות. הדגלים נבדקו מול `--help` של gcloud 594 ו-atlascli 1.59. נמצאו ותוקנו 3 באגים (DECISIONS D-063) |
| `deploy.ps1` עם placeholders | ריצה על `config.ps1` האמיתי | נעצר בהודעה: `fill $GCP_PROJECT_ID, $DOMAIN first` |
| קובץ ההגשה | `deploy\make-submission.ps1` | JSON תקין, שם הקובץ = `project`. מסומן שעדיין יש `TODO_USER` (domain, members) |

## ג. מה לא נבדק, בכנות
- **שום דבר בענן:** אין פרויקט GCP מחובר, אין cluster ב-Atlas, ואין דומיין.
- **התמונות `1.1.0` עוד לא ב-Docker Hub:** אין `docker login` ואין `DOCKERHUB_USER`. הבדיקה מתיקייה ריקה רצה עם תמונות מקומיות בשם `rewindlocal/...:1.1.0`.
- **ההתנהגות של `X-Forwarded-For` מאחורי ה-LB האמיתי** לא נבדקה. לכן הוספנו את המגבלה לפי אימייל, שלא תלויה בה (D-054).
- `alert.ps1` (התראת מייל) לא הורץ, כי `$ALERT_EMAIL` ריק.

אחרי `deploy\verify.ps1`, התוצאות האמיתיות יופיעו ב-[A4_VERIFY_RESULTS.md](A4_VERIFY_RESULTS.md).
