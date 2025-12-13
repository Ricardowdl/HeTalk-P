import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/utils/request';
import { sanitizeAIText, formatDialogue, formatStory } from '@/utils/sanitize';
import { applyCommands } from '@/utils/worldState';

function sanitizeActions(raw: any, chapter: number, selectedCharacter: string): string[] {
  const arr0 = Array.isArray(raw) ? raw : [];
  // 展平包含换行的大段文本
  const arr = arr0.flatMap((v) => String(v || '').split(/\r?\n/)).filter(Boolean);
  const selfName = selectedCharacter === 'linzhe' ? '林哲' : '陈诺';
  const otherName = selectedCharacter === 'linzhe' ? '陈诺' : '林哲';
  const forbidden = /(输出要求|系统|system|JSON|字段|字数|模板|思维链|CoT|tavern_commands|action_options|mid_term_memory|text|里程碑|目标|结局|请选择|当前状态)/i;
  const cleaned = arr
    .map((s) => String(s || '').trim())
    .filter((s) => !/[<>]/.test(s))
    .filter((s) => !/(<\s*thinking|xml|分析|检查|结构)/i.test(s))
    .filter((s) => !forbidden.test(s))
    .filter((s) => !/[：:]/.test(s))
    .map((s) => s.replace(/["'“”‘’]/g, ''))
    .map((s) => s.replace(/[。！？!?.…]+$/g, ''))
    .map((s) => s.replace(new RegExp(selfName, 'g'), otherName))
    .filter((s) => /[\u4e00-\u9fa5a-zA-Z]/.test(s))
    .filter((s) => s.length >= 8 && s.length <= 20)
    .filter((s, i, self) => s && self.indexOf(s) === i);
  if (cleaned.length) return cleaned.slice(0, 5);
  // fallback by stage
  if (chapter <= 3) return ['伸手调试收音机', `开口问${otherName}`, '下车走走', '查看手机时间', '默默观察街道'];
  if (chapter <= 6) return ['记录频率变化', '沿着旧路前行', '回忆大学咖啡馆', '跟随异常声音', '调整频道98.7'];
  return ['屏住呼吸继续看', '压低声音询问', '闭眼冷静片刻', '仔细观察表情', '思考错过的节点'];
}
import { useNavigate } from 'react-router-dom';
import { Settings, Save } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface GameState {
  story: string[];
  mode: 'buttons' | 'chat';
  buttons: string[];
  chapter: number;
  endingUnlocked?: boolean;
  actionRequired?: number;
}

export default function Game() {
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<GameState>({
    story: [],
    mode: 'buttons',
    buttons: [],
    chapter: 0,
    endingUnlocked: false,
    actionRequired: 10,
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [avatarSrc, setAvatarSrc] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [tishici, setTishici] = useState('');
  const MAX_CHAPTERS = 5;
  const ENDING_ACTIONS = ['与TA对话', '写一段私语', '约定下一次'];

  useEffect(() => {
    const char = localStorage.getItem('selectedCharacter') || 'chennuo';
    setSelectedCharacter(char);
    loadGame(char);
    const a = localStorage.getItem(`avatar_${char}`) || '';
    setAvatarSrc(a);
    const connected = localStorage.getItem('apiConnected') === 'true';
    if (!connected) {
      navigate('/');
    }
    localStorage.setItem('lastRoute', '/game');
    fetch('/tishici.txt')
      .then((r) => r.ok ? r.text() : '')
      .then((txt) => setTishici(String(txt || '')))
      .catch(() => setTishici(''));
    // 加载聊天历史（不改变当前模式，仅恢复消息）
    const mkey = `messages_${char}`;
    const savedMsgs = localStorage.getItem(mkey);
    if (savedMsgs) {
      try {
        const parsed = JSON.parse(savedMsgs);
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (selectedCharacter) {
      const a = localStorage.getItem(`avatar_${selectedCharacter}`) || '';
      setAvatarSrc(a);
    }
  }, [selectedCharacter]);

  const loadGame = (charId?: string) => {
    const key = `gameState_${charId || selectedCharacter || 'chennuo'}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && parsed.actionRequired == null) {
        parsed.actionRequired = 10;
      }
      setGameState(parsed);
    } else {
      // 初始剧情（背景介绍 + 开场）
      const isChenNuo = (charId || selectedCharacter || 'chennuo') === 'chennuo';
      const initialStory = [
        '城市的黄昏总是来得很快，霓虹在雨幕中闪烁，像在呼吸。',
        '这座城有两个人：一个是广告创意总监陈诺，敏感细腻；一个是室内设计师林哲，洒脱之下藏着隐忍。',
        isChenNuo
          ? '你是陈诺。30岁的你在广告公司的紧凑节奏里练就克制的表达，念旧却不沉溺。'
          : '你是林哲。30岁的你在图纸与工地之间游走，笑意里藏着不被看见的张力。',
        '雨刚停，你坐在旧丰田的驾驶座，车内的收音机发出细微的沙沙声。',
      ];
      const newState = {
        story: initialStory,
        mode: 'buttons' as const,
        buttons: ['继续探索', '回头查看', '保持警惕'],
        chapter: 1,
        endingUnlocked: false,
        actionRequired: 10,
      };
      setGameState(newState);
      localStorage.setItem(key, JSON.stringify(newState));
    }
  };

  const saveGame = () => {
    const key = `gameState_${selectedCharacter || 'chennuo'}`;
    const mkey = `messages_${selectedCharacter || 'chennuo'}`;
    localStorage.setItem(key, JSON.stringify(gameState));
    localStorage.setItem(mkey, JSON.stringify(messages));
    localStorage.setItem('lastRoute', '/game');
  };

  const handleButtonClick = async (choice: string) => {
    if (gameState.endingUnlocked && ENDING_ACTIONS.includes(choice)) {
      const newState = { ...gameState, mode: 'chat' as const, buttons: [] };
      setGameState(newState);
      saveGame();
      return;
    }
    if (isGenerating) return;
    setIsGenerating(true);
    setGenError('');
    try {
      const aiConfigStr = localStorage.getItem('aiConfig') || '{}';
      const aiConfig = JSON.parse(aiConfigStr || '{}');
      const globalContext = (() => {
        const ids = ['chennuo', 'linzhe'];
        const otherIds = ids.filter((id) => id !== selectedCharacter);
        const parts: string[] = [];
        for (const oid of otherIds) {
          const gs = localStorage.getItem(`gameState_${oid}`);
          if (gs) {
            try {
              const parsed = JSON.parse(gs);
              if (Array.isArray(parsed?.story)) {
                const tail = parsed.story.slice(-3).join('\n');
                if (tail) parts.push(tail);
              }
            } catch {}
          }
        }
        return parts.join('\n');
      })();
      const data = await apiFetch('/generate-story', {
        prompt: choice,
        character: selectedCharacter,
        history: gameState.story.map((s) => ({ role: 'assistant', content: s })),
        provider: aiConfig.provider || 'openai',
        apiKey: aiConfig.apiKey || '',
        model: aiConfig.model || 'gpt-3.5-turbo',
        temperature: typeof aiConfig.temperature === 'number' ? aiConfig.temperature : 0.7,
        maxTokens: typeof aiConfig.maxTokens === 'number' ? aiConfig.maxTokens : 8000,
        tishici,
        globalContext,
        targetActions: gameState.actionRequired ?? 10,
        currentAction: gameState.chapter,
      }, { timeoutMs: 180000, retries: 2, retryDelayMs: 2000 });
      const storyText = formatStory(String(data?.story || '').trim(), 300);
      if (!storyText) throw new Error('生成内容为空');
      const newStory = [...gameState.story, storyText];
      const nextChapter = gameState.chapter + 1;
      const dynamicButtons = sanitizeActions((data as any)?.actions, nextChapter, selectedCharacter);
      if (Array.isArray((data as any)?.tavern_commands)) {
        applyCommands((data as any).tavern_commands);
      }
      const actionsSoFar = nextChapter - 1; // 已进行的行动次数
      const required = (gameState.actionRequired ?? 10);
      const confessDetected = Boolean((data as any)?.confess) || hasConfess(storyText) || hasConfess(newStory.join('\n'));
      const unlocked = confessDetected || gameState.endingUnlocked;
      const newState = {
        ...gameState,
        story: newStory,
        buttons: unlocked ? ENDING_ACTIONS : dynamicButtons,
        chapter: nextChapter,
        mode: 'buttons' as const,
        endingUnlocked: unlocked,
        actionRequired: unlocked ? required : required,
      };
      setGameState(newState);
      saveGame();
    } catch (e) {
      setGenError('内容加载失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isChatLoading) return;
    setChatError('');
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };
    const pending = [...messages, userMessage];
    setMessages(pending);
    setInput('');
    setIsChatLoading(true);
    try {
      const aiConfigStr = localStorage.getItem('aiConfig') || '{}';
      const aiConfig = JSON.parse(aiConfigStr || '{}');
      const globalContext2 = (() => {
        const ids = ['chennuo', 'linzhe'];
        const otherIds = ids.filter((id) => id !== selectedCharacter);
        const parts: string[] = [];
        for (const oid of otherIds) {
          const gs = localStorage.getItem(`gameState_${oid}`);
          if (gs) {
            try {
              const parsed = JSON.parse(gs);
              if (Array.isArray(parsed?.story)) {
                const tail = parsed.story.slice(-3).join('\n');
                if (tail) parts.push(tail);
              }
            } catch {}
          }
        }
        return parts.join('\n');
      })();
      const counterpart = selectedCharacter === 'linzhe' ? 'chennuo' : 'linzhe';
      const data = await apiFetch('/chat', {
        message: userMessage.content,
        character: counterpart,
        history: pending.slice(-10),
        provider: aiConfig.provider || 'openai',
        apiKey: aiConfig.apiKey || '',
        model: aiConfig.model || 'gpt-3.5-turbo',
        temperature: typeof aiConfig.temperature === 'number' ? aiConfig.temperature : 0.8,
        maxTokens: typeof aiConfig.maxTokens === 'number' ? aiConfig.maxTokens : 8000,
        tishici,
        globalContext: globalContext2,
      }, { timeoutMs: 180000, retries: 2, retryDelayMs: 2000 });
      const clean = formatDialogue(String(data?.response || ''));
      if (!clean.length) {
        setChatError('回复生成失败');
      } else {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: clean,
          timestamp: Date.now() + 1,
        };
        setMessages(prev => {
          const next = [...prev, aiMessage];
          const mkey = `messages_${selectedCharacter || 'chennuo'}`;
          localStorage.setItem(mkey, JSON.stringify(next));
          localStorage.setItem('lastRoute', '/game');
          return next;
        });
      }
    } catch (e: any) {
      setChatError(`回复生成失败：${String(e?.message || '网络错误')}`);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brutal-light">
      {/* 顶部导航 */}
      <div className="bg-brutal-dark text-white p-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          {avatarSrc ? (
            <img src={avatarSrc} alt="avatar" className="h-10 w-10 object-cover border-3 border-black" />
          ) : (
            <div className="h-10 w-10 bg-brutal-purple border-3 border-black" />
          )}
          <h1 className="text-2xl font-bold">时光电台</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={saveGame} className="btn-brutal !px-4 !py-2">
            <Save className="w-4 h-4" />
          </button>
          <button onClick={() => navigate('/settings')} className="btn-brutal !px-4 !py-2">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 故事展示区 */}
      <div className="p-4 max-w-4xl mx-auto">
        <div className="card-brutal mb-6 bg-white">
          <h2 className="text-2xl font-bold text-brutal-dark mb-4">故事</h2>
          <div className="space-y-4">
            {gameState.story.length > 0 ? (
              <p className="text-brutal-dark leading-relaxed text-lg">
                {gameState.story[gameState.story.length - 1]}
              </p>
            ) : null}
          </div>
        </div>

        {/* 按钮模式 */}
        {gameState.mode === 'buttons' && gameState.buttons.length > 0 && (
          <div className="card-brutal mb-6 bg-white">
            <h3 className="text-lg font-bold text-brutal-dark mb-4">选择你的行动</h3>
            <div className="grid gap-3">
              {gameState.buttons.map((btn, idx) => (
                <button
                  key={idx}
                  onClick={() => handleButtonClick(btn)}
                  disabled={isGenerating}
                  className={`btn-brutal text-left ${isGenerating ? '!opacity-60 cursor-not-allowed' : ''}`}
                >
                  {btn}
                </button>
              ))}
              {isGenerating && (
                <div className="text-sm text-brutal-dark">内容加载中...</div>
              )}
              {!!genError && (
                <div className="text-sm text-red-600">{genError}</div>
              )}
            </div>
          </div>
        )}

        {/* 聊天模式 */}
        {gameState.mode === 'chat' && (
          <div className="card-brutal mb-6 bg-white">
            <h3 className="text-lg font-bold text-brutal-dark mb-4">当前与 {selectedCharacter === 'linzhe' ? '陈诺' : '林哲'} 聊天</h3>
            <div className="h-72 overflow-y-auto border-3 border-black p-4 mb-4 bg-white">
              {messages.length === 0 ? (
                <p className="text-brutal-dark text-center">开始与角色对话...</p>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 border-2 border-black ${
                        msg.role === 'user'
                          ? 'bg-brutal-purple text-white ml-8'
                          : 'bg-white text-brutal-dark mr-8'
                      }`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="mb-2 flex items-center gap-2">
                          { (selectedCharacter === 'linzhe' ? (localStorage.getItem('avatar_chennuo') || '') : (localStorage.getItem('avatar_linzhe') || '') ) ? (
                            <img src={selectedCharacter === 'linzhe' ? (localStorage.getItem('avatar_chennuo') || '') : (localStorage.getItem('avatar_linzhe') || '')} alt="avatar" className="h-10 w-10 object-cover border-2 border-black" />
                          ) : (
                            <div className="h-10 w-10 bg-brutal-purple border-2 border-black" />
                          )}
                          <span className="text-xs text-brutal-dark">{selectedCharacter === 'linzhe' ? '陈诺' : '林哲'}</span>
                        </div>
                      )}
                      <p className="text-sm">{msg.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="输入你想说的话..."
                className="input-brutal flex-1"
              />
              <button onClick={sendMessage} className="btn-brutal" disabled={isChatLoading}>
                {isChatLoading ? '回复生成中...' : '发送'}
              </button>
            </div>
            {!!chatError && (
              <p className="mt-2 text-sm text-red-600">{chatError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function hasConfess(text: string): boolean {
  const s = String(text || '');
  const reA = /(苏芮|蘇芮)[\s\S]{0,40}(喜欢|告白|表白)/i;
  return reA.test(s);
}
