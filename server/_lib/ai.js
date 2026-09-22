// MARKLEY AIService abstraction (Phase 8, server-side only).
// OpenAI-compatible chat API: works with OpenAI or any compatible provider
// by setting AI_API_URL + AI_API_KEY + AI_MODEL. Keys never reach the browser.

export function aiConfig() {
  const apiKey = process.env.AI_API_KEY || '';
  const base = (process.env.AI_API_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  const provider = process.env.AI_PROVIDER || 'openai-compatible';
  if (!apiKey) return { error: 'AI is not configured. Set AI_API_KEY on the server.' };
  return { apiKey, base, model, provider };
}

async function chatJSON({ apiKey, base, model }, system, user, maxTokens = 2000) {
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error?.message || 'AI provider error. Please try again.');
  const text = body?.choices?.[0]?.message?.content || '';
  const usage = body?.usage || {};
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error('AI returned an invalid response. Please try again.'); }
  return { data, prompt_tokens: usage.prompt_tokens ?? null, completion_tokens: usage.completion_tokens ?? null };
}

export async function logAI(admin, { user_id, kind, provider, model, prompt_tokens, completion_tokens }) {
  try {
    await admin.from('ai_requests').insert({ user_id, kind, provider, model, prompt_tokens, completion_tokens });
  } catch { /* usage logging never breaks the request */ }
}

const QUIZ_SYS = `You generate IGCSE quizzes. Reply with JSON ONLY in this shape:
{"title": string, "questions": [{"kind": "mcq"|"short"|"essay", "prompt": string, "options": [string] (mcq only, 4 items), "answer": string (mcq: exact correct option; short: model answer; essay: marking points), "points": number}]}
Keep prompts curriculum-accurate, English only, no invented mark schemes.`;

export async function generateQuiz(cfg, { subject, topic, difficulty, count, kinds }) {
  const user = `Subject: ${subject}\nTopic: ${topic}\nDifficulty: ${difficulty}\nQuestions: ${count}\nAllowed types: ${kinds.join(', ')}\nSyllabus: Cambridge IGCSE level.`;
  return chatJSON(cfg, QUIZ_SYS, user, 3000);
}

const ASG_SYS = `You draft IGCSE assignments for teachers. Reply with JSON ONLY:
{"title": string, "description": string, "instructions": string}
English only, curriculum-accurate, age-appropriate for teenagers. Never invent official mark schemes.`;

export async function generateAssignment(cfg, { subject, topic, difficulty, instructions, count, type }) {
  const user = `Subject: ${subject}\nTopic: ${topic}\nDifficulty: ${difficulty}\nTeacher instructions: ${instructions}\nQuestions/tasks: ${count}\nAssignment type: ${type}`;
  return chatJSON(cfg, ASG_SYS, user, 2000);
}

const GRADE_SYS = `You assist grading IGCSE work. Reply with JSON ONLY:
{"suggested_score": number (0 to max), "max_points": number, "suggested_feedback": string (constructive, English), "criteria": string (what was assessed), "confidence": "low"|"medium"|"high"}
Be fair and conservative. Your output is a SUGGESTION for a teacher, never final.`;

export async function suggestGrade(cfg, { subject, title, max_points, answer, files }) {
  const user = `Assignment: ${title}\nSubject: ${subject}\nMax points: ${max_points}\nStudent written answer:\n${answer || '(none)'}\nAttached files (names only, content not visible):\n${(files || []).join('\n') || '(none)'}`;
  return chatJSON(cfg, GRADE_SYS, user, 1500);
}
