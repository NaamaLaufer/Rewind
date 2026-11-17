# מה נשאר לך לעשות

## ⚡ מטלה 4 (ענן): מה צריך ממך עכשיו, לפי הסדר

כל הקוד, הסקריפטים והמסמכים מוכנים ונבדקו מקומית. **שום דבר עוד לא נוצר בענן**, כי בסשן הזה אף אחד מהחשבונות לא היה מחובר, ופרטי הפרויקט (מזהה GCP, דומיין, שמות) היו ריקים. כל השלבים כאן ב-**PowerShell**, מתוך תיקיית הפרויקט.

**0. כלים (כבר מותקנים במחשב הזה).** בטרמינל חדש: `. .\deploy\tools-path.ps1`, או לפתוח טרמינל חדש אחרי ההתקנה של winget.

**1. למלא את `deploy\config.ps1`** (בלי סודות; הקובץ נכנס ל-Git):
   - `$GCP_PROJECT_ID`: ה-**ID** של הפרויקט ב-Google Cloud (לא השם).
   - `$DOMAIN`: ה-hostname מ-No-IP (למשל `rewind-naama.ddns.net`). ב-No-IP: חשבון חינמי ← Create Hostname ← בינתיים כל IP.
   - `$MEMBERS`: השמות המלאים באנגלית.
   - אופציונלי: `$DOCKERHUB_USER` (כדי לדחוף את 1.1.0 גם ל-Docker Hub), `$ALERT_EMAIL`.

**2. התחברויות (בדפדפן, פעם אחת):**
```powershell
gcloud auth login
gcloud config set project <GCP_PROJECT_ID>
atlas auth login        # אם אין, ראו "Atlas בלי CLI" למטה
docker login            # רק אם מילאת $DOCKERHUB_USER
gh auth login           # רשות: כדי שה-merge יעבור דרך Pull Requests
```

**3. להריץ את הפריסה:**
```powershell
powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1
```
הסקריפט אידמפוטנטי: אם הוא נעצר באמצע, מתקנים ומריצים שוב. הוא ידפיס בגדול את ה-IP הסטטי.

**4. >>> ב-No-IP: לעדכן את ה-hostname לרשומת A אחת בלבד עם ה-IP שהודפס <<<**
(ה-IP נשמר גם ב-`deploy\last-ip.txt`.)

**5. לחכות לתעודה** (עד 60 דקות אחרי שה-DNS מצביע נכון):
```powershell
powershell -ExecutionPolicy Bypass -File deploy\status.ps1 -Wait
```
`FAILED_NOT_VISIBLE` = רשומת ה-A לא מצביעה על ה-IP. בודקים ב-No-IP שיש **רק** רשומה אחת, עם ה-IP הנכון, ו-Google ינסה שוב לבד.

**6. אימות מלא:**
```powershell
powershell -ExecutionPolicy Bypass -File deploy\verify.ps1
```
התוצאות נכתבות ל-`docs\A4_VERIFY_RESULTS.md`. (בזמן שהתעודה עוד ב-PROVISIONING, לאבחון בלבד: `verify.ps1 -ViaIp`.)

**7. קובץ ההגשה:**
```powershell
powershell -ExecutionPolicy Bypass -File deploy\make-submission.ps1
```
← מגישים **רק** את `submission\rewind.json`.

**8. אחר כך:**
- **לאשר את ה-hostname ב-No-IP כל 30 יום.** לשים תזכורת ביומן, אחרת האתר נופל.
- לבדוק את האתר מהטלפון ומהמחשב של השותפה, עם מצלמה אמיתית.
- **לא לשדרג את חשבון ה-Free Trial (Upgrade).**
- אחרי שהציון התקבל: `deploy\teardown.ps1 -Yes` (אחרת זה כ-40–50$ לחודש מהקרדיט).

### Atlas בלי CLI (אם `atlas auth login` לא מתאים)
1. https://cloud.mongodb.com ← New Project `rewind` ← Create cluster: **M0 (Free)**, Provider **Google Cloud**, Region **Belgium (europe-west1)**, שם `rewind`.
2. Database Access ← Add user `rewind-app`, Password: Autogenerate (32+ תווים), Role: **readWrite** על DB `rewind` בלבד (Specific Privileges).
3. Network Access ← Add IP Address ← `0.0.0.0/0` (ל-Cloud Run אין IP קבוע; ראו DECISIONS D-062).
4. Connect ← Drivers ← להעתיק את ה-URI, להחליף `<db_password>`, ולהוסיף `/rewind` לפני ה-`?`.
5. לשמור את ה-URI **בקובץ** `deploy\.secrets\mongodb_uri.txt`. התיקייה ב-.gitignore. **לא להדביק בצ'אט.**
6. `deploy\deploy.ps1`: הסקריפט יוצר מהקובץ את הסוד ב-Secret Manager **ומוחק את הקובץ**.

### מה נבדק בלי ענן, ומה עוד לא
ראו `docs\A4_TEST_REPORT.md`: הקוד המוכן לענן, אותה תמונה בשני מצבים, ה-DryRun של הסקריפטים, וה-E2E של מטלה 3 מול compose ומול תיקייה ריקה, כולם ירוקים. **כל בדיקות הענן עצמן (דומיין, תעודה, 2 מופעים, uptime) עוד לא רצו.**

---

# מטלה 3

כל השאר כבר בנוי ונבדק (ראו `docs/TEST_REPORT.md`). נשארו רק דברים שצריכים את הפרטים או את החשבונות שלכן.
הפקודות כתובות ל-**Git Bash** (ב-Windows) או לטרמינל ב-Mac/Linux, מתוך תיקיית הפרויקט `rewind/`.

## 1. להעלות את התמונות ל-Docker Hub (חובה, בלי זה הבודק לא יכול להריץ)
```bash
docker login                                   # עם המשתמש של Docker Hub
DOCKERHUB_USER=<שם-המשתמש-שלך> ./scripts/build_and_push.sh   # tag 1.1.0 (אותו קוד שרץ בענן)
```
הסקריפט מעתיק את המודל לתוך תיקיית הלקוח, בונה את שתי התמונות ל-`linux/amd64`, דוחף אותן, **ומחליף את `TODO_USER` בשם שלך בתוך `docker-compose.yml`**.
אחר כך יש להיכנס ל-https://hub.docker.com, לפתוח את `rewind-backend` ואת `rewind-frontend` ולוודא שהן **Public** (Settings ← Visibility).

## 2. לבנות את קובץ ההגשה, עם האימיילים שלכן
```bash
./scripts/package_submission.sh --authors name1@grunitech.com,name2@grunitech.com
```
- האימיילים מופרדים בפסיק, **בלי רווחים**.
- התוצאה: `submission/assignment3.zip` עם שלושה קבצים בשורש: `docker-compose.yml`, `.env` ו-`PROJECT_INFO.docx`.
- הסקריפט מזהיר אם נשאר `TODO_USER` או אם `GEMINI_API_KEY` לא ריק.
- **אם יש לכן את קובץ ה-docx המקורי של התבנית** (יש לנו רק את ה-PDF, ולכן שיחזרנו את המבנה): שמרו אותו כ-`materials/PROJECT_INFO.docx` והריצו
  `docker run --rm -v "$PWD:/w" -w /w python:3.12-slim sh -c "pip install -q python-docx==1.2.0 && python scripts/make_project_info.py --template materials/PROJECT_INFO.docx --authors ..."`
  ואז שוב את `package_submission.sh`. התשובות ייכנסו לעמודה האחרונה של התבנית המקורית.

## 3. בדיקה אחרונה, כמו הבודק
1. ליצור תיקייה ריקה (למשל על שולחן העבודה) ולחלץ אליה **רק** את `assignment3.zip`.
2. לעצור את הגרסה של הפיתוח, אם היא רצה: `docker compose -f docker-compose.dev.yml down`.
3. בתיקייה החדשה: `docker compose up`. התמונות צריכות להימשך מ-Docker Hub (זה מוכיח שהן ציבוריות).
4. לפתוח http://localhost:3000 ולעבור על האתר כמו משתמשת חדשה: הרשמה, התחברות, הוספת הסרטון מתוך PROJECT_INFO, "התחלת סשן", "הפעלת מצלמה", לחכות לציון, "סיום סשן", היסטוריה, משתמשת שנייה, "לא נמצא", התנתקות.
5. **עם מצלמה אמיתית**, ואם אפשר גם עם **OBS Virtual Camera**: בוחרים אותה ב"בחירת מצלמה". שבו מול **מרכז** המצלמה (המודל נותן ציון נמוך יותר לפנים בצד הפריים).
6. לוודא שהסרטון לדוגמה (https://www.youtube.com/watch?v=aircAruvnKk) נפתח בנגן באתר. אם לא, להחליף אותו ב-`scripts/make_project_info.py` (השדה `YT`) ולבנות שוב את ההגשה.

### אם מופיע "לא זוהו פנים" למרות שרואים אותך בתצוגה המקדימה
מוסיפים לכתובת של עמוד הפריט `?debug=1` (למשל `http://localhost:3000/content/<מזהה>?debug=1`), לוחצים "התחלת סשן" ו"הפעלת מצלמה", וגוללים בפאנל השמאלי ל"פאנל דיבאג".
הפאנל מראה כמה פנים זוהו, את הביטחון, הרזולוציה, המצלמה, הבהירות והשגיאה האחרונה, ומתחת לכל אלה **הסבר מה כנראה הבעיה**.
**כשזה קורה: ללחוץ על "📋 העתקת אבחון" ולהדביק את ה-JSON בהודעה** (D-051). הוא אומר בדיוק מה קרה: האם הווידאו היה מוכן, כמה פריימים נותחו, כמה פנים נמצאו, מה הבהירות של מה ש-MediaPipe קיבל, ואיזו שגיאה הייתה. להשוואה אפשר ללחוץ גם על `input=video` או `gpu=1`, ולהעתיק אבחון גם משם.

### לבדוק את ההתערבות החכמה עם המצלמה שלך (D-045 עד D-047)
עם `?debug=1`:
1. **לשבת מרוכזת מול המסך כ-45 שניות.** תחת הציון אמורה להופיע השורה "כיול אישי: הרמה הרגילה שלך 0.xx · התראה מתחת ל-0.yy". אם יש התראה כשאת מרוכזת, לשלוח את השורות "ציון גולמי / מוחלק" ו"כיול".
2. **להסתכל הצידה (לסובב את הראש) יותר מ-4 שניות.** אמור להופיע באנר "⚠️ הקשב שלך ירד" + "נראה שאת מסתכלת הצידה". בפאנל, בשורה "תנוחת ראש yaw / pitch", המספר צריך לזוז ביותר מ-30° מה"רגיל". אם לא, לשלוח את השורה הזו כשאת מסתכלת הצידה ובזמן שאת מסתכלת ישר.
3. **לעצום עיניים יותר מ-4 שניות:** אותו באנר, עם "נראה שהעיניים שלך עצומות". בשורה "עיניים (EAR)" רואים את המספר.
4. **לצאת מהמצלמה יותר מ-5 שניות** בזמן שהסרטון מתנגן: ההודעה הצהובה, בלי באנר, ו"חוב קשב" גדל.
הספים נמצאים ב-`frontend/src/focus/smoothing.js` וב-`frontend/src/focus/gaze.js` (ראו PROJECT_GUIDE פרק 8).

## 4. להגיש
את `submission/assignment3.zip`.

## 5. מה לא נבדק אצלנו (כדאי לבדוק בעצמכן אם יש זמן)
- מצלמה אמיתית ו-OBS (נבדק רק עם המצלמה המזויפת של Chrome), כולל הכיול האישי וזיהוי מבט הצידה (ראו למעלה).
- Firefox, Safari וטלפון אמיתי (נבדק Chromium, כולל רוחב 375px).
- Gemini עם מפתח אמיתי (רשות: שמים מפתח ב-`.env` **המקומי** בלבד ומפעילים מחדש. **בהגשה המפתח נשאר ריק!**).

## 6. להגנה על הפרויקט
לקרוא את `docs/PROJECT_GUIDE.md`, ובמיוחד את פרק 9 (שאלות צפויות), ואת `docs/DECISIONS.md`, ובמיוחד את D-029 (למה v4_7) ואת D-030 (למה CPU).
