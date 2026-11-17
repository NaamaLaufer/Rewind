# מה נשאר לך לעשות

## ⚡ מטלה 4 (ענן): מה צריך ממך עכשיו

### >>> ב-No-IP: לעדכן את `rewind.ddns.net` לרשומת A אחת בלבד עם ה-IP `8.233.237.59` <<<
No-IP ← Dynamic DNS ← Hostnames ← `rewind.ddns.net` ← Modify ← IPv4 Address: `8.233.237.59` ← Save. **רק** רשומה אחת, בלי AAAA או IP נוסף.
(ה-IP נשמר גם ב-`deploy\last-ip.txt`.) כרגע ה-hostname מצביע על `1.1.1.1`, וכל עוד זה כך התעודה לא תונפק.

**מה כבר רץ בענן** (פרויקט `rewind-515021`, europe-west1):
- Cloud Run: `rewind-backend` (2–5 מופעים) ו-`rewind-frontend` (1–5), נגישים רק דרך ה-LB.
- Atlas M0 `rewind`, וסודות ב-Secret Manager.
- LB עם IP סטטי, URL map ו-redirect מ-http, ותעודה מנוהלת (ממתינה ל-DNS).
- Budget של 200 ILS, Uptime check, והתראה במייל.

**אחרי העדכון ב-No-IP** (אם אני כבר לא רץ ב-polling):
```powershell
powershell -ExecutionPolicy Bypass -File deploy\status.ps1 -Wait     # עד שהתעודה ACTIVE (עד 60 דק')
powershell -ExecutionPolicy Bypass -File deploy\verify.ps1           # בדיקה מלאה + E2E מול https://rewind.ddns.net
powershell -ExecutionPolicy Bypass -File deploy\make-submission.ps1  # submission\rewind.json
```
`FAILED_NOT_VISIBLE` = רשומת ה-A עוד לא `8.233.237.59`. Google מנסה שוב לבד.

**ואז:**
1. להגיש את `submission\rewind.json` (רק אותו).
2. **לאשר את ה-hostname ב-No-IP כל 30 יום**: המייל מ-No-IP מגיע לפני שהוא פג. לשים תזכורת ביומן.
3. לבדוק את האתר מהטלפון ומהמחשב של תמר, עם מצלמה אמיתית.
4. **לא לשדרג את חשבון ה-Free Trial.**
5. אחרי שהציון התקבל: `deploy\teardown.ps1 -Yes` (אחרת זה כ-200 ILS לחודש מהקרדיט). צריך את האתר שוב לפרויקט הסופי: `deploy\deploy.ps1` מרים הכול מחדש (ה-IP ישתנה, ואז מעדכנים שוב ב-No-IP).
6. מטלה 3: ב-PROJECT_INFO חסרים עדיין אימיילי ה-grunitech (`authors`): `./scripts/package_submission.sh --authors "a@grunitech.com,b@grunitech.com"` (ב-Git Bash).

---

# מטלה 3

כל השאר כבר בנוי ונבדק (ראו `docs/TEST_REPORT.md`). נשארו רק דברים שצריכים את הפרטים או את החשבונות שלכן.
הפקודות כתובות ל-**Git Bash** (ב-Windows) או לטרמינל ב-Mac/Linux, מתוך תיקיית הפרויקט `rewind/`.

## 1. ✅ בוצע (18.11.2026): התמונות ב-Docker Hub
`naamalaufer/rewind-backend:1.1.0` ו-`naamalaufer/rewind-frontend:1.1.0` ציבוריות (נבדקה משיכה בלי התחברות), `docker-compose.yml` מעודכן, ו-`assignment3.zip` נבנה מחדש ונבדק בתיקייה ריקה. לגרסה חדשה בעתיד:
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
