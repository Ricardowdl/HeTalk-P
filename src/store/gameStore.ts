// 游戏状态管理
import { create } from 'zustand';

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
  selectedCharacter: string;
  messages: Message[];
  aiConfig: {
    provider: 'openai' | 'claude' | 'gemini' | 'deepseek' | 'zhipu' | 'local';
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
  };
}

interface GameStore extends GameState {
  // 动作
  setStory: (story: string[]) => void;
  setMode: (mode: 'buttons' | 'chat') => void;
  setButtons: (buttons: string[]) => void;
  setChapter: (chapter: number) => void;
  setSelectedCharacter: (character: string) => void;
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  setAIConfig: (config: Partial<GameState['aiConfig']>) => void;
  
  // 持久化
  saveToLocal: () => void;
  loadFromLocal: () => void;
  
  // AI 交互
  generateStory: (choice: string) => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
}

const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';

export const useGameStore = create<GameStore>((set, get) => ({
  // 初始状态
  story: [],
  mode: 'buttons',
  buttons: [],
  chapter: 0,
  selectedCharacter: '',
  messages: [],
  aiConfig: {
    provider: 'openai',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 8000,
  },

  // 基础动作
  setStory: (story) => set({ story }),
  setMode: (mode) => set({ mode }),
  setButtons: (buttons) => set({ buttons }),
  setChapter: (chapter) => set({ chapter }),
  setSelectedCharacter: (selectedCharacter) => set({ selectedCharacter }),
  addMessage: (message) => set((state) => ({ 
    messages: [...state.messages, message] 
  })),
  setMessages: (messages) => set({ messages }),
  setAIConfig: (config) => set((state) => ({
    aiConfig: { ...state.aiConfig, ...config }
  })),

  // 持久化
  saveToLocal: () => {
    const state = get();
    localStorage.setItem('gameState', JSON.stringify({
      story: state.story,
      mode: state.mode,
      buttons: state.buttons,
      chapter: state.chapter,
      selectedCharacter: state.selectedCharacter,
      messages: state.messages,
    }));
    localStorage.setItem('aiConfig', JSON.stringify(state.aiConfig));
  },

  loadFromLocal: () => {
    const gameState = localStorage.getItem('gameState');
    const aiConfig = localStorage.getItem('aiConfig');
    
    if (gameState) {
      const parsed = JSON.parse(gameState);
      set({
        story: parsed.story || [],
        mode: parsed.mode || 'buttons',
        buttons: parsed.buttons || [],
        chapter: parsed.chapter || 0,
        selectedCharacter: parsed.selectedCharacter || '',
        messages: parsed.messages || [],
      });
    }
    
    if (aiConfig) {
      set((state) => ({
        aiConfig: { ...state.aiConfig, ...JSON.parse(aiConfig) }
      }));
    }
  },

  // AI 交互
  generateStory: async (choice: string) => {
    const state = get();
    const { aiConfig, selectedCharacter, story } = state;
    
    try {
      const response = await fetch(`${API_BASE}/generate-story`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: choice,
          character: selectedCharacter,
          history: story.map((s, i) => ({
            role: 'system',
            content: s,
            timestamp: Date.now() - (story.length - i) * 1000,
          })),
          provider: aiConfig.provider,
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
          temperature: aiConfig.temperature,
          maxTokens: aiConfig.maxTokens,
        }),
      });
      
      if (!response.ok) throw new Error('生成失败');
      
      const data = await response.json();
      const newStory = [...story, data.story];
      
      set({ story: newStory });
      get().saveToLocal();
    } catch (error) {
      console.error('生成故事失败:', error);
    }
  },

  sendMessage: async (message: string) => {
    const state = get();
    const { aiConfig, selectedCharacter, messages } = state;
    
    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: message,
      timestamp: Date.now(),
    };
    
    set((state) => ({ messages: [...state.messages, userMessage] }));
    
    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          character: selectedCharacter,
          history: messages.slice(-10), // 只保留最近10条消息
          provider: aiConfig.provider,
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
          temperature: aiConfig.temperature,
          maxTokens: aiConfig.maxTokens,
        }),
      });
      
      if (!response.ok) throw new Error('对话失败');
      
      const data = await response.json();
      const aiMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: data.response,
        timestamp: Date.now() + 1,
      };
      
      set((state) => ({ messages: [...state.messages, aiMessage] }));
      get().saveToLocal();
    } catch (error) {
      console.error('发送消息失败:', error);
    }
  },
}));
