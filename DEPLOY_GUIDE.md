# HERFORM — Deploy Guide
## From zero to live in ~20 minutes. Free.

---

## YOUR FILE STRUCTURE

```
herform/
├── index.html          ← Landing page (waitlist)
├── app.html            ← The HERFORM app (herform_app_v2.html renamed)
├── manifest.json       ← Makes app installable on phones
├── service-worker.js   ← Offline support
├── vercel.json         ← Routing config
└── api/
    └── coach.js        ← Secure Claude AI proxy
```

---

## STEP 1 — Set up Formspree (collect waitlist emails)

1. Go to https://formspree.io → Sign up free
2. Click "New Form" → name it "HERFORM Waitlist"
3. Copy your Form ID (looks like: `xrgvkpqb`)
4. Open `index.html` → find this line:
   ```
   const FORM_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID';
   ```
5. Replace `YOUR_FORM_ID` with your actual ID
6. Done — emails go straight to your inbox + Formspree dashboard

**Free tier:** 50 submissions/month. Upgrade ($10/mo) if you get more.

---

## STEP 2 — Rename your app file

Rename `herform_app_v2.html` → `app.html`
(This makes it live at `yoursite.com/app`)

---

## STEP 3 — Add PWA tags to app.html

Open `app.html`. Inside `<head>`, add these lines before `</head>`:

```html
<link rel="manifest" href="/manifest.json">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="HERFORM">
<meta name="theme-color" content="#2A2825">
```

Also add before `</body>`:

```html
<script>
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js');
}
</script>
```

---

## STEP 4 — Update app.html to use secure API

In `app.html`, find the `getAIResponse` function.
Replace the fetch URL from:
```js
const res = await fetch('https://api.anthropic.com/v1/messages', {
```
With your Vercel API route:
```js
const res = await fetch('/api/coach', {
```

And replace the full body with:
```js
body: JSON.stringify({
  messages: conversationHistory,
  cycleDay: currentDay,
  phaseName: getPhase(currentDay).name,
  workout: getPhase(currentDay).workout
})
```

This means your Anthropic API key is NEVER in the app — it stays safely on the server.

---

## STEP 5 — Deploy to Vercel

### Option A: Drag & drop (easiest, no coding)
1. Go to https://vercel.com → Sign up free (use GitHub or email)
2. Click "Add New Project" → "Deploy without Git"
3. Drag your entire `herform/` folder into the upload area
4. Click Deploy → wait ~30 seconds
5. You get a live URL like: `herform.vercel.app`

### Option B: Via GitHub (recommended for easy updates)
1. Create a free GitHub account at https://github.com
2. Create a new repository called `herform`
3. Upload all your files to it
4. Go to Vercel → "Add New Project" → Import from GitHub
5. Select your repo → Deploy
6. Future updates: just push to GitHub → Vercel auto-deploys ✓

---

## STEP 6 — Add your Anthropic API key (secret)

1. In Vercel dashboard → your project → Settings → Environment Variables
2. Add new variable:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key from https://console.anthropic.com
3. Click Save → Redeploy

Your key is now secret and secure. Never put it in HTML files.

---

## STEP 7 — Custom domain (optional, ~$10-15/year)

1. Buy a domain at https://namecheap.com (e.g. `herform.app`)
2. In Vercel → your project → Settings → Domains
3. Add your domain → follow the DNS instructions (takes ~10 min)
4. Done — your app lives at `herform.app` and landing at `herform.app/`

---

## STEP 8 — Tell beta users how to install the app

Send this in your beta invite email:

> **iPhone:** Open the link in Safari → tap the Share button (box with arrow) → tap "Add to Home Screen" → tap Add
>
> **Android:** Open in Chrome → tap the 3-dot menu → tap "Add to Home Screen" → tap Add
>
> The app will appear on your home screen like a normal app!

---

## YOUR LIVE URLS

| Page | URL |
|------|-----|
| Landing + waitlist | `herform.vercel.app` |
| The app | `herform.vercel.app/app` |
| AI API | `herform.vercel.app/api/coach` |

---

## COSTS SUMMARY

| Service | Cost |
|---------|------|
| Vercel hosting | FREE |
| Formspree waitlist | FREE (50/mo) |
| Anthropic API (Claude) | ~$0.01–0.05 per user session |
| Custom domain | ~$10–15/year (optional) |
| **Total to launch** | **$0** |

---

## NEXT STEPS AFTER BETA

Once you have real user feedback:
- Convert to Expo/React Native for App Store submission (~2–3 months work)
- Add a real database (Supabase — free tier) to store user cycle data
- Add push notifications for phase transitions
- Add payment (Stripe) for premium tier

But for now — ship it, test it, learn. 🚀
