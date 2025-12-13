import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

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

function buildArcBlock(): string {
  return [
    '剧情主线：',
    '- 收音机异常触发：歌曲《Yellow》、节目《星夜港湾》，频率98.7，时间显示2014.05.16',
    '- 时间穿越过程：按下记忆坐标，世界如雨中水彩晕开；切至2014的香港街景差异',
    '- 空地真相场景：苏芮向林哲告白；林哲拒绝，并坦白他喜欢陈诺（核心真相）',
    '- 观察者视角：30岁的陈诺与林哲克制地目睹过去，不与过去交互',
  ].join('\n');
}

// 故事生成接口
app.post('/api/generate-story', async (req, res) => {
  try {
    const { prompt, character, history, provider, apiKey, model, temperature, maxTokens, tishici, globalContext, targetActions, currentAction } = req.body;
    const char = resolveCharacter(character);
    const counterpartName = char.name === '林哲' ? '陈诺' : '林哲';
    const engineState = {
      cast: { focus: [char.name], presentSupporting: [counterpartName], offstageRelated: [] },
      scene: { locationHint: '电台与雨夜街头' },
      worldIntent: { queries: (tishici ? [tishici] : []) },
      entitiesRuntime: {},
    };
    const engineBlock = await buildEngineBlockSafe(engineState);
    const tishiciAll = `${readGlobalTishici()}\n${String(tishici || '')}`.trim();
    const tishiciBlock = buildTishiciConstraints(tishiciAll);
    const cotBlock = buildCotProtocol();
    const arcBlock = buildArcBlock();
    
    let response;
    
    if (provider === 'openai') {
      const client = aiServices.openai || (apiKey ? new OpenAI({ apiKey }) : null);
      if (!client) return res.status(400).json({ error: 'OpenAI未配置API密钥' });
      const completion = await client.chat.completions.create({
        model: model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `${engineBlock ? engineBlock + '\n\n' : ''}${tishiciBlock ? tishiciBlock + '\n\n' : ''}${arcBlock ? arcBlock + '\n\n' : ''}${cotBlock ? cotBlock + '\n\n' : ''}你是一个文字冒险游戏的故事生成器。当前角色：${char.name}。人物设定：${char.profile || ''}。\n要求：\n1) 必须以${char.name}的第一人称视角叙述；\n2) 不得切换到其他角色的视角或身份；\n3) 仅将另一角色剧情作为世界背景参考，不得改变当前角色人称；\n4) 性别与称谓：陈诺/林哲为男性，使用“他/他的”；苏芮为女性，使用“她/她的”；不得混用；\n5) 控制篇幅约300字，句子完整，不要半句截断；\n6) 尝试在${Number(targetActions || 10)}次行动内到达结局，当前为第${Number(currentAction || 0)}次，靠近目标需加快推进，未到目标避免过早结局；\n7) 禁止输出任何界面提示或指令，如“当前状态”“请选择接下来的行动”“——”“##”“**”；\n8) 最终输出只包含剧情文本，不输出<thinking>内容。`,
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
        system: `${engineBlock ? engineBlock + '\n\n' : ''}${tishiciBlock ? tishiciBlock + '\n\n' : ''}${arcBlock ? arcBlock + '\n\n' : ''}${cotBlock ? cotBlock + '\n\n' : ''}你是一个文字冒险游戏的故事生成器。当前角色：${char.name}。人物设定：${char.profile || ''}。必须使用${char.name}的第一人称，不得切换到其他角色视角。\n输出结构：先输出<thinking>分析，再输出用json包裹的JSON，严格包含{text, mid_term_memory, tavern_commands, action_options}四字段；text为1500-2500字纯叙事；action_options正好5项；禁止未定义字段。\n节奏：在${Number(targetActions || 10)}次行动内达到结局，当前为第${Number(currentAction || 0)}次，靠近目标时加快推进，未到目标避免过早结局。\n现代都市约束：禁止修真/超自然解释，收音机异常可作为唯一奇异元素。\n禁止输出界面提示或Markdown标题/分隔线/粗体，如“当前状态”“请选择接下来的行动”“——”“##”“**”。`,
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
          { role: 'user', parts: [{ text: `${engineBlock ? engineBlock + '\n\n' : ''}${tishiciBlock ? tishiciBlock + '\n\n' : ''}${arcBlock ? arcBlock + '\n\n' : ''}${cotBlock ? cotBlock + '\n\n' : ''}输出要求：\n1) 先输出<thinking>按模板进行分析；\n2) 再输出json包裹的JSON，字段严格为{text, mid_term_memory, tavern_commands, action_options}；\n3) text为1500-2500字纯叙事，现代香港设定，推进主线；\n4) action_options正好5项，8-20字，覆盖对话/行动/情感/静默/环境互动；\n5) tavern_commands为数组，操作类型set/add/push/delete，值类型严格匹配；\n6) 禁止未定义字段；\n7) 不在最终输出展示<thinking>以外内容；\n8) 禁止输出任何界面提示或Markdown标题/分隔线/粗体，如“当前状态”“请选择接下来的行动”“——”“##”“**”。` }] },
          ...(tishici ? [{ role: 'user', parts: [{ text: `剧情提示：${tishici}` }] }] : []),
          ...history.map((h: any) => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(h.content || '') }],
          })),
          { role: 'user', parts: [{ text: `${String(prompt || '')}\n注意：禁止输出界面提示或Markdown标题/分隔线/粗体，如“当前状态”“请选择接下来的行动”“——”“##”“**”。` }] },
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
              { role: 'system', content: `${tishiciBlock ? tishiciBlock + '\n\n' : ''}${arcBlock ? arcBlock + '\n\n' : ''}${cotBlock ? cotBlock + '\n\n' : ''}你是一个文字冒险游戏的故事生成器。当前角色：${char.name}。人物设定：${char.profile || ''}。必须使用${char.name}第一人称，不得切换到其他角色。控制约300字，并在${Number(targetActions || 10)}次行动内到达结局（当前第${Number(currentAction || 0)}次），靠近目标时加快推进，未到目标避免过早结局。禁止输出界面提示或Markdown标题/分隔线/粗体，如“当前状态”“请选择接下来的行动”“——”“##”“**”。最终输出只包含剧情文本，不输出<thinking>内容。` },
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
            { role: 'system', content: `${tishiciBlock ? tishiciBlock + '\n\n' : ''}${arcBlock ? arcBlock + '\n\n' : ''}${cotBlock ? cotBlock + '\n\n' : ''}你是一个文字冒险游戏的故事生成器。当前角色：${char.name}。人物设定：${char.profile || ''}。必须以${char.name}第一人称写作，不得切换视角。控制约300字，并在${Number(targetActions || 10)}次行动内到达结局（当前第${Number(currentAction || 0)}次），靠近目标时加快推进，未到目标避免过早结局。禁止输出界面提示或Markdown标题/分隔线/粗体，如“当前状态”“请选择接下来的行动”“——”“##”“**”。最终输出只包含剧情文本，不输出<thinking>内容。` },
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
    let parsed: any = null;
    try {
      const m = String(response || '').match(/json\s*([\s\S]*?)$/i);
      const body = m ? m[1] : response;
      const j = String(body || '').match(/\{[\s\S]*\}/);
      if (j) parsed = JSON.parse(j[0]);
    } catch {}
    if (parsed && typeof parsed === 'object') {
      const text = String(parsed.text || '');
      const mid = String(parsed.mid_term_memory || '');
      const cmds = Array.isArray(parsed.tavern_commands) ? parsed.tavern_commands : [];
      const opts = sanitizeOptions(parsed.action_options);
      const endHints = /(结局|终章|尾声|最终|落幕|ending)/i;
      const confess = /(苏芮|蘇芮)[\s\S]{0,40}(喜欢|告白|表白)/i.test(text);
      const reveal = confess && /林哲[\s\S]{0,40}(拒绝|拒絕|不能|不接受|不答应)/i.test(text) && /(林哲[\s\S]{0,60}(喜欢|爱|心动|倾心)[\s\S]{0,20}陈诺)|(喜欢[\s\S]{0,10}陈诺)/i.test(text);
      const end = endHints.test(text) || reveal;
      return res.json({ story: text, actions: opts, mid_term_memory: mid, tavern_commands: cmds, end, reveal, confess });
    } else {
      const actions = sanitizeOptions(await generateActions({ provider, apiKey, model, temperature, maxTokens: capTokens(provider, maxTokens, 8000), story: response, character: char.name, tishici: tishiciAll }));
      const endHints = /(结局|终章|尾声|最终|落幕|ending)/i;
      const confess = /(苏芮|蘇芮)[\s\S]{0,40}(喜欢|告白|表白)/i.test(response);
      const reveal = confess && /林哲[\s\S]{0,40}(拒绝|拒絕|不能|不接受|不答应)/i.test(response) && /(林哲[\s\S]{0,60}(喜欢|爱|心动|倾心)[\s\S]{0,20}陈诺)|(喜欢[\s\S]{0,10}陈诺)/i.test(response);
      const end = endHints.test(response) || reveal;
      return res.json({ story: response, actions, end, reveal, confess, mid_term_memory: '', tavern_commands: [] });
    }
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
            content: `${engineBlock ? engineBlock + '\n\n' : ''}你是${char.name}，一个拥有丰富背景故事的角色。必须以第一人称回复玩家的消息，保持角色性格一致性。不得切换到其他角色。仅输出对话，不要解释；如需状态神情，在对白后用括号概括。禁止输出JSON、标签或系统提示。\n字数控制：对白180-300字，允许2-4句；括号描述不超过60字。\n性别与称谓：陈诺/林哲均为男性，使用“他/他的”；苏芮为女性，使用“她/她的”；严禁混用。${tishici ? `\n剧情提示：${tishici}` : ''}${globalContext ? `\n另一角色剧情参考（仅背景）：${globalContext}` : ''}`,
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
        system: `${engineBlock ? engineBlock + '\n\n' : ''}你是${char.name}，一个拥有丰富背景故事的角色。必须以第一人称回复玩家消息，不得切换视角。仅输出对话，不要解释；如需状态神情，在对白后用括号概括。禁止输出JSON、标签或系统提示。\n字数控制：对白180-300字，允许2-4句；括号描述不超过60字。\n性别与称谓：陈诺/林哲均为男性，使用“他/他的”；苏芮为女性，使用“她/她的”；严禁混用。${tishici ? `\n剧情提示：${tishici}` : ''}${globalContext ? `\n另一角色剧情参考（仅背景）：${globalContext}` : ''}`,
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
          { role: 'user', parts: [{ text: `你是${char.name}，根据历史对话以第一人称回复玩家。仅输出对话，不要解释；如需状态神情，在对白后用括号概括。禁止输出JSON、标签或系统提示。\n字数控制：对白180-300字，允许2-4句；括号描述不超过60字。\n性别与称谓：陈诺/林哲均为男性，使用“他/他的”；苏芮为女性，使用“她/她的”；严禁混用。${globalContext ? `\n另一角色剧情参考（仅背景）：${globalContext}` : ''}` }] },
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

app.listen(port, () => {
  console.log(`AI 文字游戏服务器运行在端口 ${port}`);
});
const CHARACTER_MAP: Record<string, { name: string; profile: string }> = {
  chennuo: {
    name: '陈诺',
    profile: '30岁，广告公司创意总监。敏感细腻，对过去抱有温柔的遗憾，是故事的主视角。',
  },
  linzhe: {
    name: '林哲',
    profile: '30岁，室内设计师。表面洒脱，内心隐忍，用友谊守护未言之情。',
  },
};

function resolveCharacter(input: string): { name: string; profile?: string } {
  const key = String(input || '').toLowerCase();
  if (CHARACTER_MAP[key]) return CHARACTER_MAP[key];
  return { name: input };
}

async function generateActions({ provider, apiKey, model, temperature, maxTokens, story, character }: any): Promise<string[]> {
  const counterpart = character === '陈诺' ? '林哲' : '陈诺';
  const prompt = `只生成5个下一步行动短语（行为，不是解释）。仅返回每行一个短语，不要编号，不要任何附加文本，不含引号与句末标点，长度8-20字。\n视角：当前角色是${character}，短语不得出现“${character}”，如涉及对方角色用“${counterpart}”。\n类型覆盖：对话/行动/情感表达/静默思考/环境互动。\n剧情：${story}`;
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

function sanitizeOptions(raw: any): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out = arr
    .map((s) => String(s || '').trim())
    .filter((s) => !/[<>]/.test(s))
    .filter((s) => !/(<\s*thinking|思维链|CoT|xml|json|分析|检查|输出|结构|模板)/i.test(s))
    .filter((s) => !/[：:]/.test(s))
    .map((s) => s.replace(/["'“”‘’]/g, ''))
    .map((s) => s.replace(/[。！？!?.…]+$/g, ''))
    .filter((s) => s.length >= 8 && s.length <= 20)
    .filter((s, i, self) => s && self.indexOf(s) === i)
    .slice(0, 5);
  return out;
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

function readGlobalTishici(): string {
  try {
    const filePath = path.join(process.cwd(), 'tishici.txt');
    if (fs.existsSync(filePath)) {
      const txt = fs.readFileSync(filePath, 'utf-8');
      return String(txt || '').trim();
    }
  } catch {}
  return '';
}

function buildTishiciConstraints(tishici: string): string {
  const base = String(tishici || '').trim();
  if (!base) return '';
  const lines = base.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 10);
  const bullet = lines.length ? `提示关键词/意象：\n- ${lines.join('\n- ')}` : '';
  const rules = [
    '剧情需紧扣提示文本的主题与意象，避免偏离设定',
    '每段内容至少出现一个提示中的关键词或意象',
    '时间/地点/人物关系以提示为准，避免随意更改',
  ].join('\n- ');
  return `${bullet}\n约束：\n- ${rules}`;
}

function buildCotProtocol(): string {
  return `思维链(CoT)协议（每次响应前必须执行，勿在最终输出中展示thinking内容）\nXML模板：\n<thinking>\n1. 用户意图分析：严格按用户选择推进剧情，不擅自改变或添加意图。\n2. 世界观与时间线检查：\n   - 时间线：□2023年 □2014年（穿越中）\n   - 收音机：□正常 □异常 □穿越中 □播放过去内容\n   - NPC：列出出场NPC与状态（如林哲、苏芮等）\n   - 角色情感状态：基于发展更新陈诺/林哲情感状态\n   - 保持现代香港设定，无修真/古代元素\n3. 剧情逻辑与角色一致性检查：\n   - 角色性格一致（陈诺细腻、林哲隐忍、苏芮直率/通透）\n   - 推进核心主线：收音机异常→穿越→空地真相→返回与释怀\n   - 情感发展克制自然，符合30岁成年人的表达\n   - 对话现代自然，符合身份与关系\n4. 数据更新规划：\n   - NPC出场/互动：更新外貌/内心/记忆\n   - 时间推进：记录行动耗时（分钟）\n   - 物品变更：香烟、手机、收音机等更新状态\n   - 情感状态更新：角色情感字段同步\n   - 世界信息更新：收音机与时间线状态\n5. 选项生成设计：\n   - 基于当前场景给出5个合理选项\n   - 多样化：对话/行动/情感表达/静默思考/环境互动\n   - 可执行、有意义、不重复\n</thinking>\n关键场景要点：\n- 收音机异常触发：5月16日、Yellow、《星夜港湾》、频率跳动98.7、播放2014年节目、过去环境音\n- 时间穿越过程：按下记忆坐标，雨中水彩晕开的视觉转换；2014旧唐楼/铁皮招牌/凉茶铺/青涩衣着；2023现代高楼/玻璃幕墙；显示剩余时间\n- 空地真相：24岁林哲与苏芮告白场景，拒绝原因与对陈诺的选择；观察者反应克制，通过动作与环境烘托\n- 返回现在与释怀：确认苏芮现状、未打电话的欲言又止、陈诺主动决定与未来计划（上海项目与时光2.0咖啡馆），结尾克制、温暖、留白。`;
}
function capTokens(provider: string, requested?: number, fallback?: number) {
  const cap = 12800;
  const base = typeof requested === 'number' ? requested : (typeof fallback === 'number' ? fallback : 12800);
  return Math.min(base, cap);
}
