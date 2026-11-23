// Optional: ask Google's Gemini (free API key from Google AI Studio) for approaches.
// The key stays in this browser's local storage and is sent only to Google.
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Model names change often, so look up what this key can use and prefer the newest Flash model.
async function candidateModels(key) {
  try {
    const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
    if (res.status === 400 || res.status === 403) throw Object.assign(new Error('bad-key'), { code: 'bad-key' });
    const data = await res.json();
    const names = (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
      .filter(n => /^gemini-[\d.]+-flash(-lite)?$/.test(n));
    const ver = n => parseFloat(n.match(/gemini-([\d.]+)/)[1]);
    names.sort((a, b) => (/lite/.test(a) - /lite/.test(b)) || ver(b) - ver(a));
    return [...names, 'gemini-flash-latest', 'gemini-flash-lite-latest'];
  } catch (err) {
    if (err.code === 'bad-key') throw err;
    return ['gemini-flash-latest', 'gemini-flash-lite-latest'];
  }
}

export async function askGemini(key, brief) {
  const prompt = `${brief}\n\nIMPORTANT: Reply with only the JSON object described above, with 3 approaches. Use exact card names from the list.`;
  let lastErr = 'unknown';
  for (const model of (await candidateModels(key)).slice(0, 4)) {
    const res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 1 },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
      if (text.trim()) return { text, model };
      lastErr = 'empty';
      continue;
    }
    if (res.status === 400 || res.status === 403) {
      const body = await res.text();
      if (/API key|API_KEY/i.test(body)) throw Object.assign(new Error('bad-key'), { code: 'bad-key' });
    }
    lastErr = res.status === 429 ? 'limit' : `http-${res.status}`;
  }
  throw Object.assign(new Error(lastErr), { code: lastErr });
}
