# Play Console checklist: BizSwap Gurgaon V1.0 closed test

Follow this top to bottom inside WildCatter's Play Console, in your 7-day access window. Text to paste comes from `/store`. Allow about 2 hours of clicking for steps 1–6.

> **Timeline.** Google requires **at least 12 testers opted in for 14 days in a row** before you can apply for production access. Get the closed test live and the testers opted in **on day 1 or 2** of the access window, because the 14 days only start once they're in. The production application (step 11) can be submitted later by anyone at WildCatter with access.

---

## 0. Before you start (on your machine)
- [ ] **Confirm the package ID** with WildCatter (e.g. `com.wildcatterventures.bizswap`). It **can never be changed** after the first upload.
- [ ] Put it in `app.config.ts` (`PACKAGE_ID = ... || 'com.wildcatterventures.bizswap'`), commit, then run `npm run build:aab`. This takes about 15–30 minutes on the EAS free queue. Download the `.aab` from the EAS build page.
- [ ] Check the build page shows **Version 1.0 (1)**.

## 1. Create the app
**Home → Create app**
| Field | Value |
|---|---|
| App name | `BizSwap Gurgaon` |
| Default language | English (India) – en-IN (or English (United States)) |
| App or game | App |
| Free or paid | Free (can't be changed to paid later) |
| Declarations | Tick both (Developer Program Policies, US export laws) |

## 2. Set up your app: "App content" (left menu → Policy → App content)
Do every card on this page. Each one says "Start", and you're done when all of them show a green tick.

### 2.1 Privacy policy
`https://jay0085-cdr.github.io/bizswap-gurgaon/privacy/`

### 2.2 App access
Choose **"All functionality in my app is available without any access restrictions"**. There's no login, and an anonymous account is created automatically.

### 2.3 Ads
**No, my app does not contain ads.**

### 2.4 Content rating (IARC questionnaire)
- Email: `jayvasani8112005@gmail.com` · Category: **All other app types** (it's not a game, social or communication app).
- Violence: No · Sexuality: No · Language: No · Controlled substances: **Yes, references only.** Pubs and bars appear as businesses for sale. There's no depiction or promotion of drinking, and no alcohol is sold in the app.
- Gambling or simulated gambling: No · Users can interact or exchange content: **No.** There's no free chat between users; listings are anonymised and contact details are shared only by explicit opt-in. Shares location with other users: No · Digital purchases: No · Unrestricted internet browsing: No.
- Expected result: **Everyone / 3+**, possibly 12+ because of the alcohol reference. Either is fine.

### 2.5 Target audience and content
- Target age: **18 and over** only.
- "Could your store listing unintentionally appeal to children?" **No.**

### 2.6 News app
**No.**

### 2.7 Data safety
Copy the table in `store/listing-en.md → Data safety form`. Click through like this:
1. **Does your app collect or share any of the required user data types?** Yes.
2. **Is all of the user data collected by your app encrypted in transit?** Yes.
3. **Do you provide a way for users to request that their data is deleted?** Yes. In-app via Settings → Delete my data, and also by email.
4. **Data types.** Tick only these:
   - Personal info → **Email address**, **Phone number**: Collected, not shared, **optional**. Purposes: App functionality, Developer communications.
   - App activity → **App interactions**, **In-app search history**, **Other user-generated content**: Collected, not shared, required. Purposes: App functionality, Analytics.
   - App info and performance → **Crash logs**, **Diagnostics**: Collected, not shared, required. Purpose: App functionality. These cover in-app error reports and tester feedback.
   - Device or other IDs → **Device or other IDs**: Collected, not shared, required. Purpose: App functionality. This is a random install ID, not the advertising ID.
   - **Don't tick** Audio (speech is transcribed on the device) or Location.
5. "Is this data processed ephemerally?" No, for all of the above.

### 2.8 Government apps
**No.**

### 2.9 Financial features
**My app doesn't provide any financial features.**

### 2.10 Health
**My app does not have any health features.** Doctor clinics are only listed as businesses.

### 2.11 Advertising ID
**No.** The app doesn't use the advertising ID.

## 3. Store listing (left menu → Grow users → Store presence → Main store listing)
| Field | Paste from |
|---|---|
| App name | `BizSwap Gurgaon` |
| Short description | `store/listing-en.md` → Short description |
| Full description | `store/listing-en.md` → Full description (everything inside the code block) |
| App icon | `store/icon-512.png` |
| Feature graphic | `store/feature-graphic-1024x500.png` |
| Phone screenshots | All 8 files in `store/screenshots/play/` (upload them in filename order) |
| Tablet screenshots | Leave empty. The app is phone-only. |

**Store settings** (same section): Category **Business** · Contact email `jayvasani8112005@gmail.com` · Website `https://jay0085-cdr.github.io/bizswap-gurgaon/` (optional).

## 4. Closed testing track
**Left menu → Test and release → Testing → Closed testing → Create track** (or use the default "Closed testing – Alpha").

1. **Countries/regions** tab: **Add countries → India**. Add others only if testers are abroad.
2. **Testers** tab: **Create email list** or **Google Groups**. Google Groups is recommended because people can join themselves:
   1. Go to https://groups.google.com → **Create group**.
   2. Name it `BizSwap Testers` and use an email address like `bizswap-testers@googlegroups.com`.
   3. Set **Who can join group** to **Anyone on the web can ask** (or "Anyone can join"), and **Who can view members** to **Group managers**.
   4. Back in Play Console: Testers tab → **Google Groups** → enter `bizswap-testers@googlegroups.com` → **Save**.
   5. Set **Feedback URL or email address** to `jayvasani8112005@gmail.com`.
3. **Create release:**
   - Play App Signing: **Use Google-generated key** (the default). The EAS keystore becomes your upload key.
   - Upload the `.aab`. The release name will fill in automatically as `1 (1.0)`.
   - Release notes: paste `store/listing-en.md → Release notes`.
   - **Next → Save → Go to Publishing overview → Send changes for review.**
4. First review usually takes **a few hours to 3 days**.

## 5. Share the opt-in link
Once the review is approved, open **Closed testing → Testers tab → "How testers join your test" → Copy link**. It looks like `https://play.google.com/apps/testing/<package-id>`.

Send testers the WhatsApp message from `docs/TESTER_GUIDE.md`, with two links:
1. The Google Group join link: `https://groups.google.com/g/bizswap-testers` (they must join with the **same Gmail account** they use for Play Store).
2. The opt-in link above. They tap **Become a tester**, then **Download it on Google Play**.

**Get 15 or more people to join.** Some always drop out, and you need 12 still opted in after 14 days.

## 6. Check the testers are counted
**Closed testing → Testers tab** shows the number of opted-in users. Check it daily. If anyone leaves or uninstalls, replace them early.

## 7. During the 14 days
- Run `npm run feedback` every 2–3 days to read the AI summary of tester feedback, and `npm run stats` for active testers, errors and AI fallback rate.
- Post a reminder in the group on days 3, 7 and 11 ("open the app once and try one thing").
- **Don't** pause the track or remove testers, because that can reset the count.

## 8. Build V1.1
- Fix the top themes from the feedback report.
- In `app.json`, set `"version": "1.1"` and `"android.versionCode": 2`. Every upload needs a higher versionCode.
- `npm run build:aab`, then **Closed testing → Create new release** → upload → release notes ("What's new in 1.1") → **Send for review**.

## 9. Apply for production (after 14 days with 12+ testers)
**Dashboard → "Apply for production"** (it's unlocked once the requirement is met). The form asks:
- **How did you recruit testers?** Students from my college, recruited via a WhatsApp group and joined through a Google Group.
- **How easy was it to recruit testers?** Pick the honest option.
- **Describe the feedback you received and how you collected it.** Use the summary from `npm run feedback`. Mention the in-app feedback button and the AI feedback agent, and name the 3–5 top themes and what changed in 1.1.
- **Who is the intended audience?** Owners and buyers of small businesses (pubs, restaurants, clinics, CA/CS practices) in Gurgaon, aged 18+.
- **How does your app provide value?** No-form, voice-first listing and AI matching of buyers and sellers of running businesses.
- **Expected number of installs in the first year.** Pick a realistic band, e.g. 1K–10K.
- **What changes did you make based on testing?** List the 1.1 changes.
- **Is the app ready for production?** Yes, once 1.1 is in the closed track.

Google replies within about 7 days. Then go to **Production → Create release**, promote the 1.1 build, and roll out.

## Common rejections and how to avoid them
| Issue | Avoid it by |
|---|---|
| Privacy policy URL unreachable | Open the URL in a private window before submitting |
| Data safety doesn't match the app | Use exactly the answers above. Mic audio is never collected. |
| Missing account deletion | Already covered: in-app Settings → Delete my data, plus email |
| Misleading metadata | Keep the "demo listings are fictional" line in the description |
| Broken app for the reviewer | No login is needed, so the reviewer can use everything immediately |
