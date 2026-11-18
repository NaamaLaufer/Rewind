# ASSIGNMENT4.md: Rewind בענן (מטלה 4)
### הוראות ביצוע מלאות ל-Claude Code: להעלות את Rewind ל-Google Cloud עם Load Balancer, דומיין, HTTPS ו-Secret Manager

---

## 0. כללי עבודה: קרא קודם, הם גוברים על כל הרגל אחר

### 0.1 אוטונומיה מלאה: בלי שאלות
- **אל תשאל את המשתמשת שום שאלה ואל תחכה לאישור.** בכל התלבטות בחר את האפשרות **המומלצת ביותר** (יציבה, פשוטה להסבר בהגנה, זולה מתוך קרדיט ה-300$, ולא מסכנת את מטלה 3), ותמשיך.
- **כל החלטה נרשמת מיד** ב-`docs/DECISIONS.md`, בהמשך למספור הקיים (D-0xx), באותו פורמט: מה בחרנו, אפשרויות שנשקלו, למה זה המומלץ, מה המחיר, משפט אחד להגנה.
- **אתה מורשה מראש** להתקין כל כלי שצריך (Google Cloud CLI, רכיבי gcloud, Atlas CLI, gh, חבילות npm/pip, Playwright browsers), להריץ כל פקודה בתיקיית הפרויקט, לבנות ולדחוף תמונות, וליצור משאבי ענן בפרויקט ה-GCP של המשתמשת. אל תבקש רשות לאף אחד מאלה.
- **הסביבה:** Windows + PowerShell. סקריפטים נכתבים ב-**PowerShell** (`.ps1`). אם יש גם Git Bash, אפשר להוסיף גרסת `.sh`, אבל ה-`.ps1` הוא הראשי. שים לב לתיקייה עם שם בעברית בנתיב: תמיד לעטוף נתיבים במרכאות.
- **לפני כל פקודת gcloud או atlas שאתה לא בטוח בדגלים שלה**, הרץ `--help` ובדוק בתיעוד הרשמי. אל תנחש דגלים.

### 0.2 המקום היחיד שבו אי אפשר בלי המשתמשת: חשבונות והתחברויות
יש פעולות שדורשות את החשבון האישי שלה בדפדפן: התחברות ל-Google Cloud, התחברות ל-MongoDB Atlas ופתיחת hostname ב-No-IP. **אל תיעצר בגללן.**
- אם הן כבר בוצעו (סעיף 1), השתמש בהן.
- אם לא: בצע את כל מה שאפשר בלי חשבון (שינויי קוד, בדיקות מקומיות, סקריפטים, תיעוד), רשום את מה שחסר ב-`docs/USER_TODO.md` עם פקודות מדויקות, הדפס בסוף הטרמינל בבירור מה בדיוק היא צריכה לעשות, וסיים את כל השאר.
- **לעולם אל תבקש ממנה להדביק סיסמה או סוד לתוך הצ'אט.**

### 0.3 מה אסור (גם בלי לשאול)
- אסור לשדרג את חשבון ה-Free Trial (Upgrade) ואסור להפעיל שירותים בתשלום שלא נדרשים (בלי Cloud SQL, בלי VMs).
- אסור למחוק משאבי ענן שלא אתה יצרת במטלה הזו.
- אסור שסוד יופיע בקוד, ב-Dockerfile, בתמונה, ב-Git, בלוג, בפלט הטרמינל או במשתנה סביבה רגיל ב-Console. סודות רק ב-Secret Manager (סעיף 6).
- אסור `git push --force` ל-main, ואסור לשכתב היסטוריה של main.
- אסור לשבור את מטלה 3: `docker compose up` המקומי חייב להמשיך לעבוד.

---

## 1. מה המשתמשת ממלאת לפני שמתחילים (אם חסר: placeholders ו-USER_TODO, בלי לעצור)

הערכים נמצאים בקובץ `deploy/config.ps1` (**בלי סודות**, אפשר להכניס ל-Git). אם הוא לא קיים, צור אותו עם placeholders:
```powershell
$GCP_PROJECT_ID = "TODO_USER"        # מזהה הפרויקט ב-Google Cloud (לא השם, ה-ID)
$REGION         = "europe-west1"     # ראו D בסעיף 3
$DOMAIN         = "TODO_USER.ddns.net"  # ה-hostname שנפתח ב-No-IP
$PROJECT_SLUG   = "rewind"           # מזהה הקבוצה לקובץ ההגשה: אנגלית, בלי רווחים
$MEMBERS        = @("TODO_USER Full Name 1", "TODO_USER Full Name 2")
$BUDGET_USD     = 50
$ALERT_EMAIL    = ""                 # אופציונלי, להתראת זמינות
```

**התחברויות שהמשתמשת עושה פעם אחת בעצמה** (הן כתובות גם בתחילת `docs/USER_TODO.md`):
1. `gcloud auth login` ← מתחברת בדפדפן. אחר כך `gcloud config set project <ID>`.
2. `atlas auth login` ← מתחברת בדפדפן (אם כבר יש לה cluster ב-Atlas, מספיקה גם ההתחברות).
3. ב-No-IP: חשבון חינמי ו-hostname אחד (ל-IP שהיא תקבל ממך בשלב 5. עד אז אפשר IP זמני כלשהו).

בתחילת העבודה בדוק מה כבר מחובר (`gcloud auth list`, `gcloud config get-value project`, `atlas auth whoami`) ופעל בהתאם.

---

## 2. שלב 0: הבנת המצב הקיים (לפני שנוגעים במשהו)

1. קרא את `CLAUDE.md`, `docs/DECISIONS.md`, `docs/PROJECT_GUIDE.md`, `docs/TEST_REPORT.md` ואת **הקוד בפועל**. הפרויקט נבנה במטלה 3, וייתכן שהשמות או המבנה שונים ממה שכתוב כאן. **הקוד הקיים קובע**, ואתה מתאים את ההוראות אליו.
2. קרא את הוראות מטלה 4: `materials/FocusFlow_Assignment4.pdf` (אם הקובץ לא שם, חפש אותו בתיקייה). זה המקור הקובע.
3. `git status`, `git branch -a`, `git remote -v`, `git log --oneline -15`. אם יש remote: `git fetch` ו-`git pull` על main.
4. הרץ את בדיקות מטלה 3 (pytest, vitest) כדי לוודא שנקודת ההתחלה ירוקה. אם משהו אדום, תקן קודם (ב-branch נפרד) ותעד.

---

## 3. ההחלטות המומלצות (כבר התקבלו, אל תשנה בלי סיבה חזקה, ותעד את כולן)

| נושא | בחירה | למה (משפט להגנה) |
|------|-------|------------------|
| קונטיינרים | **Cloud Run**, שירות נפרד ללקוח (`rewind-frontend`) ולשרת (`rewind-backend`) | Google מנהלת שרתים, עדכונים וגדילה. תקלה באחד לא מפילה את השני, וכל אחד גדל לפי העומס שלו. VM דורש instance group, firewall ועדכונים ידניים |
| מסד נתונים | **MongoDB Atlas M0 (חינמי)** על GCP | הקוד כבר עובד עם MongoDB, אז לא משנים שורת קוד. מנוהל, עם גיבוי, וחינמי. Cloud SQL עולה כסף כל שעה ודורש מעבר ל-SQL. מסד על VM מחייב לנהל דיסק, גיבוי ועדכונים |
| Region | **`europe-west1` (בלגיה)** לשירותים **וגם** ל-cluster של Atlas (בדוק ש-M0 זמין שם על GCP. אם לא, בחר את ה-region הקרוב ביותר שבו M0 על GCP זמין, ושם את Cloud Run באותו region) | השרת והמסד באותו אזור = latency נמוך. ה-LB הגלובלי מגיש מהקצה הקרוב למשתמשת |
| מופעים | backend: **min 2**, max 5. frontend: **min 1**, max 5. 512Mi / 1 vCPU לשרת, 256Mi ללקוח | ההוראות ממליצות לפחות 2 מופעים מאחורי ה-LB כדי שבאמת יאזן. מינימום מונע cold start בזמן הבדיקה. העלות קטנה מהקרדיט (חשב והכנס ל-DECISIONS) |
| תמונות | **Artifact Registry** באותו region (`<region>-docker.pkg.dev/<project>/rewind/...`), **אותן תמונות** של מטלה 3 (אותו Dockerfile ואותו קוד) עם tag חדש `1.1.0`, ובנייה ל-`linux/amd64` | פרטי, מהיר ובאותו אזור. Docker Hub נשאר למטלה 3 |
| ניתוב | **Global External Application Load Balancer** (`EXTERNAL_MANAGED`) עם 2 Serverless NEGs. URL map: ברירת מחדל ← לקוח. `/api`, `/api/*`, `/health` ← שרת | כתובת אחת ודומיין אחד, בלי CORS. הלקוח פונה ל-`/api` יחסי |
| HTTPS | **Google-managed SSL certificate** לדומיין + **הפניית HTTP→HTTPS** (forwarding rule על 80 עם redirect) | המצלמה (`getUserMedia`) עובדת רק ב-HTTPS. ההפניה מגינה על מי שמקליד `http://` |
| גישה ישירה לשירותים | `--ingress=internal-and-cloud-load-balancing` + `--allow-unauthenticated` | כל התעבורה עוברת רק דרך ה-LB וה-HTTPS. כתובות `run.app` הישירות חסומות מבחוץ |
| דומיין | **No-IP** (hostname חינמי), רשומת **A אחת בלבד** ל-IP הסטטי של ה-LB | חינמי ופשוט. לזכור לאשר כל 30 יום |
| סודות | Secret Manager: `MONGODB_URI`, `JWT_SECRET` (ו-`GEMINI_API_KEY` רק אם קיים מפתח). Service Account ייעודי לשרת עם `roles/secretmanager.secretAccessor` **רק על הסודות האלה** | least privilege. הקוד לא משתנה, רק המקור של משתני הסביבה |
| Atlas Network Access | `0.0.0.0/0` + משתמש DB ייעודי עם סיסמה אקראית ארוכה (32+ תווים) והרשאת `readWrite` על DB `rewind` בלבד + TLS (מובנה ב-`mongodb+srv`) | ל-Cloud Run אין IP יציאה קבוע. IP קבוע מחייב VPC + Cloud NAT, שעולים כסף. מתעדים את הפשרה ואת ההגנות שמפצות עליה |
| זמינות | **Uptime check** של Cloud Monitoring על `https://DOMAIN/health` (כל 5 דקות) + התראה במייל אם הוגדר | לדעת מיד אם האתר נפל בחלון הבדיקה |
| עלות | **Budget** של 50$ עם התראות ב-50%, 90% ו-100% | חובה בהוראות. מראה כמה מהקרדיט נוצל |

---

## 4. שלב 1: התאמת הקוד לענן (branch: `a4/cloud-ready`)

המטרה: **אותן תמונות** רצות גם ב-docker compose (מטלה 3) וגם ב-Cloud Run (מטלה 4), בלי לשבור כלום.

### 4.1 פורטים
- **Cloud Run מגדיר `PORT`** ומצפה שהקונטיינר יאזין עליו. לפי ההוראות: 3000 ללקוח ו-8000 לשרת.
- **שרת:** `uvicorn ... --port ${PORT:-8000}` (דרך `sh -c` ב-CMD או entrypoint), ו-`--proxy-headers --forwarded-allow-ips="*"` (כי ה-LB שולח `X-Forwarded-For` ו-`X-Forwarded-Proto`).
- **לקוח:** nginx מאזין על `${PORT}` עם `ENV PORT=3000` ב-Dockerfile (במקום 80). עדכן את docker-compose של מטלה 3 ל-`"3000:3000"`.

### 4.2 nginx בלי backend (באג שחייבים למנוע!)
ב-compose, nginx של הלקוח עושה proxy ל-`http://backend:8000`. **ב-Cloud Run אין host בשם `backend`, ו-nginx לא עולה בכלל אם `proxy_pass` מצביע על host שלא קיים.** בענן ה-LB מנתב את `/api` ישירות לשרת, כך שה-proxy מיותר שם.
- פתרון: entrypoint script (`/docker-entrypoint.d/40-api-proxy.sh`) שמייצר את בלוק `location /api/` ו-`location = /health` **רק אם `BACKEND_URL` לא ריק**. ב-compose `BACKEND_URL=http://backend:8000`, וב-Cloud Run ריק.
- ודא שהלקוח פונה תמיד ל-`/api/...` **יחסי** (בלי `localhost:8000` בשום מקום בקוד הבנוי). `grep` על `dist/` לווידוא.

### 4.3 שרת stateless (קריטי לשני מופעים)
- **`JWT_SECRET` חובה בענן:** אם `ENV=production` ו-`JWT_SECRET` חסר, השרת נכשל בעלייה עם הודעה ברורה (בלי ליצור סוד אקראי). אחרת כל מופע חותם בסוד אחר, וטוקן ממופע אחד נדחה במופע השני: התחברות "קופצת" אקראית.
- ודא שאין שום state בזיכרון: הגבלת ניסיונות התחברות, טוקנים מבוטלים וסשנים כבר במונגו (בדוק בקוד). אם משהו בזיכרון, העבר למונגו.
- IP לקוח להגבלת ניסיונות: מ-`X-Forwarded-For` (הערך הראשון, אחרי proxy-headers).
- חיבור למונגו: `serverSelectionTimeoutMS=5000`, ו-`/health` מחזיר 200 רק כשה-ping למונגו מצליח.
- `/docs` ו-`/openapi.json`: בענן תחת `/api/docs` (או כבוי ב-production). לא חובה, תעד את הבחירה.

### 4.4 אבטחה ו-HTTPS
- nginx: `Strict-Transport-Security: max-age=31536000` (רק כשהבקשה הגיעה ב-HTTPS: `X-Forwarded-Proto`). ה-CSP הקיים (`connect-src 'self'`) מתאים כי הכול באותו דומיין. ודא שהוא עדיין מאפשר YouTube, wasm ו-mediapipe.
- CORS בשרת: `ALLOWED_ORIGINS=https://DOMAIN` בענן (בפועל לא נדרש באותו origin, אבל לא להשאיר `*`).

### 4.5 בדיקות
- pytest ו-vitest ירוקים.
- `docker compose -f docker-compose.dev.yml up --build`: האתר עובד ב-localhost:3000 **כמו קודם** (מטלה 3 לא נשברה).
- הרצת קונטיינר הלקוח לבד עם `-e PORT=3000 -e BACKEND_URL=` ← nginx עולה ומגיש את האתר (מדמה Cloud Run).
- הרצת השרת עם `ENV=production` בלי `JWT_SECRET` ← נכשל עם הודעה ברורה.
- commit ← push ← merge ל-main (סעיף 9).

---

## 5. שלב 2: פריסה לענן (branch: `a4/deploy`)

כתוב `deploy/deploy.ps1`: **סקריפט אחד, אידמפוטנטי** (כל משאב נבדק קודם ב-`describe`, ונוצר או מתעדכן רק אם צריך), שאפשר להריץ שוב בבטחה, עם הדפסה ברורה של כל שלב. בנוסף: `deploy/redeploy.ps1` (רק build, push ו-deploy של גרסה חדשה), `deploy/status.ps1` (מצב התעודה, ה-DNS, השירותים ו-/health) ו-`deploy/teardown.ps1` (מחיקה מסודרת, **לא מורץ** אלא מוכן לאחרי הבדיקה).

### 5.1 הכנה
```powershell
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com `
  compute.googleapis.com monitoring.googleapis.com billingbudgets.googleapis.com cloudresourcemanager.googleapis.com
gcloud artifacts repositories create rewind --repository-format=docker --location=$REGION
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
```

### 5.2 MongoDB Atlas (עם Atlas CLI אם יש התחברות)
- project בשם `rewind`, cluster M0 על GCP באותו region, משתמש `rewind-app` עם סיסמה אקראית (נוצרת ב-PowerShell עם `[System.Security.Cryptography.RandomNumberGenerator]`, אלפאנומרית, 32 תווים), access list `0.0.0.0/0`.
- את ה-URI המלא (`mongodb+srv://rewind-app:<pass>@.../rewind?retryWrites=true&w=majority`) **לא מדפיסים**. כותבים לקובץ זמני מחוץ לריפו (`$env:TEMP`), יוצרים ממנו את הסוד, ו**מוחקים את הקובץ**.
- **אם אין התחברות ל-Atlas:** הכן הוראות ידניות קצרות ב-USER_TODO (יצירת M0, משתמש, `0.0.0.0/0`, העתקת URI), ובקש שה-URI יישמר בקובץ `deploy/.secrets/mongodb_uri.txt` (**ב-.gitignore**). כשהקובץ קיים, `deploy.ps1` יוצר ממנו את הסוד ומוחק אותו.

### 5.3 סודות
```powershell
# כתיבה בלי שורה חדשה בסוף (חשוב! PowerShell מוסיף newline כברירת מחדל)
[IO.File]::WriteAllText($tmp, $value)
gcloud secrets create MONGODB_URI --replication-policy=automatic --data-file=$tmp   # או versions add אם קיים
```
- `JWT_SECRET`: 64 תווי hex אקראיים, נוצר פעם אחת. **לא לייצר מחדש בכל ריצה** (זה ינתק את כל המשתמשים): אם הסוד קיים, לא לגעת בו.
- `GEMINI_API_KEY`: רק אם קיים מפתח. אחרת לא יוצרים, והאתר נכשל בנימוס כמו במטלה 3.
- Service Account: `rewind-backend@$GCP_PROJECT_ID.iam.gserviceaccount.com` + `secretAccessor` **על כל סוד בנפרד** (`gcloud secrets add-iam-policy-binding`). ללקוח SA נפרד `rewind-frontend` בלי שום הרשאה.

### 5.4 תמונות
```powershell
docker buildx build --platform linux/amd64 -t "$AR/backend:1.1.0" --push ./backend
docker buildx build --platform linux/amd64 -t "$AR/frontend:1.1.0" --push ./frontend
```
(הכנת נכסים קודם: המודל ו-MediaPipe, כמו במטלה 3.) **דחוף את אותן גרסאות גם ל-Docker Hub** ועדכן את `docker-compose.yml` של מטלה 3 ל-`1.1.0` (ראו סעיף 8).

### 5.5 Cloud Run
```powershell
gcloud run deploy rewind-backend --image "$AR/backend:1.1.0" --region $REGION --port 8000 `
  --service-account "rewind-backend@$GCP_PROJECT_ID.iam.gserviceaccount.com" `
  --set-secrets "MONGODB_URI=MONGODB_URI:latest,JWT_SECRET=JWT_SECRET:latest" `
  --set-env-vars "ENV=production,DB_NAME=rewind,ALLOWED_ORIGINS=https://$DOMAIN" `
  --ingress internal-and-cloud-load-balancing --allow-unauthenticated `
  --min-instances 2 --max-instances 5 --memory 512Mi --cpu 1

gcloud run deploy rewind-frontend --image "$AR/frontend:1.1.0" --region $REGION --port 3000 `
  --service-account "rewind-frontend@$GCP_PROJECT_ID.iam.gserviceaccount.com" `
  --set-env-vars "BACKEND_URL=" `
  --ingress internal-and-cloud-load-balancing --allow-unauthenticated `
  --min-instances 1 --max-instances 5 --memory 256Mi --cpu 1
```
אם `--allow-unauthenticated` נכשל בגלל מדיניות ארגון, תעד ונסה `gcloud run services add-iam-policy-binding ... --member=allUsers --role=roles/run.invoker`.

### 5.6 Load Balancer (לפי המדריך הרשמי של Google ל-LB מול Cloud Run)
1. `gcloud compute addresses create rewind-ip --global` ← **שמור והדפס את ה-IP בגדול.**
2. Serverless NEG לכל שירות (`--network-endpoint-type=serverless --cloud-run-service=... --region=$REGION`).
3. Backend service גלובלי לכל אחד (`--load-balancing-scheme=EXTERNAL_MANAGED`) + `add-backend` עם ה-NEG. **בלי health check** (Serverless NEG לא תומך, ולכן גם לא צריך firewall).
4. URL map: `--default-service=rewind-frontend-bs`, ואז path matcher: `/api=rewind-backend-bs,/api/*=rewind-backend-bs,/health=rewind-backend-bs` (העדפה: ייבוא URL map מקובץ YAML ב-`deploy/urlmap.yaml`, שהוא קריא וקל להסבר).
5. `gcloud compute ssl-certificates create rewind-cert --domains=$DOMAIN --global`
6. `target-https-proxies create` (url-map + cert) ← `forwarding-rules create` גלובלי על **443** עם ה-IP הסטטי ו-`EXTERNAL_MANAGED`.
7. **HTTP→HTTPS:** URL map נוסף `rewind-http-redirect` עם `defaultUrlRedirect: {httpsRedirect: true, redirectResponseCode: MOVED_PERMANENTLY_DEFAULT}` ← `target-http-proxies` ← forwarding rule על **80** עם **אותו IP**.

### 5.7 דומיין ותעודה: בלי לעצור
- אחרי שלב 1 ב-5.6: הדפס בולט וכתוב בראש USER_TODO:
  `>>> ב-No-IP: עדכני את ה-hostname <DOMAIN> לרשומת A אחת בלבד עם ה-IP: x.x.x.x <<<`
- המשך לבנות את כל השאר. בסוף: `deploy/status.ps1` בודק ב-polling (כל 2 דקות, עד 60 דקות) את `Resolve-DnsName $DOMAIN` ואת `gcloud compute ssl-certificates describe rewind-cert --global --format="value(managed.status,managed.domainStatus)"`. בינתיים כתוב את התיעוד (סעיף 10), ואל תחכה בחוסר מעש.
- `PROVISIONING` תקין בהתחלה (עד 60 דקות ועוד זמן DNS). `FAILED_NOT_VISIBLE` = רשומת ה-A לא מצביעה על ה-IP. כתוב את זה ב-USER_TODO עם מה לבדוק.

### 5.8 Budget ו-Uptime
- `gcloud billing accounts list` ← `gcloud billing budgets create --billing-account=... --display-name="rewind-budget" --budget-amount=${BUDGET_USD}USD --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0`. אם אין הרשאה, הוראות ידניות ב-USER_TODO.
- Uptime check על `https://$DOMAIN/health` (`gcloud monitoring uptime create`, בדוק את התחביר ב-`--help`). אם יש `$ALERT_EMAIL`, notification channel ו-alert policy.

---

## 6. סודות: רשימת ביקורת (חובה, מהווה חלק מהציון)
- [ ] `MONGODB_URI`, `JWT_SECRET` (ו-`GEMINI_API_KEY` אם יש) **רק** ב-Secret Manager, מחוברים דרך `--set-secrets` (Reference a secret).
- [ ] ה-Service Account של השרת עם `Secret Manager Secret Accessor` רק על הסודות שלו.
- [ ] `ENV`, `DB_NAME` ו-`ALLOWED_ORIGINS` הם הגדרות ולא סודות, ולכן משתני סביבה רגילים.
- [ ] סריקה לפני כל commit ובסוף העבודה: `git grep -n -I -E "mongodb\+srv://[^<]|AIza[0-9A-Za-z_-]{20,}|JWT_SECRET=[0-9a-f]{32,}"` ← אסור שיחזיר תוצאות (חוץ מ-`.env` המקומי של מטלה 3, שהוא ב-.gitignore). בדוק גם `docker history` ושאין `.env` בתמונות (`.dockerignore`).
- [ ] `deploy/.secrets/`, `*.secret`, `*.key` ו-`.env` ב-`.gitignore`.
- [ ] אם סוד דלף בטעות: מחליפים מיד (גרסה חדשה ב-Secret Manager + סיסמה חדשה ב-Atlas) ומתעדים.

---

## 7. שלב 3: בדיקה מקצה לקצה בענן (תואם לטבלת הבדיקה של מטלה 4)

`deploy/verify.ps1` + Playwright מול `BASE_URL=https://$DOMAIN`. תוצאות ל-`docs/A4_TEST_REPORT.md` עם ✅/⚠️/❌:

| # | נושא | בדיקה |
|---|------|-------|
| 1 | דומיין ו-HTTPS | `https://DOMAIN` נפתח, התעודה תקינה (`Invoke-WebRequest` בלי לעקוף TLS), ו-`http://` מפנה ל-`https://` (301) |
| 2 | השרת | `https://DOMAIN/health` מחזיר 200 `{"status":"ok"}` |
| 3 | האתר | E2E של מטלה 3 במלואו מול הדומיין: הרשמה, התחברות, הוספת YouTube, סשן עם מצלמה מזויפת, ציון, היסטוריה, הפרדה בין משתמשים, התנתקות |
| 4 | נתונים נשמרים | אחרי רענון, התנתקות והתחברות מחדש, התוכן וההיסטוריה עדיין שם. **בנוסף:** 20 בקשות `GET /api/users/me` ברצף עם אותו טוקן, וכולן 200 (מוכיח ששני המופעים חולקים את אותו JWT_SECRET ואת אותו מסד) |
| 5 | זמינות | Uptime check פעיל וירוק. ה-min-instances מוגדרים |
| + | בידוד | כתובות `*.run.app` הישירות מחזירות 404/403 מבחוץ (ingress) |
| + | סודות | הסריקה בסעיף 6 נקייה |

אם הדומיין עוד לא מוכן (תעודה ב-PROVISIONING): הרץ את הבדיקות מול IP עם `curl --resolve` / `-k` רק לצורך אבחון, סמן ⚠️ "ממתין לתעודה", ותעד ב-USER_TODO את הפקודה להרצה חוזרת: `.\deploy\verify.ps1`.

---

## 8. אל תשכח את מטלה 3
- התמונות ב-Docker Hub מתעדכנות ל-`1.1.0` (אותו קוד שרץ בענן).
- `docker-compose.yml` של ההגשה: tag `1.1.0` ופורט לקוח `"3000:3000"` (אחרי השינוי בסעיף 4.1).
- בנה מחדש את `submission/assignment3.zip`, ובדוק בתיקייה ריקה עם 3 הקבצים בלבד: `docker compose up` ← localhost:3000 עובד ← /health מחזיר 200.
- עדכן ב-PROJECT_INFO.docx רק את מה שהשתנה (אם השתנה).

---

## 9. Git: branches ודחיפה שוטפת (אוטומטי, בלי לשאול)

**זרימה לכל שלב:**
```powershell
git checkout main; git pull
git checkout -b a4/<name>
# ... עבודה, commit אחרי כל יחידה הגיונית ...
git push -u origin a4/<name>
```
- **Branches לפי סדר:** `a4/cloud-ready` (קוד) ← `a4/deploy` (סקריפטים ו-infra) ← `a4/docs` (תיעוד, הגשה). תיקונים שצצים בדרך: `a4/fix-<short-name>`.
- **commits קטנים ותכופים** בפורמט Conventional Commits: `feat(cloud): listen on $PORT in nginx`, `fix(auth): require JWT_SECRET in production`, `docs: cloud guide`. **push אחרי כל 2–3 commits ובסוף כל שלב**, כך שהעבודה תמיד מגובה בגיטהאב.
- **מיזוג ל-main בסוף כל שלב, רק אחרי שהבדיקות ירוקות:**
  - אם `gh` מותקן ומחובר (`gh auth status`): `gh pr create --fill --base main` ← `gh pr merge --merge --delete-branch=false`.
  - אחרת: `git checkout main; git pull; git merge --no-ff a4/<name>; git push`.
- **לפני כל commit:** הסריקה מסעיף 6. אם נמצא סוד, לא לבצע commit.
- **אם אין remote בכלל:** עבוד עם branches מקומיים כרגיל, ורשום ב-USER_TODO איך לחבר (`git remote add origin ...`, `git push -u origin --all`).
- **אם השותפה דחפה שינויים ל-main בינתיים:** `git pull` ← אם יש קונפליקט, פתור אותו כך ששני השינויים נשמרים, הרץ בדיקות, ותעד ב-DECISIONS.
- אסור `--force` על main, ואסור למחוק branches של אחרים.

---

## 10. מסמכים (בעברית)

1. **`docs/DECISIONS.md`:** המשך המספור. כל החלטה מסעיף 3 + כל מה שהחלטת בדרך + **טבלת סיכום "מטלה 4: הבחירות שלנו"** בסוף.
2. **`docs/CLOUD_GUIDE.md`: מדריך לימוד לענן**, כתוב כאילו מלמדים סטודנטית חכמה שלא ראתה את הענן:
   - תרשים המערכת בענן (Mermaid): Browser ← DNS ← LB (443/80) ← URL map ← NEGs ← Cloud Run ← Atlas, ו-Secret Manager בצד.
   - **מסע של בקשה:** מהקלדת הכתובת בדפדפן, דרך ה-DNS, התעודה, ה-LB וה-URL map, ועד המסד.
   - מילון: Cloud Run, container instance, cold start, min-instances, Load Balancer, Serverless NEG, Backend service, URL map, path rule, forwarding rule, static IP, A record, DNS, managed certificate, HTTPS/TLS, Secret Manager, Service Account, IAM role, least privilege, Artifact Registry, ingress, stateless, Atlas, access list.
   - **למה HTTPS הכרחי למצלמה** (secure context).
   - **למה stateless ולמה JWT_SECRET משותף** (הבעיה מהשיעור על LB).
   - איך מעדכנים גרסה (`redeploy.ps1`), איך בודקים מצב (`status.ps1`), מה עושים כשמשהו לא עובד (טבלה כמו בהוראות), ואיך מכבים אחרי הבדיקה (`teardown.ps1`) ומה זה יעלה להשאיר.
   - **עלויות:** טבלה עם הערכה חודשית לכל רכיב (LB forwarding rules, min instances, Artifact Registry, Atlas=0), עם קישור למחשבון.
   - **20+ שאלות הגנה ותשובות:** "למה Cloud Run ולא VM?", "למה Atlas?", "כמה מופעים ולמה?", "מה קורה אם מופע אחד נופל?", "איך שמרתם על סודות?", "למה ה-LB מנתב לפי נתיב?", "למה אין health check?", "מה זה Serverless NEG?", "למה 0.0.0.0/0 ב-Atlas ומה מפצה על זה?", "מה קורה אם ה-hostname ב-No-IP לא אושר?", "מה קורה ב-cold start?", "למה ingress מוגבל?".
3. **`docs/USER_TODO.md`:** **בראש:** מה היא חייבת לעשות עכשיו (למשל עדכון רשומת A עם ה-IP), ואז רשימה ממוספרת: אישור ה-hostname ב-No-IP כל 30 יום (תזכורת ביומן), מילוי השמות ב-JSON, הגשת הקובץ, בדיקה מהטלפון ומהמחשב של השותפה, ו**לא לשדרג את החשבון**.
4. **`docs/A4_TEST_REPORT.md`:** תוצאות סעיף 7.
5. **`docs/A4_SUMMARY.md`:** עמוד אחד: מה נבנה, הכתובת, איך זה בנוי, מה נשאר פתוח.

---

## 11. ההגשה

`submission/<PROJECT_SLUG>.json` (שם הקובץ זהה בדיוק לערך `project`):
```json
{
  "project": "rewind",
  "domain": "https://<DOMAIN>",
  "members": ["Full Name 1", "Full Name 2"]
}
```
- `domain` כולל `https://` ובלי `/` בסוף. ולידציה: JSON תקין (`ConvertFrom-Json`), שם הקובץ תואם ל-`project`.
- אם השמות לא ידועים: `TODO_USER` + שורה בראש USER_TODO.
- ההגשה היא **רק קובץ ה-JSON** (אין לנו תוסף).

---

## 12. סדר עבודה (צור task list ועבוד לפיו)
1. סעיף 2: מצב קיים, בדיקות ירוקות, git sync.
2. סעיף 4: קוד מוכן לענן, בדיקות, ובדיקה שמטלה 3 לא נשברה ← merge.
3. סעיף 5: Atlas ← סודות ← תמונות ← Cloud Run ← LB ← הודעת IP למשתמשת ← budget ו-uptime ← merge.
4. סעיף 8: עדכון מטלה 3 (Docker Hub, compose, zip).
5. סעיף 10: מסמכים, בזמן ההמתנה לתעודה.
6. סעיף 7: אימות מלא כשהתעודה ACTIVE.
7. סעיף 11: קובץ JSON ← merge אחרון ← push.

## 13. Definition of Done
- [ ] `https://DOMAIN` נפתח עם תעודה תקינה, ו-`http://` מפנה ל-HTTPS.
- [ ] `https://DOMAIN/health` מחזיר 200.
- [ ] E2E מלא עובר מול הדומיין, כולל מצלמה ושמירת נתונים אחרי התחברות מחדש.
- [ ] 2 מופעי backend לפחות, ו-20 בקשות ברצף עם אותו טוקן מצליחות.
- [ ] אין סוד בקוד, ב-Git או בתמונות. הכול ב-Secret Manager.
- [ ] Budget ו-Uptime check מוגדרים.
- [ ] `docker compose up` של מטלה 3 עדיין עובד, ו-`assignment3.zip` מעודכן.
- [ ] `submission/<slug>.json` תקין.
- [ ] DECISIONS, CLOUD_GUIDE, USER_TODO, A4_TEST_REPORT ו-A4_SUMMARY כתובים.
- [ ] הכול merged ל-main ו-pushed.

**אם משהו לא הושלם בגלל שחסרה התחברות או שהתעודה עוד לא ACTIVE:** כתוב בדיוק מה ואיך להשלים בפקודה אחת, ואל תדווח עליו כ"הושלם". בסוף הריצה הדפס סיכום קצר בטרמינל: מה הושלם, ה-IP, מצב התעודה, ומה המשתמשת צריכה לעשות.