# AI 文字游戏部署指南

## 快速开始

### 本地开发
```bash
npm install
npm run dev
```

### 环境变量配置
创建 `.env` 文件：
```
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_claude_key
GOOGLE_API_KEY=your_gemini_key
DEEPSEEK_API_KEY=your_deepseek_key
ZHIPU_API_KEY=your_zhipu_key
```

## Vercel 部署

1. 连接 GitHub 仓库到 Vercel
2. 在 Vercel 控制台添加环境变量：
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `GOOGLE_API_KEY`
   - `DEEPSEEK_API_KEY`
   - `ZHIPU_API_KEY`
3. 自动部署

## 自建服务器部署

### 1. 构建项目
```bash
npm run build
```

### 2. 安装依赖
```bash
npm install --production
```

### 3. 启动服务
```bash
# 开发模式
npm run server:dev

# 生产模式
npm run server:prod
```

### 4. Nginx 配置示例
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 5. PM2 进程管理
```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start api/server.ts --name "ai-story-game"

# 保存配置
pm2 save
pm2 startup
```

## 功能特性

- ✅ 无需注册即可游玩
- ✅ 双角色剧情线
- ✅ AI 故事生成
- ✅ 本地存储存档
- ✅ 自定义 AI 配置
- ✅ 响应式设计
- ✅ 新粗野主义 UI

## 技术栈

- 前端：React + TypeScript + Tailwind CSS
- 后端：Express + TypeScript
- 状态管理：Zustand
- AI 集成：OpenAI API + Claude API + Gemini API + DeepSeek API + Zhipu GLM API
- 部署：Vercel / 自建服务器
