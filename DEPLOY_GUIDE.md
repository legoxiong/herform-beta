# HERFORM — Deploy Guide (v6)
## Full setup with Supabase accounts + Claude AI + Vercel

---

## YOUR FILE STRUCTURE

```
herform/                     ← your GitHub repo root
├── index.html               ← Landing page (waitlist)
├── app.html                 ← Main app (rename herform_app_v6.html)
├── manifest.json            ← Makes app installable on phones
├── service-worker.js        ← Offline support
├── vercel.json              ← Routing config
├── package.json             ← Tells Vercel to use ES modules
└── api/
    └── coach.js             ← Secure Claude AI proxy
```

---

## STEP 1 — Set up Supabase (free user accounts)

1. Go to https://supabase.com → Sign up free
2. Click **New Project** → name it `herform`
3. Wait ~2 minutes for it to set up

### Create the database table:
4. Go to **Table Editor** → **New Table**
5. Name it: `herform_users`
6. Delete the default `id` column
7. Add these columns:

| Name | Type | Primary | Nullable |
|------|------|---------|---------|
| `user_id` | `text` | ✅ Yes | ❌ No |
| `profile` | `text` | ❌ No | ✅ Yes |
| `cycle_data` | `text` | ❌ No | ✅ Yes |
| `stats` | `text` | ❌ No | ✅ Yes |
| `conversation` | `text` | ❌ No | ✅ Yes |
| `updated_at` | `timestamptz` | ❌ No | ✅ Yes |

8. Click **Save**

### Get your API keys:
9. Go to **Settings → API**
10. Copy **Project URL** → looks like `https://xxxxxx.supabase.co`
11. Copy **Publishable key** → starts with `sb_` or `eyJ`

### Update your app:
12. Open `app.html` → find these lines near the top of the script:
```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```
13. Replace with your actual values:
```js
const SUPABASE_URL = 'https://xxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_xxxxxxxxxxxxxxx...';
```

### Set redirect URLs in Supabase:
14. Go to **Authentication → URL Configuration**
15. Set **Site URL** to: `https://herform-wellness.vercel.app`
16. Add to **Redirect URLs**: `https://herform-wellness.vercel.app/app`
17. Click **Save**

---

## STEP 2 — Set up Formspree (collect waitlist emails)

1. Go to https://formspree.io → Sign up free
2. Click **New Form** → name it "HERFORM Waitlist"
3. Copy your Form ID (looks like: `xrgvkpqb`)
4. Open `index.html` → find this line:
```js
const FORM_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID';
```
5. Replace `YOUR_FORM_ID` with your actual ID

**Free tier:** 50 submissions/month.

---

## STEP 3 — Add PWA tags to app.html

Open `app.html`. Inside `<head>`, add before `</head>`:
```html
<link rel="manifest" href="/manifest.json">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="HERFORM">
<meta name="theme-color" content="#0A0A0A">
```

Add before `</body>`:
```html
<script>
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js');
}
</script>
```

---

## STEP 4 — Create package.json

Create a new file called `package.json` in your root folder with this content:
```json
{
  "type": "module"
}
```
This tells Vercel that `api/coach.js` uses ES module syntax.

---

## STEP 5 — Deploy to Vercel via GitHub

1. Go to https://github.com → your repo
2. Make sure your file structure matches the layout above
3. Confirm `coach.js` is inside the `api/` folder (not in root)
4. Go to https://vercel.com → your project
5. It auto-deploys every time you push to GitHub ✓

---

## STEP 6 — Add environment variables in Vercel

1. Vercel dashboard → your project → **Settings → Environment Variables**
2. Add:

| Name | Value |
|------|-------|
| `ANTHROPIC_API_KEY` | Your key from console.anthropic.com |

3. Click **Save** → **Redeploy**

---

## STEP 7 — Test everything

| Test | Expected result |
|------|----------------|
| `herform-wellness.vercel.app` | Landing page |
| `herform-wellness.vercel.app/app` | Sign in screen |
| `herform-wellness.vercel.app/api/coach` | `{"error":"Method not allowed"}` |
| Create account | Row appears in Supabase `herform_users` table |
| AI Coach chat | Real Claude response (not demo mode) |

---

## STEP 8 — Custom domain (optional, ~$10-15/year)

1. Buy a domain at https://namecheap.com (e.g. `herform.app`)
2. Vercel → your project → **Settings → Domains**
3. Add your domain → follow DNS instructions (~10 min)
4. Update Supabase redirect URLs to your new domain

---

## STEP 9 — Share with beta users

Send beta users this link: `https://herform-wellness.vercel.app/app`

**To install on iPhone:**
> Open in Safari → tap Share → tap "Add to Home Screen" → tap Add

**To install on Android:**
> Open in Chrome → tap ⋮ menu → "Add to Home Screen" → tap Add

---

## COSTS SUMMARY

| Service | Cost |
|---------|------|
| Vercel hosting | FREE |
| Supabase (up to 50k users) | FREE |
| Formspree waitlist | FREE (50/mo) |
| Anthropic Claude API | ~$0.01–0.05 per user session |
| Custom domain | ~$10–15/year (optional) |
| **Total to launch** | **$0** |

---

## NEXT STEPS AFTER BETA

- Convert to native iOS/Android app via Expo/React Native
- Add Stripe payments for premium tier
- Add push notifications for cycle phase changes
- Add Strava API key to enable real activity sync
- Scale Supabase plan when user base grows

🚀 Ship it. Test it. Learn.
