const CloudSync = {
    config: {
        notionToken: '',
        notionDatabaseId: '',
        notionCsvUrl: '',
        notionEmbedUrl: '',
        firebaseConfig: { databaseURL: 'https://galgame-a5758-default-rtdb.asia-southeast1.firebasedatabase.app' },
        configSource: 'github',
        githubConfigUrl: '',
        syncProvider: 'github',
        autoSync: false,
        lastSync: null,
        useCorsProxy: true,
        corsProxyUrl: 'https://corsproxy.io/?',
        appVersion: '2.0.0',
        latestVersion: null,
        updateUrl: null,
        cloudAdminPassword: null,
        gamesDataUrl: null,
        gamesDataVersion: null,
        localDataVersion: null
    },
    db: null,
    isInitialized: false,

    init() {
        this.loadConfig();
        this.bindEvents();
    },

    loadConfig() {
        try {
            const t = Storage.getItem('gamehub_cloud_config');
            if (t) this.config = { ...this.config, ...JSON.parse(t) };
            this.config.localDataVersion = Storage.getItem('gamehub_local_data_version') || null;
        } catch(e) { console.log('loadConfig跳过（存储不可用）'); }
    },

    saveLocalDataVersion(t) {
        this.config.localDataVersion = t;
        try { Storage.setItem('gamehub_local_data_version', t); } catch(e) {}
    },

    saveConfig() {
        try { Storage.setItem('gamehub_cloud_config', JSON.stringify(this.config)); } catch(e) {}
    },

    bindEvents() {
        window.addEventListener('online', () => { this.config.autoSync && this.sync(); });
    },

    getProxyUrl(t) {
        return this.config.useCorsProxy && this.config.corsProxyUrl ? this.config.corsProxyUrl + encodeURIComponent(t) : t;
    },

    // 从云端同步主数据（games.json 格式已正确，直接复用）
    async syncFromCloud() {
        App.showToast('同步中...');
        console.log('=== syncFromCloud开始 ===');
        await this.loadCloudConfig();
        if (!this.config.gamesDataUrl) throw new Error('请先在config.json中配置games_data_url');
        try {
            console.log('开始同步游戏数据...');
            await this.syncFromGamesJson();
            console.log('同步成功!');
            console.log('=== 同步完成 ===');
        } catch(t) {
            console.error('同步失败:', t);
            App.showToast('同步失败: ' + t.message);
        }
    },

    async syncFromGamesJson() {
        console.log('同步数据...');
        let t = this.config.gamesDataUrl;
        if (!t) throw new Error('games_data_url未配置');
        const urls = [t];
        if (this.config.fallbackUrl && this.config.fallbackUrl !== t) urls.push(this.config.fallbackUrl);
        let lastErr = null;
        for (const url of urls) {
            console.log('尝试:', url.substring(0, 60) + '...');
            try { return await this._fetchAndProcess(url); }
            catch(err) { console.log('失败:', err.message); lastErr = err; }
        }
        throw lastErr || new Error('所有数据源均失败');
    },

    async _fetchAndProcess(url) {
        console.log('请求URL:', url);
        let res = null;
        for (let i = 1; i <= 3; i++) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 30000);
            try {
                const noCacheUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
                res = await fetch(noCacheUrl, { signal: ctrl.signal, cache: 'no-cache' });
                clearTimeout(timer);
                if (res.ok) break;
                console.log(`第${i}次请求失败: ${res.status}`);
            } catch(err) {
                clearTimeout(timer);
                console.log(`第${i}次请求失败: ${err.message}`);
                if (i < 3) { console.log(`${i}秒后重试...`); await new Promise(r => setTimeout(r, 2000 * i)); }
            }
        }
        if (!res || !res.ok) throw new Error('数据下载失败，请检查网络连接');
        console.log('响应状态:', res.status);
        const text = await res.text();
        console.log('响应内容前200字符:', text.substring(0, 200));
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) throw new Error('返回的是HTML页面，不是JSON数据');
        let data;
        try { data = JSON.parse(text); }
        catch(err) { console.error('JSON解析失败:', err); throw new Error('JSON解析失败'); }

        let games;
        if (Array.isArray(data)) {
            // 数据已经是标准格式，直接复用，不再转换
            games = data.map(g => this.ensureGameStructure(g));
        } else {
            games = Object.values(data).map(g => this.ensureGameStructure(g));
        }

        // 统一字段（保持 sync-notion.js 的排序）
        this.normalizeAllFields(games);
        App.games = games;
        App._userSorted = false;
        App.nextId = games.length + 1;
        App.saveData();
        App.render();
        if (App._coverEnabled) setTimeout(() => App.preloadCoverUrls(), 500);
        this.saveLocalDataVersion(this.config.gamesDataVersion);
        this.config.lastSync = Date.now();
        this.saveConfig();
        App.showToast('同步成功');
    },

    // 确保游戏对象有标准结构，不破坏已有字段
    ensureGameStructure(g) {
        if (!g) return null;
        return {
            id: g.id || Date.now() + Math.random(),
            icon: g.icon || '🎮',
            category: g.category || '其他',
            rating: typeof g.rating === 'number' ? g.rating : 0,
            downloads: g.downloads || '-',
            description: g.description || '',
            updateDate: g.updateDate ? new Date(g.updateDate) : new Date(),
            isFavorite: !!g.isFavorite,
            _rawFields: g._rawFields || Object.keys(g._rawData || {}),
            _rawData: g._rawData || {},
            privateData: g.privateData || {},
            title: g.title || '未命名',
            coverUrls: g.coverUrls || []
        };
    },

    normalizeAllFields(games) {
        const FIELD_ORDER = [
            '文件ID',
            '百度', '迅雷', 'UC', '夸克', '预览',
            '备注',
            '排雷/评价/攻略',
            '评级',
            '成品级别',
            '剧情',
            '画风',
            '游戏性',
            '内容cg',
            'CV质量',
            '修正分',
            '最后修改时间',
            '创建时间',
            'DL号'
        ];
        const all = new Set();
        games.forEach(g => { g._rawFields && g._rawFields.forEach(f => all.add(f)); });
        const fields = Array.from(all).sort((a, b) => {
            const ka = FIELD_ORDER.findIndex(k => a.includes(k));
            const kb = FIELD_ORDER.findIndex(k => b.includes(k));
            const ia = ka >= 0 ? ka : 999;
            const ib = kb >= 0 ? kb : 999;
            return ia - ib;
        });
        try { Storage.setItem('gamehub_field_order', JSON.stringify(fields)); } catch(e) {}
        games.forEach(g => {
            g._rawFields = [...fields];
            g._rawData = g._rawData || {};
            fields.forEach(f => { if (!g._rawData.hasOwnProperty(f)) g._rawData[f] = ''; });
        });
        App.globalFields = fields;
        console.log('字段顺序:', fields);
        return fields;
    },

    saveFieldOrder(fields) {
        try { Storage.setItem('gamehub_field_order', JSON.stringify(fields)); } catch(e) {}
        App.globalFields = fields;
        App.games.forEach(g => { g._rawFields = [...fields]; });
        App.saveData();
    },

    async loadCloudConfig(force = false) {
        console.log('尝试从config.json加载配置...');
        const fallback = 'https://cdn.jsdelivr.net/gh/bianyujin/gameapp@main/games.json';
        try {
            const t = await fetch('config.json?t=' + Date.now(), { cache: 'no-cache' });
            if (t.ok) {
                const o = await t.json();
                this.config.latestVersion = o.latest_version || '';
                this.config.updateUrl = o.update_url || '';
                this.config.cloudAdminPassword = o.admin_password || '';
                this.config.gamesDataUrl = o.games_data_url || fallback;
                this.config.gamesDataVersion = o.games_data_version || '';
                this.config.notionEmbedUrl = o.notion_embed_url || '';
                this.config.fallbackUrl = o.fallback_url || fallback;
                console.log('从config.json加载成功');
            } else {
                this.config.gamesDataUrl = fallback;
            }
        } catch(e) {
            console.log('加载config.json失败，使用备用URL');
            this.config.gamesDataUrl = fallback;
        }
        this.saveConfig();
        return true;
    },

    async checkVersionUpdate() {
        await this.loadCloudConfig();
        if (this.config.latestVersion && this.config.appVersion !== this.config.latestVersion) {
            return { needsUpdate: true, latestVersion: this.config.latestVersion, updateUrl: this.config.updateUrl };
        }
        return { needsUpdate: false };
    },

    async verifyAdminPassword(pwd) {
        await this.loadCloudConfig(true);
        if (this.config.cloudAdminPassword) return pwd === this.config.cloudAdminPassword;
        return '520hd123' === pwd;
    }
};

document.addEventListener('DOMContentLoaded', () => CloudSync.init());
