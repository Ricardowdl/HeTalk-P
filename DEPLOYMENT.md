# 部署指南 (Deployment Guide)

本指南介绍如何将该项目部署到你自己的云服务器（如阿里云、腾讯云、AWS 等）。

## 1. 准备工作

确保你的服务器已安装：
*   **Node.js** (推荐 v18 或更高版本)
*   **Git**

## 2. 获取代码

在服务器上克隆你的仓库：

```bash
git clone https://github.com/YourUsername/YourRepo.git
cd YourRepo
```

## 3. 安装依赖与构建

```bash
# 安装依赖
npm install

# 构建前端
npm run build
```

构建完成后，会生成 `dist` 目录，里面包含了编译后的前端静态文件。

## 4. 配置环境变量

复制 `.env` 文件并填入你的 API Key：

```bash
# Linux/Mac
cp .env.example .env

# Windows
copy .env.example .env
```

或者直接创建 `.env` 文件：

```env
PORT=3001
OPENAI_API_KEY=sk-xxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxx
NODE_ENV=production
PM2_USAGE=true
```

## 5. 启动服务

### 方式一：直接启动 (测试用)

```bash
npm start
```
(注意：你需要先在 package.json 中添加 `"start": "tsx api/server.ts"` 脚本，或者直接运行 `npx tsx api/server.ts`)

### 方式二：使用 PM2 (生产环境推荐)

PM2 是一个强大的 Node.js 进程管理工具，支持后台运行、自动重启、日志管理。

1.  全局安装 PM2：
    ```bash
    npm install -g pm2
    ```

2.  启动应用：
    ```bash
    pm2 start ecosystem.config.js
    ```

3.  查看状态：
    ```bash
    pm2 status
    pm2 logs
    ```

## 6. 配置 Nginx (可选，推荐)

如果你想通过域名访问（如 `http://game.example.com`），建议使用 Nginx 反向代理。

Nginx 配置文件示例：

```nginx
server {
    listen 80;
    server_name game.example.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 常见问题

*   **构建失败？** 检查服务器内存是否足够（Vite 构建较吃内存）。
*   **API 404？** 确保后端服务已启动，并且 Nginx 配置正确转发了请求。
