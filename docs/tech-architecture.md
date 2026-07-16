# GAMEACG 技术架构文档

## 1. 架构设计

```
┌──────────────────────────────────────────────────────────┐
│                      用户设备                              │
│                                                           │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐      │
│  │  PWA     │  │  Android │  │   浏览器直连         │      │
│  │ (安装版)  │  │  APK     │  │   (无需安装)         │      │
│  └────┬─────┘  └────┬─────┘  └────────┬───────────┘      │
│       └──────────────┼─────────────────┘                 │
│                      ▼                                     │
│            ┌──────────────────┐                           │
│            │  应用代码 (静态)    │                           │
│            │  HTML/CSS/JS     │                           │
│            │  Service Worker  │                           │
│            └────────┬─────────┘                           │
│                     ▼                                      │
│         ┌──────────────────────┐                          │
│         │  jsDelivr CDN         │ ← 用户只跟CDN交互        │
│         │  games.json (只读)    │   完全不知道Notion存在     │
│         └──────────────────────┘                          │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                   自动化同步层                              │
│                    (GitHub Actions)                        │
│                                                           │
│  定时触发(每30min) / 手动触发                               │
│         │                                                 │
│         ▼                                                 │
│  ┌─────────────┐    转换     ┌──────────────┐             │
│  │ Notion API  │ ─────────→ │  games.json   │             │
│  │ (读取数据库) │            │  (标准化格式)  │             │
│  └─────────────┘            └──────┬───────┘             │
│                                    │                      │
│                                    ▼                      │
│                           Git Push + Create Release       │
│                                    │                      │
│                                    ▼                      │
│                         jsDelivr 自动缓存新版本            │
└──────────────────────────────────────────────────────────┘
```

## 2. 技术选型

| 层面 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 前端框架 | 原生 HTML/CSS/JS (ES6+) | - | 零依赖，轻量快速 |
| CSS方案 | 原生CSS + CSS变量 | - | 深色主题，自定义属性 |
| PWA | Manifest + Service Worker | - | 可离线缓存，可安装到桌面 |
| Android打包 | Capacitor 6.0 | ^6.0.0 | 内置签名，无需手动配置keystore |
| 数据格式 | JSON | - | games.json 存储所有游戏数据 |
| **自动化** | **GitHub Actions** | - | **定时从Notion API拉取数据→生成JSON→发布Release** |
| 数据托管 | GitHub | - | 免费仓库 + Release分发 |
| CDN加速 | jsDelivr | - | 免费GitHub文件CDN，国内可访问 |
| 备用数据库 | Firebase Realtime Database | 免费版 | 亚太区域节点 |
| 图片API | Lolicon API / 备用随机图API | - | 首页随机二次元壁纸 |

## 3. 项目结构

```
app/
├── index.html              # 主页面（SPA单页应用）
├── manifest.json           # PWA配置
├── sw.js                   # Service Worker
├── config.json             # 应用配置（CDN URL/版本/密码）
├── games.json              # 本地默认数据（会被云端覆盖）
├── package.json            # npm配置（Capacitor）
├── capacitor.config.json   # Capacitor配置
├── css/
│   └── styles.css          # 全部样式
├── js/
│   ├── app.js              # 核心应用逻辑
│   ├── cloud-sync.js       # 云端同步（CDN/Firebase/本地缓存）
│   ├── admin.js            # 管理员系统
│   └── review.js           # 评论系统
├── icons/                  # PWA图标
├── .github/
│   └── workflows/
│       └── sync-notion.yml # ★ GitHub Actions：Notion→JSON自动同步
└── scripts/
    ├── build.js            # 构建脚本
    └── init-capacitor.js   # Capacitor初始化
```

## 4. 路由定义（SPA页面切换）

| 路由ID | 页面名称 | 入口方式 |
|--------|----------|----------|
| `home` | 首页 | 底部导航"首页" |
| `table` | 数据列表 | 底部导航"数据" |
| `profile` | 个人中心 | 底部导航"我的" |

*注：详情查看通过 Modal 弹窗实现；已移除 `notion` 内嵌页面*

## 5. API 与数据接口

### 5.1 config.json 配置

```json
{
  "latest_version": "2.0.0",
  "update_url": "网盘APK下载链接",
  "admin_password": "管理员密码",
  "games_data_url": "jsDelivr CDN的games.json地址",
  "games_data_version": "数据版本号"
}
```

*注意：已移除 notion_embed_url，不再向用户暴露 Notion 链接*

### 5.2 games.json 数据结构

```json
[
  {
    "id": 1,
    "title": "游戏名称",
    "icon": "🎮",
    "category": "分类",
    "rating": 4.5,
    "description": "简介",
    "updateDate": "2026-01-01T00:00:00.000Z",
    "_rawFields": ["文件ID", "类型", "游戏名", "备注", "百度", "迅雷", "UC", "预览", "排雷|评价", "评级", "攻略", "DL号|社团|作者", ...],
    "_rawData": {
      "文件ID": "xxx",
      "类型": "Galgame",
      "游戏名": "示例游戏",
      "备注": "",
      "百度": "https://pan.baidu.com/s/xxx",
      "迅雷": "magnet:?xt=...",
      "UC": "https://www.example.com/download",
      "预览": "https://img.example.com/preview.jpg",
      "排雷|评价": "剧情不错，值得玩",
      "评级": "S",
      "攻略": "https://www.example.com/walkthrough",
      "DL号|社团|作者": "RJ123456 / 社团名 / 作者名",
      ...
    }
  }
]
```

### 5.3 同步流程

```
App启动/用户点击同步
    ↓
GET {config.games_data_url} (jsDelivr CDN)
    ↓
对比 games_data_version 与本地 localStorage 版本
    ↓ 不同
解析 JSON → mapGameFields() → normalizeAllFields()
    ↓
存入 localStorage → 重新渲染 UI
    ↓
保存本地版本号 → 提示"同步成功"
```

## 6. 自动化工作流（GitHub Actions）

### 6.1 sync-notion.yml 工作流

```yaml
# 触发方式：
# 1. 定时触发：每30分钟（UTC 0-9点，对应北京时间8-17点，覆盖活跃时段）
# 2. 手动触发：管理员在GitHub仓库页面点"Run workflow"
# 3. Webhook触发（可选）：Notion变更时通过Make.com/Zapier触发

# 执行步骤：
# 1. 使用 NOTION_TOKEN 调用 Notion API 查询数据库
# 2. 将返回的数据转换为标准化 games.json 格式
# 3. 提交到仓库 + 创建 GitHub Release（触发版本号变更）
# 4. jsDelivr CDN 自动缓存新版本
```

### 6.2 所需 Secrets 配置

| Secret名称 | 说明 | 获取方式 |
|------------|------|----------|
| `NOTION_TOKEN` | Notion Integration Token | Notion → Integrations → 创建 |
| `NOTION_DATABASE_ID` | Notion 数据库 ID | Notion 数据库 URL 中提取 |
| `GH_PAT` | GitHub Personal Access Token | GitHub → Settings → Developer settings |

### 6.3 管理员的日常操作

```
打开 Notion 表格（网页版）
    ↓
直接编辑/新增/修改/删除 行
    ↓
保存（什么都不用做！）
    ↓
最多等待30分钟，GitHub Actions 自动同步
    ↓ （或立即）
去 GitHub 仓库 → Actions → sync-notion → Run workflow 手动触发
    ↓
用户端 App 自动检测到新数据 → 同步即可
```

## 7. 数据模型

### 7.1 字段映射（Notion属性 → App字段）

| Notion 列名 | App 字段 | 类型 | UI展示 |
|-------------|----------|------|--------|
| 标题/游戏名/Name | title | 文本 | 详情顶部标题 |
| 图标/Icon | icon | 文本 | 游戏卡片图标 |
| 类型/分类/Category | category | 选择标签 | 分类筛选 |
| 评分/Rating | rating | 数字 | 星级评分展示 |
| 介绍/描述/Description | description | 文本 | 简介区域 |
| 社团/开发商/Developer | developer | 文本 | 自定义字段区 |
| 评价/Review | review | 文本 | 自定义字段区 |
| 封面/Cover | cover | 文本 | 自定义字段区 |
| 百度网盘 | _rawData.百度 | 文本 | **仅可复制** |
| 迅雷 | _rawData.迅雷 | 文本 | **仅可复制** |
| UC网盘 | _rawData.UC | 文本 | **仅可复制** |
| 攻略 | _rawData.攻略 | 文本 | **仅可复制** |
| DL号/社团/作者 | _rawData.DL号\|社团\|作者 | 文本 | **仅可复制** |
| 其他任意列 | _rawData.{列名} | 文本 | **仅可复制** |

### 7.2 localStorage 键名规范

| 键名 | 类型 | 说明 |
|------|------|------|
| `gamehub_games` | JSON Array | 游戏数据缓存 |
| `gamehub_nextId` | Number | 下一个自增ID |
| `gamehub_dark_mode` | Boolean | 深色模式开关 |
| `gamehub_cloud_config` | JSON Object | 云同步配置 |
| `gamehub_local_data_version` | String | 本地数据版本号 |
| `gamehub_last_sync_time` | Number | 上次同步时间戳 |
| `gamehub_has_synced` | Boolean | 是否已同步过 |
| `gamehub_field_order` | JSON Array | 字段显示顺序 |
| `gamehub_is_admin` | Boolean | 管理员登录状态 |
| `gamehub_current_user` | JSON Object | 当前登录用户 |
| `gamehub_cached_games` | JSON Array | 离线备份数据 |

## 8. 安全设计

### 8.1 链接保护机制
- 所有 `_rawData` 中的字段值以纯文本形式展示
- 每个字段旁有"复制"按钮，点击后复制到剪贴板
- **不使用 `<a>` 标签**，**不使用 `window.open()`**，**不使用 `location.href`**
- 即使字段值包含 URL，也仅为纯文本显示

### 8.2 数据隔离
- Notion API Token 仅存储在 GitHub Secrets 中，不出现在代码里
- 用户端完全不知道数据来源于 Notion
- config.json 中不包含任何 Notion 相关 URL 或 Token

## 9. 部署架构

### 9.1 在线访问（推荐）
```
用户浏览器 → jsDelivr CDN (index.html + games.json)
                ↓ 缓存
         Service Worker 离线存储
```

### 9.2 APK 安装（Android）
```
Capacitor 构建:
  index.html + 静态资源 → Android WebView → signed APK
```

### 9.3 PWA 安装（全平台）
```
浏览器打开 → manifest.json → "添加到主屏幕" → PWA图标
```
