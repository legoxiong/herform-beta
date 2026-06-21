// api/strava.js — HERFORM Strava OAuth & Activities Proxy
//
// Runtime: Vercel Edge (same pattern as api/coach.js)
//
// Env vars required — set in Vercel dashboard → Settings → Environment Variables:
//   STRAVA_CLIENT_ID     — from strava.com/settings/api (safe to be public, but keep it here)
//   STRAVA_CLIENT_SECRET — from strava.com/settings/api (MUST stay server-side)
//
// Actions (POST body: { action, ...params }):
//   auth-url    → returns the Strava OAuth redirect URL
//   exchange    → swaps auth code for access + refresh tokens
//   refresh     → gets a new access token using the refresh token
//   activities  → fetches the user's recent Strava activities

export const config = { runtime: 'edge' };

const STRAVA_TOKEN_URL     = 'https://www.strava.com/oauth/token';
const STRAVA_ACTIVITIES_URL = 'https://www.strava.com/api/v3/athlete/activities';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const clientId     = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return jsonResponse({ error: 'not_configured', message: 'Add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in your Vercel environment variables.' }, 503);
  }

  let body;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { action } = body;

  // ── Auth URL ───────────────────────────────────────────────────────────────
  // Returns the Strava OAuth redirect URL. Client ID stays on server.
  if (action === 'auth-url') {
    const { redirectUri } = body;
    if (!redirectUri) return jsonResponse({ error: 'redirectUri required' }, 400);
    const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read,activity:read_all&approval_prompt=auto`;
    return jsonResponse({ url });
  }

  // ── Exchange ───────────────────────────────────────────────────────────────
  // Swap the one-time auth code for access + refresh tokens.
  // client_secret never leaves the server.
  if (action === 'exchange') {
    const { code } = body;
    if (!code) return jsonResponse({ error: 'code required' }, 400);
    try {
      const res = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id:     clientId,
          client_secret: clientSecret,
          code,
          grant_type:    'authorization_code',
        }),
      });
      const data = await res.json();
      if (!res.ok) return jsonResponse({ error: data.message ?? 'Token exchange failed' }, 400);
      return jsonResponse({
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        expires_at:    data.expires_at,
        athlete: {
          id:        data.athlete?.id,
          firstname: data.athlete?.firstname,
          lastname:  data.athlete?.lastname,
          profile:   data.athlete?.profile_medium,
        },
      });
    } catch (e) {
      return jsonResponse({ error: 'Token exchange failed: ' + e.message }, 500);
    }
  }

  // ── Refresh ────────────────────────────────────────────────────────────────
  // Strava tokens expire every 6 hours. Use the refresh token to get a new one.
  if (action === 'refresh') {
    const { refresh_token } = body;
    if (!refresh_token) return jsonResponse({ error: 'refresh_token required' }, 400);
    try {
      const res = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id:     clientId,
          client_secret: clientSecret,
          refresh_token,
          grant_type:    'refresh_token',
        }),
      });
      const data = await res.json();
      if (!res.ok) return jsonResponse({ error: data.message ?? 'Token refresh failed' }, 400);
      return jsonResponse({
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        expires_at:    data.expires_at,
      });
    } catch (e) {
      return jsonResponse({ error: 'Token refresh failed: ' + e.message }, 500);
    }
  }

  // ── Activities ─────────────────────────────────────────────────────────────
  // Fetch the user's 5 most recent activities via their access token.
  if (action === 'activities') {
    const { access_token } = body;
    if (!access_token) return jsonResponse({ error: 'access_token required' }, 400);
    try {
      const res = await fetch(`${STRAVA_ACTIVITIES_URL}?per_page=5`, {
        headers: { 'Authorization': `Bearer ${access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        // 401 means the token is invalid/revoked
        const status = res.status === 401 ? 401 : 400;
        return jsonResponse({ error: data.message ?? 'Failed to fetch activities' }, status);
      }
      const activities = data.map(a => ({
        id:          a.id,
        name:        a.name,
        type:        a.type,
        distance:    a.distance,       // metres
        moving_time: a.moving_time,    // seconds
        start_date:  a.start_date_local,
        kudos_count: a.kudos_count,
      }));
      return jsonResponse({ activities });
    } catch (e) {
      return jsonResponse({ error: 'Failed to fetch activities: ' + e.message }, 500);
    }
  }

  return jsonResponse({ error: 'Unknown action' }, 400);
}
