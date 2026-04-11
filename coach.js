// api/coach.js
// Vercel serverless function — secure Claude AI proxy
// Set ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, system, cycleDay, phaseName, workout, userProfile, stats } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request — messages array required' });
  }

  // Use system prompt from app if provided, otherwise build a default one
  const systemPrompt = system || `You are the HERFORM AI personal trainer — warm, expert, evidence-based, specialising in fitness for women.
Cycle day: ${cycleDay ?? '?'} | Phase: ${phaseName ?? 'unknown'} | Today's workout: "${workout ?? 'General fitness'}"
Goal: ${userProfile?.goal ?? 'General health'} | Activity: ${userProfile?.activity ?? 'general'} | Level: ${userProfile?.level ?? 'intermediate'}
Sessions done: ${stats?.sessions ?? 0} | Streak: ${stats?.streak ?? 0} days
Keep responses concise (2-4 sentences or a numbered list), warm, and actionable. Never preachy.`;

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
      console.error('Claude API error:', data);
      return res.status(response.status).json({ error: 'AI error', detail: data });
    }

    return res.status(200).json({ reply: data.content?.[0]?.text ?? '' });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
