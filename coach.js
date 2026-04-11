// api/coach.js — Vercel serverless function
// Add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, system, cycleDay, phaseName, workout, userProfile, stats } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request — messages array required' });
  }

  const systemPrompt = system || `You are the HERFORM AI personal trainer — warm, expert, evidence-based, specialising in fitness for women.
Cycle day: ${cycleDay || '?'} | Phase: ${phaseName || 'unknown'} | Workout: "${workout || 'General fitness'}"
Goal: ${userProfile && userProfile.goal || 'General health'} | Level: ${userProfile && userProfile.level || 'intermediate'}
Sessions: ${stats && stats.sessions || 0} | Streak: ${stats && stats.streak || 0} days
Keep responses concise (2-4 sentences or numbered list), warm, actionable. Never preachy.`;

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
        messages: messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Claude error:', data);
      return res.status(response.status).json({ error: 'AI error' });
    }

    return res.status(200).json({ reply: data.content[0].text });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
