export function sanitizeAIText(input: string): string {
  let text = String(input || '');
  try {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const json = JSON.parse(trimmed);
      const acc: string[] = [];
      const bannedKeys = new Set(['mid_term_memory', 'thinking', 'reasoning', 'analysis', 'metadata', 'tool_calls']);
      const preferredKeys = ['text', 'content', 'output', 'message', 'response', 'result'];
      const walk = (node: any, keyHint?: string) => {
        if (node == null) return;
        if (typeof node === 'string') {
          if (!keyHint || preferredKeys.includes(keyHint)) acc.push(node);
          return;
        }
        if (Array.isArray(node)) {
          for (const it of node) walk(it);
          return;
        }
        if (typeof node === 'object') {
          for (const k of Object.keys(node)) {
            if (bannedKeys.has(k)) continue;
            walk(node[k], k);
          }
        }
      };
      walk(json);
      if (acc.length) text = acc.join('\n');
    }
  } catch {}

  text = text.replace(/<\s*(thinking|reasoning)[^>]*>[\s\S]*?<\s*\/\s*(thinking|reasoning)\s*>/gi, '');
  text = text.replace(/```\s*(thinking|reasoning|json)[\s\S]*?```/gi, '');
  text = text.replace(/"mid_term_memory"\s*:\s*(\{[\s\S]*?\}|\[[\s\S]*?\]|"[\s\S]*?")/gi, '');
  text = text.replace(/"value"\s*:\s*(\{[\s\S]*?\}|\[[\s\S]*?\]|"[\s\S]*?"|[^,}]+)(,)?/gi, '');
  text = text.replace(/\}\s*\},/g, '}');
  text = text.replace(/\{\s*"text"\s*:\s*"([\s\S]*?)"\s*\}/gi, '$1');
  text = text.replace(/\{\s*"content"\s*:\s*"([\s\S]*?)"\s*\}/gi, '$1');
  text = text.replace(/\\n/g, '\n').replace(/\\t/g, ' ').replace(/\\r/g, '');

  const bannedPrefixes = [
    '思考', '思路', '分析', '推理', '推断', 'reasoning', 'analysis', 'chain-of-thought', 'cot', 'plan'
  ];
  const lines = text.split(/\r?\n/).filter((line) => {
    const l = line.trim();
    if (!l) return false;
    const lower = l.toLowerCase();
    if (bannedPrefixes.some((p) => lower.startsWith(p))) return false;
    if (/^\{\s*\}?$/.test(l)) return false;
    if (/^[\[\]]$/.test(l)) return false;
    if (/^"[\w_]+"\s*:\s*.*$/.test(l)) return false;
    return true;
  });
  text = lines.join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/\bjson\b/gi, '');
  return text.trim();
}

export function formatDialogue(input: string): string {
  let text = sanitizeAIText(input);
  text = text.replace(/\s+/g, ' ').trim();
  let dialogue = '';
  let state = '';
  const parenMatch = text.match(/（([\s\S]*?)）\s*$/);
  if (parenMatch) {
    state = parenMatch[1].trim();
    text = text.replace(/（([\s\S]*?)）\s*$/, '').trim();
  }
  const quoteMatch = text.match(/“([\s\S]*?)”/);
  if (quoteMatch) {
    dialogue = quoteMatch[1].trim();
  } else {
    // 取首句作为对白
    const sentence = text.match(/^[^。！？!?]+[。！？!?]?/);
    dialogue = (sentence ? sentence[0] : text).trim();
  }
  if (dialogue.length > 160) dialogue = dialogue.slice(0, 160);
  return state ? `${dialogue}（${state}）` : dialogue;
}

export function formatStory(input: string, maxChars = 600): string {
  let text = sanitizeAIText(input);
  text = text.replace(/\s+$/g, '').trim();
  if (text.length <= maxChars) return text;
  // 尽量按句子边界截断
  const clipped = text.slice(0, maxChars);
  const lastPunct = Math.max(
    clipped.lastIndexOf('。'),
    clipped.lastIndexOf('！'),
    clipped.lastIndexOf('？'),
    clipped.lastIndexOf('!'),
    clipped.lastIndexOf('?')
  );
  if (lastPunct > 50) return clipped.slice(0, lastPunct + 1);
  return clipped + '…';
}
