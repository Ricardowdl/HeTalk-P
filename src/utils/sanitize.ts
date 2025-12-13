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
  text = text.replace(/[{}\[\]]+/g, '');
  text = text.replace(/(json|tavern_commands|action_options|mid_term_memory|system|output|模板|结构|分析)/gi, '');
  text = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9，。！？、“”‘’（）\s]/g, '');
  let dialogue = '';
  let state = '';
  const parenMatch = text.match(/（([\s\S]*?)）\s*$/);
  if (parenMatch) {
    state = parenMatch[1].trim();
    text = text.replace(/（([\s\S]*?)）\s*$/, '').trim();
  }
  const quoteMatches = text.match(/“([\s\S]*?)”/g);
  if (quoteMatches && quoteMatches.length) {
    const parts = quoteMatches.map(q => q.replace(/[“”]/g, '').trim()).filter(Boolean);
    dialogue = parts.slice(0, 3).join('。');
  } else {
    const sentences = text.match(/[^。！？!?]+[。！？!?]?/g) || [text];
    dialogue = sentences.slice(0, 3).join('').trim();
  }
  if (dialogue.length > 280) dialogue = dialogue.slice(0, 280);
  return state ? `${dialogue}（${state}）` : dialogue;
}

export function formatStory(input: string, maxChars = 600): string {
  let text = sanitizeAIText(input);
  text = text.replace(/\s+$/g, '').trim();
  // 移除内嵌的选项段落与枚举项
  const lines = text.split(/\r?\n/);
  const filtered = lines.filter((ln) => {
    const s = String(ln || '').trim();
    if (!s) return false;
    if (/^(你的选择|选择|选项)\s*[:：]/.test(s)) return false;
    if (/请选择/.test(s)) return false;
    if (/当前状态/.test(s)) return false;
    if(/^\d+\s*[\.、:：]/.test(s)) return false;
    if(/^[\-•]\s+/.test(s)) return false;
    if(/<\s*thinking/i.test(s)) return false;
    if(/^#{1,6}\s+/.test(s)) return false;
    if(/^>{1,3}\s+/.test(s)) return false;
    if(/^\*\*.*\*\*$/.test(s)) return false;
    if(/^\s*-{3,}\s*$/.test(s)) return false;
    return true;
  });
  text = filtered.join('\n').trim();
  // 纠正常用人称性别：陈诺/林哲均为“他”，苏芮为“她”
  text = enforcePronounsInStory(text);
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

function enforcePronounsInStory(input: string): string {
  const sentences = String(input || '').split(/(?<=[。！？!?])/);
  const fixed = sentences.map((sent) => {
    const s = String(sent || '');
    const hasChen = /陈诺/.test(s);
    const hasLin = /林哲/.test(s);
    const hasSu = /苏芮/.test(s);
    let out = s;
    if (hasChen || hasLin) {
      out = out.replace(/她的/g, '他的').replace(/她/g, '他');
    }
    if (hasSu) {
      out = out.replace(/他的/g, '她的').replace(/他/g, '她');
    }
    return out;
  });
  return fixed.join('');
}
