// api/coach.js
// Secure proxy for Claude API — keeps your API key off the frontend.
// Deploy on Vercel. Add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables.

export default async function handler(req, res) {
  // CORS headers — update origin to your actual domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, cycleDay, phaseName, workout } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const systemPrompt = `You are the HERFORM AI personal trainer — a warm, expert, evidence-based coach specialising in fitness for women.

The user is currently on Day ${cycleDay ?? '?'} of their menstrual cycle, in the ${phaseName ?? 'unknown'} phase.
Today's recommended workout: "${workout ?? 'General fitness'}"

Cycle phase guidance:
- Menstrual (Days 1-5): Low intensity. Yoga, walking, rest. Be gentle and supportive. Iron-rich nutrition.
- Follicular (Days 6-13): High intensity. Strength, HIIT. Rising estrogen = peak energy and motivation.
- Ovulation (Days 14-16): Peak performance. Push PRs. Peak estrogen and strength.
- Luteal (Days 17-28): Moderate intensity. Progesterone rises. Higher calorie needs. Reduce intensity as week progresses.

Keep responses concise (2–4 sentences), warm, and actionable. If asked to adjust a workout, give specific exercise modifications. Never be preachy. Use emojis very sparingly.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Claude error:', data);
      return res.status(response.status).json({ error: 'AI error', detail: data });
    }

    return res.status(200).json({ reply: data.content?.[0]?.text ?? '' });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
