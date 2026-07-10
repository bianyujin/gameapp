# Cloudflare Pages 部署指南（5分钟搞定）

## 第一步：注册 Cloudflare
1. 打开 https://dash.cloudflare.com/sign-up
2. 用邮箱注册（免费）

## 第二步：创建 Pages 项目
1. 登录后左侧菜单 → **Workers & Pages**
2. 点 **Create** → **Pages** → **Connect to Git**
3. 选择 GitHub → 授权 → 选择 `bianyujin/gameapp` 仓库
4. 构建设置：
   - Production branch: `main`
   - Build command: 留空
   - Build output directory: `/`（根目录）
5. 点 **Save and Deploy**

## 第三步：等待部署
- 首次部署约 2-3 分钟
- 部署完成后会得到一个地址，类似：`https://gameapp-xxxx.pages.dev`

## 第四步：更新 APP 配置
在 `D:\trae_project\gameapp_correct\config.json` 中：
```json
{
  "games_data_url": "https://gameapp-xxxx.pages.dev/games.json",
  "fallback_url": "https://cdn.jsdelivr.net/gh/bianyujin/gameapp@main/games.json"
}
```

## 第五步：推送配置
```bash
git add config.json
git commit -m "chore: 切换到Cloudflare Pages"
git push
```

## 完成！
- 以后每次 git push，Cloudflare 自动部署（约1分钟）
- 国内访问速度大幅提升
- `node sync.js` 不用改，照常用
