import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Upload } from 'lucide-react';

const characters = [
  {
    id: 'chennuo',
    name: '陈诺',
    subtitle: '广告创意总监 · 敏感细腻',
    description: '30岁，敏感细腻，对青春怀有温柔的遗憾。故事主视角，成年人的克制与温柔贯穿始终。',
    bgGradient: 'from-brutal-purple to-brutal-dark',
  },
  {
    id: 'linzhe',
    name: '林哲',
    subtitle: '室内设计师 · 隐忍守护',
    description: '30岁，表面洒脱，内心隐忍。九年的秘密与守护，是城市光影下最安静的情感。',
    bgGradient: 'from-brutal-dark to-black',
  },
];

export default function CharacterSelect() {
  const navigate = useNavigate();
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [uploadMsg, setUploadMsg] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({});

  useEffect(() => {
    const connected = localStorage.getItem('apiConnected') === 'true';
    const configured = localStorage.getItem('apiConfigured') === 'true';
    if (!connected && !configured) {
      navigate('/');
      return;
    }
    localStorage.setItem('lastRoute', '/select');
    const map: Record<string, string> = {};
    characters.forEach((c) => {
      const v = localStorage.getItem(`avatar_${c.id}`) || '';
      if (v) map[c.id] = v;
    });
    setAvatars(map);
  }, []);

  const selectCharacter = (id: string) => {
    localStorage.setItem('selectedCharacter', id);
    navigate('/game');
  };


  const handleUpload = (charId: string, file: File | null) => {
    if (!file) return;
    const isValidType = ['image/jpeg', 'image/png'].includes(file.type);
    const isValidSize = file.size <= 2 * 1024 * 1024;
    if (!isValidType || !isValidSize) {
      alert('仅支持 JPG/PNG，大小≤2MB，推荐1:1比例，至少512×512');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const w = img.width;
        const h = img.height;
        const minSizeOk = w >= 512 && h >= 512;
        const ratio = w / h;
        const isSquareish = ratio > 0.9 && ratio < 1.1;
        if (!minSizeOk || !isSquareish) {
          setUploadMsg((m) => ({ ...m, [charId]: { type: 'error', text: '建议1:1比例且≥512×512' } }));
          return;
        }
        localStorage.setItem(`avatar_${charId}`, src);
        setAvatars((prev) => ({ ...prev, [charId]: src }));
        const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';
        fetch(`${API_BASE}/upload-avatar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characterId: charId, imageData: src })
        }).then(async (res) => {
          if (res.ok) {
            setUploadMsg((m) => ({ ...m, [charId]: { type: 'success', text: '上传成功（推荐1:1且≥512×512，≤2MB）' } }));
          } else {
            const data = await res.json().catch(() => ({}));
            const reason = typeof data?.error === 'string' ? data.error : '上传失败';
            setUploadMsg((m) => ({ ...m, [charId]: { type: 'error', text: reason } }));
          }
        }).catch((e) => {
          setUploadMsg((m) => ({ ...m, [charId]: { type: 'error', text: `上传失败：${String(e?.message || '网络错误')}` } }));
        });
      };
      img.onerror = () => {
        setUploadMsg((m) => ({ ...m, [charId]: { type: 'error', text: '图片读取失败，请重试' } }));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-brutal-light p-4">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-black text-brutal-dark">时光电台</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/settings')} className="btn-brutal !px-4 !py-2">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
        <h1 className="text-5xl font-black text-center mb-4 text-brutal-dark">
          选择你的命运
        </h1>
        <p className="text-center text-brutal-dark mb-12 text-lg">
          支持上传人物图片：JPG/PNG，推荐1:1，至少512×512，≤2MB
        </p>
        <div className="grid md:grid-cols-2 gap-8">
          {characters.map((char) => (
            <div
              key={char.id}
              className="card-brutal hover:shadow-brutalHover transition-all"
            >
              <div className={`h-48 bg-gradient-to-br ${char.bgGradient} mb-4 relative flex items-center justify-center`}>
                {avatars[char.id] ? (
                  <img src={avatars[char.id]} alt={char.name} className="h-40 w-40 object-cover border-4 border-black" />
                ) : (
                  <div className="text-white text-sm">未上传人物图片</div>
                )}
              </div>
              <h2 className="text-3xl font-bold text-brutal-dark mb-2">
                {char.name}
              </h2>
              <p className="text-brutal-purple font-semibold mb-3">
                {char.subtitle}
              </p>
              <p className="text-brutal-dark leading-relaxed">
                {char.description}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <label className="btn-brutal w-full cursor-pointer inline-block text-center">
                  <Upload className="w-4 h-4 inline mr-2" />上传图片
                  <input
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg"
                    onChange={(e) => handleUpload(char.id, e.target.files?.[0] || null)}
                  />
                </label>
                <p className="text-xs text-brutal-dark">JPG/PNG，推荐1:1，至少512×512，≤2MB</p>
                {uploadMsg[char.id] && (
                  <p className={`text-sm ${uploadMsg[char.id].type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{uploadMsg[char.id].text}</p>
                )}
                <button className="btn-brutal w-full" onClick={() => selectCharacter(char.id)}>进入故事</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
