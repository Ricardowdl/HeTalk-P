import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/utils/request';
import { sanitizeAIText, formatDialogue, formatStory } from '@/utils/sanitize';
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
    actionRequired: 8,
  });
  console.log('gameState', gameState);
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
        parsed.actionRequired = 6 + Math.floor(Math.random() * 7);
      }
      setGameState(parsed);
    } else {
      // 初始剧情（背景介绍 + 开场）
      const isChenNuo = (charId || selectedCharacter || 'chennuo') === 'chennuo';
      const initialStory = [
        '城市的黄昏总是来得很快，电台的灯牌在雨幕中闪烁，像在呼吸。',
        '这座城有两个人：一个是电台主持人陈诺，温柔而神秘；一个是程序员林哲，理性却孤独。',
        isChenNuo
          ? '你是陈诺。每晚的播音像是一条细细的光，在潮湿的街道上延长，故事与人声从频率中被温柔地拾起。'
          : '你是林哲。在代码与加班的缝隙里，你常把耳机递给夜色，让电台的声音挤进那些看不见的空白。',
        '雨夜，你独自走在回家的路上，电台的前奏在耳边若隐若现。',
      ];
      const newState = {
        story: initialStory,
        mode: 'buttons' as const,
        buttons: ['继续探索', '回头查看', '保持警惕'],
        chapter: 1,
        endingUnlocked: false,
        actionRequired: 6 + Math.floor(Math.random() * 7),
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
      }, { timeoutMs: 180000, retries: 2, retryDelayMs: 2000 });
      const storyText = formatStory(String(data?.story || '').trim(), 420);
      if (!storyText) throw new Error('生成内容为空');
      const newStory = [...gameState.story, storyText];
      const nextChapter = gameState.chapter + 1;
      const defaultButtons = ['继续探索', '回头查看', '保持警惕'];
      const dynamicButtons = (Array.isArray((data as any)?.actions) && (data as any).actions.length ? (data as any).actions.slice(0, 5) : defaultButtons);
      const actionsSoFar = nextChapter - 1; // 已进行的行动次数
      const required = (gameState.actionRequired ?? 8);
      const unlocked = actionsSoFar >= required || gameState.endingUnlocked;
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
