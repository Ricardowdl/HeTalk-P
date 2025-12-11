# 部署指南 (Deployment Guide)

本指南介绍如何手动将项目部署到 Ubuntu 云服务器。

## ⚠️ 重要前提：目录结构

本项目后端代码依赖于同级目录下的 `CharaEngineForST-main` 文件夹。在服务器上部署时，**必须**保持以下目录结构：

```text
/你的部署目录/
  ├── CharaEngineForST-main/  <-- 必须存在
  └── frontend/               <-- 本项目代码
```

如果缺少 `CharaEngineForST-main`，后端服务将无法启动或报错。

---

## 1. 环境准备

登录你的 Ubuntu 服务器，执行以下命令安装必要软件：

```bash
# 更新软件源
sudo apt update

# 安装 Git, Curl, Nginx, 构建工具
sudo apt install -y git curl nginx build-essential

# 安装 Node.js (推荐 v20.x)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 验证安装
node -v  # 应显示 v20.x.x
npm -v

# 全局安装 PM2 (用于进程管理)
sudo npm install -g pm2
```

## 2. 上传代码

你需要将 `frontend` 和 `CharaEngineForST-main` 两个文件夹上传到服务器。
假设你将它们放在 `/var/www/` 目录下。

### 方法 A：使用 Git (推荐)
如果在 Git 仓库中已经包含了这两个目录：
```bash
cd /var/www
git clone https://github.com/YourRepo/project-root.git
# 确保结构是:
# /var/www/project-root/frontend
# /var/www/project-root/CharaEngineForST-main
```

### 方法 B：使用 SCP/SFTP 上传
手动将本地文件夹上传到服务器的 `/var/www/` 目录。

## 3. 安装依赖与构建

进入 `frontend` 目录进行操作：

```bash
cd /var/www/frontend  # 根据实际路径调整

# 1. 安装项目依赖
npm install

# 2. 构建前端静态资源
npm run build
```

构建成功后，你会看到一个 `dist` 目录。

## 4. 配置环境变量

创建生产环境配置文件：

```bash
cp .env.example .env
# 或者直接编辑
nano .env
```

确保 `.env` 文件包含以下内容（根据实际情况填写 Key）：

```env
PORT=3001
NODE_ENV=production
OPENAI_API_KEY=sk-xxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxx
# 如果使用其他 AI 服务，也请在此添加对应的 KEY
```

## 5. 启动服务 (使用 PM2)

我们使用 PM2 来后台运行 Node.js 服务。

```bash
# 启动服务
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 设置开机自启
pm2 startup
pm2 save
```

如果服务启动失败，查看日志：
```bash
pm2 logs ai-story-game
```

## 6. 配置 Nginx (反向代理)

为了通过域名或 80 端口访问，我们需要配置 Nginx。

1. 创建配置文件：
```bash
sudo nano /etc/nginx/sites-available/ai-story-game
```

2. 填入以下内容（将 `your_domain_or_ip` 替换为你的域名或服务器公网 IP）：

```nginx
server {
    listen 80;
    server_name your_domain_or_ip;  # 例如: 123.45.67.89 或 game.example.com

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

3. 启用配置并重启 Nginx：

```bash
# 建立软链接
sudo ln -s /etc/nginx/sites-available/ai-story-game /etc/nginx/sites-enabled/

# 删除默认配置 (如果有)
sudo rm /etc/nginx/sites-enabled/default

# 测试配置是否正确
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

## 7. 访问

现在，你可以在浏览器中输入 `http://你的IP` 或 `http://你的域名` 来访问项目了。

---

## 常用维护命令

- **重启服务**: `pm2 restart ai-story-game`
- **查看日志**: `pm2 logs`
- **停止服务**: `pm2 stop ai-story-game`
- **更新代码**:
  1. `git pull`
  2. `npm install` (如果有新依赖)
  3. `npm run build` (如果前端有修改)
  4. `pm2 restart ai-story-game`
