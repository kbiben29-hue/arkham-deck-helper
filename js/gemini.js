// Optional: ask Google's Gemini (free API key from Google AI Studio) for approaches.
// The key stays in this browser's local storage and is sent only to Google.
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Model names change often, so look up what this key can use. Fast models first.
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
    const flash = names.filter(n => !/lite/.test(n)).sort((a, b) => ver(b) - ver(a));
    const lite = names.filter(n => /lite/.test(n)).sort((a, b) => ver(b) - ver(a));
    return [...flash.slice(0, 1), ...lite.slice(0, 1), ...flash.slice(1, 2), 'gemini-flash-latest', 'gemini-flash-lite-latest'];
  } catch (err) {
    if (err.code === 'bad-key') throw err;
    return ['gemini-flash-latest', 'gemini-flash-lite-latest'];
  }
}

// Stream the answer so we can show progress and only give up when Gemini goes quiet.
async function streamOnce(key, model, prompt, { signal, onProgress, thinking }) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 1, maxOutputTokens: 6000 },
  };
  if (thinking) body.generationConfig.thinkingConfig = { thinkingLevel: 'low' };
  const ctrl = new AbortController();
  const stop = reason => ctrl.abort(reason);
  signal?.addEventListener('abort', () => stop(signal.reason));
  let idle = setTimeout(() => stop('quiet'), 75000);   // nothing at all for 75s
  try {
    onProgress?.({ phase: 'thinking', model });
    const res = await fetch(`${BASE}/models/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`http-${res.status}`);
      err.status = res.status;
      if ((res.status === 400 || res.status === 403) && /API key|API_KEY/i.test(text)) err.code = 'bad-key';
      else if (res.status === 429) err.code = 'limit';
      else if (res.status === 400 && /thinking/i.test(text)) err.code = 'no-thinking';
      throw err;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', out = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      clearTimeout(idle); idle = setTimeout(() => stop('quiet'), 45000);
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        try {
          const chunk = JSON.parse(line.slice(5));
          for (const p of chunk.candidates?.[0]?.content?.parts || []) if (p.text && !p.thought) out += p.text;
          onProgress?.({ phase: 'writing', chars: out.length, model });
        } catch { /* partial line */ }
      }
    }
    if (!out.trim()) throw Object.assign(new Error('empty'), { code: 'empty' });
    return out;
  } catch (err) {
    if (ctrl.signal.aborted && !err.code) err.code = ctrl.signal.reason === 'quiet' ? 'slow' : 'cancelled';
    throw err;
  } finally { clearTimeout(idle); }
}

export async function askGemini(key, brief, signal, onProgress) {
  const prompt = `${brief}\n\nIMPORTANT: Reply with only the JSON object described above, with 3 approaches. Keep "plan" and "why" to one or two sentences each. Use exact card names from the list.`;
  let last = null;
  for (const model of (await candidateModels(key)).slice(0, 3)) {
    for (const thinking of [true, false]) {
      try {
        const text = await streamOnce(key, model, prompt, { signal, onProgress, thinking });
        return { text, model };
      } catch (err) {
        last = err;
        if (err.code === 'bad-key' || err.code === 'cancelled' || signal?.aborted) throw err;
        if (err.code === 'no-thinking') continue;     // retry the same model without the thinking setting
        onProgress?.({ phase: 'retry', model, why: err.code });
        break;                                       // slow, limit or other error: try the next model
      }
    }
  }
  throw last || new Error('unknown');
}
