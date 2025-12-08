import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// AI 服务配置
const aiServices = {
  openai: null as OpenAI | null,
  claude: null as Anthropic | null,
};

// 初始化 AI 服务
function initAIServices() {
  const openaiKey = process.env.OPENAI_API_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  
  if (openaiKey) {
    aiServices.openai = new OpenAI({ apiKey: openaiKey });
  }
  
  if (claudeKey) {
    aiServices.claude = new Anthropic({ apiKey: claudeKey });
  }
}

// 故事生成接口
app.post('/api/generate-story', async (req, res) => {
  try {
    const { prompt, character, history, provider, apiKey, model, temperature, maxTokens, tishici, globalContext } = req.body;
    const char = resolveCharacter(character);
    const counterpartName = char.name === '林哲' ? '陈诺' : '林哲';
    const engineState = {
      cast: { focus: [char.name], presentSupporting: [counterpartName], offstageRelated: [] },
      scene: { locationHint: '电台与雨夜街头' },
      worldIntent: { queries: tishici ? [tishici] : [] },
      entitiesRuntime: {},
    };
    const engineBlock = await buildEngineBlockSafe(engineState);
    
    let response;
    
    if (provider === 'openai') {
      const client = aiServices.openai || (apiKey ? new OpenAI({ apiKey }) : null);
      if (!client) return res.status(400).json({ error: 'OpenAI未配置API密钥' });
      const completion = await client.chat.completions.create({
        model: model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `${engineBlock ? engineBlock + '\n\n' : ''}你是一个文字冒险游戏的故事生成器。当前角色：${char.name}。人物设定：${char.profile || ''}。\n要求：\n1) 必须以${char.name}的第一人称视角叙述；\n2) 不得切换到其他角色的视角或身份；\n3) 仅将另一角色剧情作为世界背景参考，不得改变当前角色人称；\n4) 控制篇幅在200~400字，结尾完整，不要半句截断。\n${tishici ? `剧情提示：${tishici}\n` : ''}${globalContext ? `另一角色剧情参考（仅背景）：${globalContext}\n` : ''}`,
          },
          ...history,
          { role: 'user', content: prompt },
        ],
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        max_tokens: capTokens('openai', maxTokens, 8000),
      });
      response = completion.choices[0].message.content;
    } else if (provider === 'claude') {
      const client = aiServices.claude || (apiKey ? new Anthropic({ apiKey }) : null);
      if (!client) return res.status(400).json({ error: 'Claude未配置API密钥' });
      const message = await client.messages.create({
        model: model || 'claude-3-haiku-20240307',
        max_tokens: capTokens('claude', maxTokens, 8000),
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        system: `${engineBlock ? engineBlock + '\n\n' : ''}你是一个文字冒险游戏的故事生成器。当前角色：${char.name}。人物设定：${char.profile || ''}。必须使用${char.name}的第一人称，不得切换到其他角色视角。\n字数控制：200~400字，句子完整。${tishici ? `\n剧情提示：${tishici}` : ''}${globalContext ? `\n另一角色剧情参考（仅背景）：${globalContext}` : ''}`,
        messages: [
          ...history.map((h: any) => ({
            role: h.role === 'user' ? 'user' : 'assistant',
            content: h.content,
          })),
          { role: 'user', content: prompt },
        ],
      });
      response = message.content[0].type === 'text' ? message.content[0].text : '';
    } else if (provider === 'gemini') {
      const key = apiKey || process.env.GOOGLE_API_KEY;
      if (!key) {
        return res.status(400).json({ error: 'Gemini未配置API密钥' });
      } else {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${(model || 'gemini-1.5-pro')}:generateContent?key=${key}`;
        const contents = [
          { role: 'user', parts: [{ text: `${engineBlock ? engineBlock + '\n\n' : ''}你是一个文字冒险游戏的故事生成器。当前角色：${char.name}。人物设定：${char.profile || ''}。必须以第一人称写作，不得切换视角。${globalContext ? `\n另一角色剧情参考（仅背景）：${globalContext}` : ''}` }] },
          ...(tishici ? [{ role: 'user', parts: [{ text: `剧情提示：${tishici}` }] }] : []),
          ...history.map((h: any) => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(h.content || '') }],
          })),
          { role: 'user', parts: [{ text: String(prompt || '') }] },
        ];
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: typeof temperature === 'number' ? temperature : 0.7,
              maxOutputTokens: capTokens('gemini', maxTokens, 8000),
            },
          }),
        });
        if (!r.ok) {
          const err = await r.text();
          return res.status(502).json({ error: 'Gemini调用失败', detail: err });
        }
        const data = await r.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        response = text;
      }
    } else if (provider === 'deepseek') {
      const key = apiKey || process.env.DEEPSEEK_API_KEY;
      if (!key) {
        return res.status(400).json({ error: 'DeepSeek未配置API密钥' });
      } else {
        const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: model || 'deepseek-chat',
            messages: [
              { role: 'system', content: `你是一个文字冒险游戏的故事生成器。当前角色：${char.name}。人物设定：${char.profile || ''}。必须使用${char.name}第一人称，不得切换到其他角色。${tishici ? `\n剧情提示：${tishici}` : ''}${globalContext ? `\n另一角色剧情参考（仅背景）：${globalContext}` : ''}` },
              ...history,
              { role: 'user', content: String(prompt || '') },
            ],
            temperature: typeof temperature === 'number' ? temperature : 0.7,
            max_tokens: capTokens('deepseek', maxTokens, 8000),
          }),
        });
        if (!r.ok) {
          const err = await r.text();
          return res.status(502).json({ error: 'DeepSeek调用失败', detail: err });
        }
        const data = await r.json();
        response = data?.choices?.[0]?.message?.content || '';
      }
    } else if (provider === 'zhipu') {
      const key = apiKey || process.env.ZHIPU_API_KEY;
      if (!key) {
        return res.status(400).json({ error: 'ZHIPU未配置API密钥' });
      }
      const r = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: model || 'glm-4.6',
          messages: [
            { role: 'system', content: `你是一个文字冒险游戏的故事生成器。当前角色：${char.name}。人物设定：${char.profile || ''}。必须以${char.name}第一人称写作，不得切换视角。${tishici ? `\n剧情提示：${tishici}` : ''}${globalContext ? `\n另一角色剧情参考（仅背景）：${globalContext}` : ''}` },
            ...history,
            { role: 'user', content: String(prompt || '') },
          ],
          thinking: { type: 'enabled' },
          max_tokens: capTokens('zhipu', maxTokens, 8000),
          temperature: typeof temperature === 'number' ? temperature : 0.7,
        }),
      });
      const data = await r.json();
      response = data?.choices?.[0]?.message?.content || '';
    } else {
      return res.status(400).json({ error: '未知的AI服务商' });
    }
    
    if (!response) return res.status(502).json({ error: 'AI未返回内容' });
    const actions = await generateActions({ provider, apiKey, model, temperature, maxTokens: capTokens(provider, maxTokens, 8000), story: response, character: char.name });
    const endHints = /(结局|终章|尾声|最终|落幕|ending)/i;
    const end = endHints.test(response);
    res.json({ story: response, actions, end });
  } catch (error) {
    console.error('生成故事失败:', error);
    res.status(500).json({ error: '生成故事失败', detail: String((error as any)?.message || '') });
  }
});

// 角色对话接口
app.post('/api/chat', async (req, res) => {
  try {
    const { message, character, history, provider, apiKey, model, temperature, maxTokens, tishici, globalContext } = req.body;
    const char = resolveCharacter(character);
    const counterpartName = char.name === '林哲' ? '陈诺' : '林哲';
    const engineState = {
      cast: { focus: [char.name], presentSupporting: [counterpartName], offstageRelated: [] },
      scene: { locationHint: '电台与雨夜街头' },
      worldIntent: { queries: tishici ? [tishici] : [] },
      entitiesRuntime: {},
    };
    const engineBlock = await buildEngineBlockSafe(engineState);
    
    let response;
    
    if (provider === 'openai') {
      const client = aiServices.openai || (apiKey ? new OpenAI({ apiKey }) : null);
      if (!client) return res.status(400).json({ error: 'OpenAI未配置API密钥' });
      const completion = await client.chat.completions.create({
        model: model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `${engineBlock ? engineBlock + '\n\n' : ''}你是${char.name}，一个拥有丰富背景故事的角色。必须以第一人称回复玩家的消息，保持角色性格一致性。不得切换到其他角色。仅输出对话，不要解释；如需状态神情，在对白后用括号概括。禁止输出JSON、标签或系统提示。\n字数控制：对白80字以内，括号描述30字以内。${tishici ? `\n剧情提示：${tishici}` : ''}${globalContext ? `\n另一角色剧情参考（仅背景）：${globalContext}` : ''}`,
          },
          ...history,
          { role: 'user', content: message },
        ],
        temperature: typeof temperature === 'number' ? temperature : 0.8,
        max_tokens: capTokens('openai', maxTokens, 8000),
      });
      response = completion.choices[0].message.content;
    } else if (provider === 'claude') {
      const client = aiServices.claude || (apiKey ? new Anthropic({ apiKey }) : null);
      if (!client) return res.status(400).json({ error: 'Claude未配置API密钥' });
      const aiMessage = await client.messages.create({
        model: model || 'claude-3-haiku-20240307',
        max_tokens: capTokens('claude', maxTokens, 8000),
        temperature: typeof temperature === 'number' ? temperature : 0.8,
        system: `${engineBlock ? engineBlock + '\n\n' : ''}你是${char.name}，一个拥有丰富背景故事的角色。必须以第一人称回复玩家消息，不得切换视角。仅输出对话，不要解释；如需状态神情，在对白后用括号概括。禁止输出JSON、标签或系统提示。\n字数控制：对白80字以内，括号描述30字以内。${tishici ? `\n剧情提示：${tishici}` : ''}${globalContext ? `\n另一角色剧情参考（仅背景）：${globalContext}` : ''}`,
        messages: [
          ...history.map((h: any) => ({
            role: h.role === 'user' ? 'user' : 'assistant',
            content: h.content,
          })),
          { role: 'user', content: message },
        ],
      });
      response = aiMessage.content[0].type === 'text' ? aiMessage.content[0].text : '';
    } else if (provider === 'gemini') {
      const key = apiKey || process.env.GOOGLE_API_KEY;
      if (!key) {
        return res.status(400).json({ error: 'Gemini未配置API密钥' });
      } else {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${(model || 'gemini-1.5-pro')}:generateContent?key=${key}`;
        const contents = [
          { role: 'user', parts: [{ text: `你是${char.name}，根据历史对话以第一人称回复玩家。仅输出对话，不要解释；如需状态神情，在对白后用括号概括。禁止输出JSON、标签或系统提示。${globalContext ? `\n另一角色剧情参考（仅背景）：${globalContext}` : ''}` }] },
          ...(tishici ? [{ role: 'user', parts: [{ text: `剧情提示：${tishici}` }] }] : []),
          ...history.map((h: any) => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(h.content || '') }],
          })),
          { role: 'user', parts: [{ text: String(message || '') }] },
        ];
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: typeof temperature === 'number' ? temperature : 0.8,
              maxOutputTokens: capTokens('gemini', maxTokens, 8000),
            },
          }),
        });
      if (!r.ok) {
        const err = await r.text();
        return res.status(502).json({ error: 'Gemini调用失败', detail: err });
      }
      const data = await r.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      response = text;
      }
    } else if (provider === 'deepseek') {
      const key = apiKey || process.env.DEEPSEEK_API_KEY;
      if (!key) {
        return res.status(400).json({ error: 'DeepSeek未配置API密钥' });
      } else {
        const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: model || 'deepseek-chat',
            messages: [
              { role: 'system', content: `你是${char.name}，根据历史对话以第一人称回复玩家。不得切换到其他角色。仅输出对话，不要解释；如需状态神情，在对白后用括号概括。禁止输出JSON、标签或系统提示。${tishici ? `\n剧情提示：${tishici}` : ''}${globalContext ? `\n另一角色剧情参考（仅背景）：${globalContext}` : ''}` },
              ...history,
              { role: 'user', content: String(message || '') },
            ],
            temperature: typeof temperature === 'number' ? temperature : 0.8,
            max_tokens: capTokens('deepseek', maxTokens, 12800),
          }),
        });
        if (!r.ok) {
          const err = await r.text();
          return res.status(502).json({ error: 'DeepSeek调用失败', detail: err });
        }
        const data = await r.json();
        response = data?.choices?.[0]?.message?.content || '';
      }
    } else if (provider === 'zhipu') {
      const key = apiKey || process.env.ZHIPU_API_KEY;
      if (!key) {
        return res.status(400).json({ error: 'ZHIPU未配置API密钥' });
      }
      const r = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: model || 'glm-4.6',
          messages: [
            { role: 'system', content: `你是${char.name}，根据历史对话以第一人称回复玩家。不得切换到其他角色。仅输出对话，不要解释；如需状态神情，在对白后用括号概括。禁止输出JSON、标签或系统提示。${tishici ? `\n剧情提示：${tishici}` : ''}${globalContext ? `\n另一角色剧情参考（仅背景）：${globalContext}` : ''}` },
            ...history,
            { role: 'user', content: String(message || '') },
          ],
          thinking: { type: 'enabled' },
          max_tokens: capTokens('zhipu', maxTokens, 12800),
          temperature: typeof temperature === 'number' ? temperature : 0.8,
        }),
      });
      const data = await r.json();
      response = data?.choices?.[0]?.message?.content || '';
    } else {
      return res.status(400).json({ error: '未知的AI服务商' });
    }
    
    if (!response) return res.status(502).json({ error: 'AI未返回内容' });
    res.json({ response });
  } catch (error) {
    console.error('对话失败:', error);
    res.status(500).json({ error: '对话失败', detail: String((error as any)?.message || '') });
  }
});

app.post('/api/models', async (req, res) => {
  try {
    const { provider, apiKey } = req.body || {};
    const p = String(provider || '').toLowerCase();
    let models: string[] = [];
    if (p === 'openai') {
      const key = apiKey || process.env.OPENAI_API_KEY;
      if (!key) return res.status(400).json({ error: 'OpenAI未配置API密钥' });
      const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      if (!r.ok) return res.status(502).json({ error: 'OpenAI获取模型失败', detail: await r.text() });
      const data = await r.json();
      models = (data?.data || []).map((m: any) => String(m?.id || '')).filter((m: string) => /gpt|o[1-9]/i.test(m));
    } else if (p === 'claude') {
      const key = apiKey || process.env.ANTHROPIC_API_KEY;
      if (!key) {
        models = ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
      } else {
        const r = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': key } });
        if (!r.ok) models = ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
        else {
          const data = await r.json();
          models = (data?.data || []).map((m: any) => String(m?.id || ''));
        }
      }
    } else if (p === 'gemini') {
      const key = apiKey || process.env.GOOGLE_API_KEY;
      if (!key) return res.status(400).json({ error: 'Gemini未配置API密钥' });
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (!r.ok) return res.status(502).json({ error: 'Gemini获取模型失败', detail: await r.text() });
      const data = await r.json();
      models = (data?.models || []).map((m: any) => String(m?.name || '')).map((n: string) => n.replace(/^models\//, ''));
      if (!models.includes('gemini-2.5-pro')) models.unshift('gemini-2.5-pro');
    } else if (p === 'deepseek') {
      const key = apiKey || process.env.DEEPSEEK_API_KEY;
      if (!key) return res.status(400).json({ error: 'DeepSeek未配置API密钥' });
      const r = await fetch('https://api.deepseek.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      if (!r.ok) return res.status(502).json({ error: 'DeepSeek获取模型失败', detail: await r.text() });
      const data = await r.json();
      models = (data?.data || []).map((m: any) => String(m?.id || ''));
    } else if (p === 'zhipu') {
      const key = apiKey || process.env.ZHIPU_API_KEY;
      if (!key) {
        models = ['glm-4.6', 'glm-4-air', 'glm-3-turbo'];
      } else {
        models = ['glm-4.6', 'glm-4-air', 'glm-3-turbo'];
      }
    } else {
      return res.status(400).json({ error: '未知的AI服务商' });
    }
    models = Array.from(new Set(models)).filter(Boolean);
    res.json({ models });
  } catch (e) {
    res.status(500).json({ error: '获取模型失败', detail: String((e as any)?.message || '') });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/upload-avatar', async (req, res) => {
  try {
    const { characterId, imageData } = req.body || {};
    if (!characterId || typeof imageData !== 'string') {
      return res.status(400).json({ error: '参数不合法' });
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: '上传失败' });
  }
});

initAIServices();

if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`AI 文字游戏服务器运行在端口 ${port}`);
  });
}

export default app;
const CHARACTER_MAP: Record<string, { name: string; profile: string }> = {
  chennuo: {
    name: '陈诺',
    profile: '电台主持人，温柔而神秘，拥有穿越时空的能力。',
  },
  linzhe: {
    name: '林哲',
    profile: '程序员，理性且孤独，在寻找失去的记忆的旅程中前行。',
  },
};

function resolveCharacter(input: string): { name: string; profile?: string } {
  const key = String(input || '').toLowerCase();
  if (CHARACTER_MAP[key]) return CHARACTER_MAP[key];
  return { name: input };
}

async function generateActions({ provider, apiKey, model, temperature, maxTokens, story, character }: any): Promise<string[]> {
  const prompt = `基于以下剧情，给出3-5个下一步行动，仅返回每行一个行动，不要编号，不要解释，每条不超过12字。\n角色：${character}\n剧情：${story}`;
  try {
    if (provider === 'openai' && (apiKey || process.env.OPENAI_API_KEY)) {
      const client = apiKey ? new OpenAI({ apiKey }) : (aiServices.openai as OpenAI);
      const r = await client.chat.completions.create({ model: model || 'gpt-3.5-turbo', messages: [{ role: 'user', content: prompt }], temperature: typeof temperature === 'number' ? temperature : 0.7, max_tokens: capTokens('openai', maxTokens, 300) });
      const text = r.choices?.[0]?.message?.content || '';
      return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 5);
    }
    if (provider === 'claude' && (apiKey || process.env.ANTHROPIC_API_KEY)) {
      const client = apiKey ? new Anthropic({ apiKey }) : (aiServices.claude as Anthropic);
      const r = await client.messages.create({ model: model || 'claude-3-haiku-20240307', max_tokens: capTokens('claude', maxTokens, 300), temperature: typeof temperature === 'number' ? temperature : 0.7, system: '', messages: [{ role: 'user', content: prompt }] });
      const text = (r as any)?.content?.[0]?.type === 'text' ? (r as any)?.content?.[0]?.text : '';
      return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 5);
    }
    if (provider === 'gemini' && (apiKey || process.env.GOOGLE_API_KEY)) {
      const key = apiKey || process.env.GOOGLE_API_KEY;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${(model || 'gemini-1.5-pro')}:generateContent?key=${key}`;
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: typeof temperature === 'number' ? temperature : 0.7, maxOutputTokens: capTokens('gemini', maxTokens, 300) } }) });
      if (!r.ok) return [];
      const data = await r.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return text.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean).slice(0, 5);
    }
    if (provider === 'deepseek' && (apiKey || process.env.DEEPSEEK_API_KEY)) {
      const key = apiKey || process.env.DEEPSEEK_API_KEY;
      const r = await fetch('https://api.deepseek.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, body: JSON.stringify({ model: model || 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: typeof temperature === 'number' ? temperature : 0.7, max_tokens: capTokens('deepseek', maxTokens, 300) }) });
      if (!r.ok) return [];
      const data = await r.json();
      const text = data?.choices?.[0]?.message?.content || '';
      return text.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean).slice(0, 5);
    }
    if (provider === 'zhipu' && (apiKey || process.env.ZHIPU_API_KEY)) {
      const key = apiKey || process.env.ZHIPU_API_KEY;
      const r = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, body: JSON.stringify({ model: model || 'glm-4.6', messages: [{ role: 'user', content: prompt }], max_tokens: capTokens('zhipu', maxTokens, 300), temperature: typeof temperature === 'number' ? temperature : 0.7 }) });
      if (!r.ok) return [];
      const data = await r.json();
      const text = data?.choices?.[0]?.message?.content || '';
      return text.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean).slice(0, 5);
    }
  } catch {}
  return [];
}

async function buildEngineBlockSafe(engineState: any): Promise<string> {
  try {
    const mod = await import('../CharaEngineForST-main/integration/prompt-builder.js');
    if (mod && typeof mod.buildPromptInjectionBlock === 'function') {
      const block = await mod.buildPromptInjectionBlock(engineState);
      return String(block || '').trim();
    }
  } catch (e) {
    // 忽略失败，回退为空
  }
  return '';
}
function capTokens(provider: string, requested?: number, fallback?: number) {
  const cap = 12800;
  const base = typeof requested === 'number' ? requested : (typeof fallback === 'number' ? fallback : 12800);
  return Math.min(base, cap);
}
