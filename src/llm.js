// Lightweight Google Gemini client using built-in fetch (Node 18+).
// If GEMINI_API_KEY isn't set, every function returns a soft fallback
// so the rest of the app keeps working.

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

function enabled() {
  return Boolean(API_KEY);
}

async function callGemini(prompt, { jsonOnly = false } = {}) {
  if (!enabled()) {
    const err = new Error('AI features disabled: GEMINI_API_KEY is not configured');
    err.status = 503;
    throw err;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 512,
      ...(jsonOnly ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    const err = new Error('AI provider request failed');
    err.status = 502;
    err.cause = e;
    throw err;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`AI provider error (${res.status}): ${text.slice(0, 200)}`);
    err.status = 502;
    throw err;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const err = new Error('AI provider returned empty response');
    err.status = 502;
    throw err;
  }
  return text.trim();
}

/**
 * Produce a 2-4 sentence summary of a note's content.
 */
async function summarize({ title, content }) {
  const prompt = [
    'You are a concise note summarizer.',
    'Write a clear 2-4 sentence summary of the note below.',
    'Do not add a preamble like "Here is a summary" - just write the summary.',
    'Stay faithful to the content; do not invent facts.',
    '',
    `TITLE: ${title || '(untitled)'}`,
    'CONTENT:',
    content || '(empty)',
  ].join('\n');
  return callGemini(prompt);
}

/**
 * Suggest 3-5 short, lowercase tags as a JSON array of strings.
 * Returns an array; never throws for normal failures (returns []).
 */
async function suggestTags({ title, content }) {
  if (!enabled()) return [];

  // Don't waste a Gemini call on empty/trivial input
  const meaningful = `${(title || '').trim()} ${(content || '').trim()}`.trim();
  if (meaningful.length < 15 || /^untitled$/i.test((title || '').trim())) {
    return [];
  }

  const prompt = [
    'You suggest topical tags for a note. Output rules:',
    '- Respond with ONLY a JSON array of 3 to 5 strings. Nothing else.',
    '- Tags must be 1-3 words, lowercase, hyphenated if multi-word (e.g. "ancient-greece").',
    '- Tags must describe the SPECIFIC SUBJECT of the note (people, places, topics, events).',
    '- AVOID generic filler: never use "notes", "ideas", "thoughts", "writing", "personal", "brainstorming", "general", "misc".',
    '- If the note is too short or vague to tag specifically, return an empty array [].',
    '',
    'Examples:',
    'Note about Aristotle and Greek city-states → ["politics","ancient-greece","aristotle","philosophy"]',
    'Note titled "groceries" listing milk and eggs → ["groceries","shopping-list"]',
    'Note saying "hi testing 123" → []',
    '',
    `TITLE: ${title || '(untitled)'}`,
    'CONTENT:',
    (content || '').slice(0, 4000),
  ].join('\n');

  try {
    const raw = await callGemini(prompt, { jsonOnly: true });
    const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];

    // Filter out generic filler words the model sometimes ignores instructions on
    const BANNED = new Set([
      'notes', 'note', 'ideas', 'idea', 'thoughts', 'writing', 'personal',
      'brainstorming', 'general', 'misc', 'miscellaneous', 'untitled', 'random',
    ]);

    return parsed
      .filter((t) => typeof t === 'string')
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
      .filter((t) => t.length > 1 && t.length <= 40 && !BANNED.has(t))
      .slice(0, 5);
  } catch (e) {
    console.warn('Tag suggestion failed:', e.message);
    return [];
  }
}

module.exports = { enabled, summarize, suggestTags };
