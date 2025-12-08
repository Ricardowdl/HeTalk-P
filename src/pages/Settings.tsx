import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Upload, Key, Brain, CheckCircle2, X } from 'lucide-react';
import { apiFetch } from '@/utils/request';

interface AIConfig {
  provider: 'openai' | 'claude' | 'gemini' | 'deepseek' | 'zhipu' | 'local';
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export default function Settings() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<AIConfig>({
    provider: 'openai',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 8000,
  });
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [lastError, setLastError] = useState('');
  const [testing, setTesting] = useState(false);
  const [lastSuccess, setLastSuccess] = useState('');
  const [modelList, setModelList] = useState<string[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState('');

  useEffect(() => {
    localStorage.setItem('lastRoute', '/');
  }, []);

  const saveConfig = () => {
    localStorage.setItem('aiConfig', JSON.stringify(config));
    localStorage.setItem('apiConfigured', 'true');
    localStorage.setItem('lastRoute', '/select');
    alert('配置已保存');
  };

  const testConnection = async (): Promise<boolean> => {
    setTesting(true);
    setLastError('');
    setLastSuccess('');
    try {
      const data = await apiFetch('/chat', {
        message: '测试连接',
        character: '系统',
        history: [],
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      }, { timeoutMs: 180000, retries: 2, retryDelayMs: 2000 });
      const ok = typeof data?.response === 'string' && data.response.length > 0;
      if (!ok) {
        setLastError('连接失败：未收到有效回复');
      }
      if (ok) {
        setLastSuccess('连接成功：已收到有效回复');
        setLastError('');
      }
      return ok;
    } catch (e: any) {
      setLastError(`连接失败：${String(e?.message || '网络错误')}`);
      setLastSuccess('');
      return false;
    } finally {
      setTesting(false);
    }
  };

  const startGame = async () => {
    const ok = await testConnection();
    if (ok) {
      localStorage.setItem('aiConfig', JSON.stringify(config));
      localStorage.setItem('apiConnected', 'true');
      navigate('/select');
    }
  };

  useEffect(() => {
    const load = async () => {
      setModelLoading(true);
      setModelError('');
      try {
        const data = await apiFetch('/models', { provider: config.provider, apiKey: config.apiKey }, { timeoutMs: 30000, retries: 1 });
        const list = Array.isArray(data?.models) ? data.models : [];
        setModelList(list);
        if (list.length && !list.includes(config.model)) {
          setConfig({ ...config, model: list[0] });
        }
      } catch (e: any) {
        setModelError('获取模型失败');
        setModelList([]);
      } finally {
        setModelLoading(false);
      }
    };
    load();
  }, [config.provider, config.apiKey]);

  return (
    <div className="min-h-screen bg-brutal-light p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-black text-brutal-dark mb-8">游戏设置</h1>
        
        <div className="space-y-6">
          {/* AI 配置 */}
          <div className="card-brutal">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-6 h-6 text-brutal-purple" />
              <h2 className="text-xl font-bold text-brutal-dark">AI 配置</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-brutal-dark font-semibold mb-2">Provider</label>
                <select
                  value={config.provider}
                  onChange={(e) => {
                    const next = e.target.value as AIConfig['provider'];
                    let nextModel = config.model;
                    if (next === 'openai') nextModel = 'gpt-3.5-turbo';
                    else if (next === 'claude') nextModel = 'claude-3-haiku-20240307';
                    else if (next === 'gemini') nextModel = 'gemini-1.5-pro';
                    else if (next === 'deepseek') nextModel = 'deepseek-chat';
                    else if (next === 'zhipu') nextModel = 'glm-4.6';
                    else nextModel = 'local-llm';
                    setConfig({ ...config, provider: next, model: nextModel });
                  }}
                  className="input-brutal w-full"
                >
                  <option value="openai">OpenAI</option>
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                  <option value="deepseek">deepseek</option>
                  <option value="zhipu">zhipu</option>
                  <option value="local">local</option>
                </select>
              </div>
              
              <div>
                <label className="block text-brutal-dark font-semibold mb-2">API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    placeholder="Enter your API Key (optional)"
                    className="input-brutal flex-1"
                  />
                  <button className="btn-brutal !px-4 !py-2" onClick={() => { setTempKey(config.apiKey); setShowKeyModal(true); }}>
                    <Key className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-brutal-dark font-semibold mb-2">Model</label>
                {modelLoading ? (
                  <div className="text-sm text-brutal-dark">加载模型列表...</div>
                ) : modelList.length > 0 ? (
                  <select
                    value={config.model}
                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                    className="input-brutal w-full"
                  >
                    {modelList.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={config.model}
                    onChange={(e) => setConfig({ ...config, model: e.target.value })}
                    className="input-brutal w-full"
                    placeholder="输入模型，例如 gemini-2.5-pro"
                  />
                )}
                {!!modelError && (
                  <p className="text-sm text-red-600 mt-2">{modelError}</p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-brutal-dark font-semibold mb-2">Temperature</label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={config.temperature}
                    onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <span className="text-sm text-brutal-dark">{config.temperature}</span>
                </div>
                
                <div>
                  <label className="block text-brutal-dark font-semibold mb-2">Token</label>
                  <input
                    type="number"
                    value={config.maxTokens}
                    onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) })}
                    className="input-brutal w-full"
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* 游戏设置 */}
          <div className="card-brutal">
            <div className="flex items-center gap-2 mb-4">
              <Save className="w-6 h-6 text-brutal-purple" />
              <h2 className="text-xl font-bold text-brutal-dark">存档管理</h2>
            </div>
            
            <div className="space-y-3">
              <button className="btn-brutal w-full">导出存档</button>
              <label className="btn-brutal w-full cursor-pointer inline-block text-center">
                <Upload className="w-4 h-4 inline mr-2" />
                导入存档
                <input type="file" className="hidden" accept=".json" />
              </label>
              <button 
                onClick={() => {
                  if (confirm('确定要清除所有存档吗？')) {
                    localStorage.clear();
                    alert('存档已清除');
                  }
                }}
                className="btn-brutal !bg-red-500 w-full"
              >
                清除存档
              </button>
            </div>
          </div>
          
          <div className="flex gap-4">
            <button onClick={saveConfig} className="btn-brutal flex-1">
              保存设置
            </button>
            <button onClick={testConnection} className="btn-brutal flex-1" disabled={testing}>
              <CheckCircle2 className="w-4 h-4 inline mr-2" /> {testing ? '测试中...' : '测试连接'}
            </button>
            <button onClick={startGame} className="btn-brutal flex-1" disabled={testing}>
              开始游玩
            </button>
          </div>
          {!!lastError && (
            <p className="mt-3 text-sm text-red-600">{lastError}</p>
          )}
          {!!lastSuccess && (
            <p className="mt-2 text-sm text-green-600">{lastSuccess}</p>
          )}
          <div className="mt-6">
            <button
              onClick={() => { localStorage.setItem('lastRoute', '/select'); window.location.href = '/select'; }}
              className="btn-brutal w-full"
            >
              返回角色选择页面
            </button>
          </div>
        </div>
      </div>
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="card-brutal w-[90%] max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-brutal-dark">API Key</h3>
              <button className="btn-brutal !px-3 !py-1" onClick={() => setShowKeyModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              placeholder="Enter your API Key (optional)"
              className="input-brutal w-full mb-4"
            />
            <div className="flex gap-3">
              <button className="btn-brutal flex-1" onClick={() => { setConfig({ ...config, apiKey: tempKey }); setShowKeyModal(false); }}>
                保存
              </button>
              <button className="btn-brutal !bg-gray-500 flex-1" onClick={() => setShowKeyModal(false)}>
                跳过
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
