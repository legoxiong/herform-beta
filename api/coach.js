// api/coach.js — HERFORM Multi-Agent Coaching Brain with Memory Stores
//
// Runtime: Vercel Edge (25-second timeout on Hobby plan — no Pro needed)
//
// Pipeline:
//   Round 1 — Parallel (no dependency):
//     · Memory read (Supabase) — user's coaching history
//     · Intake Agent  (Haiku)  — parses user's message for need, mood, tone
//     · Phase Agent   (Haiku)  — hormone & energy profile for this cycle phase
//   Round 2 — Parallel (memory now available):
//     · Preference Agent     (Haiku) — workout style from memory + conversation
//     · Energy Baseline Agent(Haiku) — today's energy vs. historical patterns
//   Round 3 — Synthesis (Opus 4.8) — resolves all four, delivers one unified reply
//   Round 4 — Memory Scribe (Haiku) → write updated memory to Supabase
//
// Fallback — if the pipeline errors at any point, a single Opus 4.8 call takes over.

export const config = { runtime: 'edge' };

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

function anthropicHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// effort is supported on Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 4.6 — NOT on Haiku.
// Pass effort only for Opus synthesis calls; omit for all Haiku agent calls.
const VALID_EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'];

async function callClaude(model, system, messages, maxTokens, effort = null) {
  const payload = { model, max_tokens: maxTokens, system, messages };
  if (effort && VALID_EFFORT.includes(effort)) payload.output_config = { effort };
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: anthropicHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? `Claude API error ${res.status}`);
  // Refusal — no output tokens charged (June 2026 billing change).
  // Surface as a tagged error so callers can return a friendly UI message.
  if (data.stop_reason === 'refusal') {
    const err = new Error('refusal');
    err.isRefusal = true;
    throw err;
  }
  return data.content?.[0]?.text ?? '';
}

// ── Tier helper — reads user's subscription tier from Supabase ───────────────

async function getUserTier(userId) {
  if (!userId || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return 'free';
  try {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/herform_users?user_id=eq.${encodeURIComponent(userId)}&select=tier`,
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
      }
    );
    if (!res.ok) return 'free';
    const data = await res.json();
    return data?.[0]?.tier ?? 'free';
  } catch {
    return 'free'; // safe default — never accidentally grant pro on error
  }
}

// ── Memory helpers (Supabase REST — no SDK needed) ────────────────────────────

async function readMemory(userId) {
  if (!userId || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return '';
  try {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/user_memory?user_id=eq.${encodeURIComponent(userId)}&select=memory_text`,
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
      }
    );
    if (!res.ok) return '';
    const data = await res.json();
    return data?.[0]?.memory_text ?? '';
  } catch {
    return ''; // Non-critical — coaching continues without memory on failure
  }
}

async function writeMemory(userId, memoryText) {
  if (!userId || !memoryText || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return;
  try {
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/user_memory`, {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: userId,
        memory_text: memoryText,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error('Memory write failed (non-critical):', e.message);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

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

  let body;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { messages, cycleDay, phaseName, workout, userId } = body;
  if (!messages || !Array.isArray(messages)) {
    return jsonResponse({ error: 'Invalid request' }, 400);
  }

  const userMessage   = messages[messages.length - 1]?.content ?? '';
  const recentHistory = messages.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`).join('\n');
  const phaseCtx      = `Day ${cycleDay ?? '?'} of cycle, ${phaseName ?? 'unknown'} phase. Today's planned workout: "${workout ?? 'General fitness'}".`;
  const today         = new Date().toISOString().split('T')[0];

  try {
    // ── Pro feature: Photo form analysis (bypasses 4-agent pipeline) ──────────
    // If the request includes an image, verify pro tier then run vision analysis.
    if (body.hasImage) {
      if (!body.imageData) return jsonResponse({ error: 'No image data provided' }, 400);

      const tier = await getUserTier(userId);
      if (tier !== 'pro') {
        return jsonResponse({ error: 'pro_required', message: 'Form photo analysis requires a Pro subscription.' }, 403);
      }

      const visionSystem = `You are the HERFORM AI form coach — expert at exercise technique and movement quality for women.
Analyse the workout form in this photo. The user is on Day ${cycleDay ?? '?'} of their cycle (${phaseName ?? 'unknown'} phase).

Respond using exactly this structure:
✓ **What's working:** [1-2 specific things they're doing well — be encouraging and precise]
🔧 **Key correction:** [The single most important technique fix with a body-part specific cue, e.g. "drive your knees outward" or "brace your core before the lift"]
🔄 **Phase tip:** [One adjustment suited to the ${phaseName ?? 'current'} phase — intensity, range of motion, or recovery]

Keep each section to 1-2 sentences. Under 130 words total. Warm, coaching tone.`;

      // Build vision message — prepend recent text context so the coach knows who they're talking to
      const textContext = messages
        .slice(-4)
        .filter(m => typeof m.content === 'string')
        .map(m => ({ role: m.role, content: m.content }));

      const visionMessages = [
        ...textContext,
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: body.imageMediaType ?? 'image/jpeg',
                data: body.imageData,
              },
            },
            {
              type: 'text',
              text: body.photoContext ?? 'Please analyse my workout form in this photo.',
            },
          ],
        },
      ];

      const reply = await callClaude('claude-opus-4-8', visionSystem, visionMessages, 280, 'high');
      return jsonResponse({ reply });
    }

    // ── Round 1: Memory read + Intake + Phase agents (all parallel) ───────────
    // Memory read costs nothing extra — it runs alongside the agents.

    const [memory, intakeBrief, phaseBrief] = await Promise.all([

      readMemory(userId),

      // Intake Agent — what is the user asking for, and how complex is it?
      callClaude(
        'claude-haiku-4-5',
        `You are an intake analyst for a women's fitness coaching app. Read the user's message and extract exactly:
1. Primary request: what they are asking for or need help with (one sentence)
2. Energy/mood signals: any words suggesting how they feel today — or write "none mentioned"
3. Tone: one word only — excited / motivated / neutral / tired / frustrated / struggling
4. Complexity: one word only — SIMPLE (quick tip, check-in, or single factual question) / STANDARD (typical coaching, phase advice, or workout modification) / COMPLEX (detailed program design, form analysis, emotional support, or multi-step reasoning)
Reply in exactly 4 numbered lines. No extra commentary.`,
        [{ role: 'user', content: `User's message: "${userMessage}"` }],
        120
      ),

      // Phase Agent — hormonal profile for this cycle phase
      callClaude(
        'claude-haiku-4-5',
        `You are a women's hormonal health specialist. For the given cycle phase, output exactly:
1. Active hormones: which hormones dominate and their effect on training capacity
2. Energy & strength rating: score 1–10 plus a one-sentence reason
3. Key training consideration: the single most important coaching note for this phase
Reply in exactly 3 numbered lines. Evidence-based, concise.`,
        [{ role: 'user', content: phaseCtx }],
        120
      ),

    ]);

    // ── Derive effort level from Intake Agent's complexity classification ────────
    // Line 4 of intakeBrief: SIMPLE → medium, STANDARD → high, COMPLEX → xhigh
    // Request body 'effort' overrides (e.g. plan generation sends 'medium' explicitly)
    const _complexityLine = intakeBrief.split('\n').map(l => l.trim()).find(l => /^4\./.test(l)) ?? '';
    const _derivedEffort  = _complexityLine.includes('COMPLEX') ? 'xhigh'
                          : _complexityLine.includes('SIMPLE')  ? 'medium'
                          : 'high';
    const effortLevel = (body.effort && VALID_EFFORT.includes(body.effort)) ? body.effort : _derivedEffort;

    // Build memory context string for the next two agents
    const memoryCtx = memory
      ? `User's coaching memory (past preferences, patterns, history):\n${memory}`
      : 'No coaching history yet — this is an early session. Use sensible defaults.';

    // ── Round 2: Preference + Energy agents (parallel, memory now available) ──

    const [preferenceBrief, energyBrief] = await Promise.all([

      // Preference Agent — what does this user like, based on memory + history?
      callClaude(
        'claude-haiku-4-5',
        `You are analysing a user's coaching memory and recent conversation to identify their fitness preferences. Output exactly:
1. Preferred style: workout types, formats, or intensities they enjoy or have requested
2. Avoidances: exercises, intensities, or approaches they dislike or skip — or "none identified"
3. Experience & coaching tone: their inferred fitness level and how they like to be coached
If memory is sparse, give sensible defaults for someone in the ${phaseName ?? 'current'} phase.
Reply in exactly 3 numbered lines. Concise.`,
        [{ role: 'user', content: `${memoryCtx}\n\nRecent conversation:\n${recentHistory}\n\nContext: ${phaseCtx}` }],
        120
      ),

      // Energy Baseline Agent — is today's energy normal for this phase?
      callClaude(
        'claude-haiku-4-5',
        `You are an energy assessment specialist for women's health. Compare the user's signals today against their historical energy patterns. Output exactly:
1. Energy status: NORMAL / ELEVATED / LOW — with one sentence explaining why, referencing history if available
2. Intensity adjustment vs. planned workout: none / reduce 20% / reduce 40% / rest day
3. Top adaptation: one specific change that best supports today's energy level
Reply in exactly 3 numbered lines. Concise and actionable.`,
        [{ role: 'user', content: `User's message: "${userMessage}"\nCycle context: ${phaseCtx}\n${memoryCtx}` }],
        120
      ),

    ]);

    // ── Round 3: Synthesis Agent (Opus 4.8) ───────────────────────────────────
    // Receives all four briefs + full conversation history. Resolves conflicts.
    // The key rule: user's real-time signals override phase defaults.

    const synthesisSystem = `You are the HERFORM AI coach — warm, expert, evidence-based, specialising in cycle-synced fitness for women.

Your four specialist agents have completed their analysis:

[INTAKE — what the user needs today]
${intakeBrief}

[PHASE — hormonal & energy profile for this cycle phase]
${phaseBrief}

[PREFERENCES — this user's history, style, and what works for them]
${preferenceBrief}

[ENERGY BASELINE — today's energy vs. this user's historical patterns]
${energyBrief}

Your job:
• Respond directly to the user's message — address exactly what they asked
• If specialists conflict (e.g. phase says "high energy" but user signals tired) — trust the user's real-time signals over phase defaults
• Weave the most relevant insights into ONE cohesive, conversational reply — no headings, no bullet points, no reference to "agents" or "specialists"
• 3–5 sentences. Warm, direct, and actionable
• Use emojis only if the user used them first`;

    const reply = await callClaude('claude-opus-4-8', synthesisSystem, messages, 800, effortLevel);

    // ── Round 4: Memory Scribe (Haiku) — learn from this exchange ─────────────
    // Runs after synthesis. Updates memory with anything new learned today.
    // Awaited before returning so the write completes reliably within the Edge timeout.

    if (userId) {
      try {
        const scribeSystem = `You are a memory keeper for a women's fitness coaching app. Your job is to maintain a concise, useful coaching memory for each user. Review the existing memory and today's exchange, then return the updated memory.

Rules:
- Keep the total memory under 500 words
- Only record facts that would meaningfully improve future coaching
- Use the exact format below — no deviations
- If something was already in memory, update it rather than duplicate it
- If nothing new was learned today, return the existing memory unchanged
- Today's date: ${today}

Required format:
## Workout Preferences
- Enjoys: [comma-separated list, or "not yet known"]
- Avoids: [comma-separated list, or "none identified"]
- Duration: [X min, or "not yet known"]
- Experience: [beginner / intermediate / advanced, or "not yet known"]

## Phase Patterns
- Menstrual: [typical energy + preferred style, or "no data yet"]
- Follicular: [typical energy + preferred style, or "no data yet"]
- Ovulation: [typical energy + preferred style, or "no data yet"]
- Luteal: [typical energy + preferred style, or "no data yet"]

## Energy & Recovery
- [bullet-point observations, or "no data yet"]

## Coaching Notes
- [tone/style preferences observed, or "no data yet"]

## Recent Highlights
- [YYYY-MM-DD]: [notable moment — PR, struggle, breakthrough, preference expressed]`;

        const scribeInput = `Existing memory:\n${memory || '(empty — first session)'}\n\nToday's exchange:\nUser: "${userMessage}"\nCoach: "${reply}"\nCycle context: ${phaseCtx}`;

        const updatedMemory = await callClaude(
          'claude-haiku-4-5',
          scribeSystem,
          [{ role: 'user', content: scribeInput }],
          500
        );

        await writeMemory(userId, updatedMemory);

      } catch (e) {
        console.error('Memory scribe failed (non-critical):', e.message);
        // Non-critical — coaching reply already composed, memory will update next session
      }
    }

    return jsonResponse({ reply });

  } catch (err) {
    // ── Refusal: Claude declined the request — no tokens charged ─────────────
    if (err.isRefusal) {
      return jsonResponse({ reply: "I'm not able to help with that one. Try asking about your workout, cycle phase, or nutrition and I'll be right there with you 💪" });
    }

    // ── Fallback: single Opus 4.8 call if multi-agent pipeline errors ─────────
    console.error('Multi-agent pipeline error — falling back to single model:', err.message);

    try {
      const fallbackSystem = `You are the HERFORM AI personal trainer — warm, expert, evidence-based, specialising in cycle-synced fitness for women.

${phaseCtx}

Cycle phase guidance:
- Menstrual (Days 1–5): Low intensity. Yoga, walking, rest. Be gentle and supportive. Iron-rich nutrition.
- Follicular (Days 6–13): High intensity. Strength, HIIT. Rising estrogen = peak energy and motivation.
- Ovulation (Days 14–16): Peak performance. Push PRs. Peak estrogen and strength.
- Luteal (Days 17–28): Moderate intensity. Progesterone rises. Higher calorie needs. Reduce intensity as week progresses.

Keep responses 2–4 sentences. Warm, direct, actionable. No preamble. Use emojis only if the user did first.`;

      const fallbackEffort = (body.effort && VALID_EFFORT.includes(body.effort)) ? body.effort : 'high';
      const reply = await callClaude('claude-opus-4-8', fallbackSystem, messages, 1200, fallbackEffort);
      return jsonResponse({ reply });

    } catch (fallbackErr) {
      if (fallbackErr.isRefusal) {
        return jsonResponse({ reply: "I'm not able to help with that one. Try asking about your workout, cycle phase, or nutrition and I'll be right there with you 💪" });
      }
      console.error('Fallback also failed:', fallbackErr.message);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  }
}
