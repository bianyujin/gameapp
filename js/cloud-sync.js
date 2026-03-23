const CloudSync = {
    config: {
        notionToken: '',
        notionDatabaseId: '',
        firebaseConfig: null,
        syncProvider: 'local',
        autoSync: false,
        lastSync: null,
        useCorsProxy: true,
        corsProxyUrl: 'https://corsproxy.io/?'
    },

    db: null,
    isInitialized: false,

    init() {
        this.loadConfig();
        this.bindEvents();
    },

    loadConfig() {
        const saved = localStorage.getItem('gamehub_cloud_config');
        if (saved) {
            this.config = { ...this.config, ...JSON.parse(saved) };
        }
    },

    saveConfig() {
        localStorage.setItem('gamehub_cloud_config', JSON.stringify(this.config));
    },

    bindEvents() {
        window.addEventListener('online', () => {
            if (this.config.autoSync) {
                this.sync();
            }
        });
    },

    getProxyUrl(url) {
        if (this.config.useCorsProxy && this.config.corsProxyUrl) {
            return this.config.corsProxyUrl + encodeURIComponent(url);
        }
        return url;
    },

    async testNotion() {
        const token = document.getElementById('notionToken').value;
        const dbId = document.getElementById('notionDatabaseId').value;

        if (!token || !dbId) {
            App.showToast('请填写Token和数据库ID');
            return;
        }

        App.showToast('正在测试连接...');

        try {
            const baseUrl = `https://api.notion.com/v1/databases/${dbId}`;
            const url = this.getProxyUrl(baseUrl);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                App.showToast(`✅ 连接成功！数据库: ${data.title?.[0]?.plain_text || '未命名'}`);
            } else {
                const error = await response.json();
                App.showToast('❌ 连接失败：' + (error.message || '请检查Token和数据库ID'));
            }
        } catch (e) {
            console.error('测试失败:', e);
            App.showToast('❌ 连接失败：' + e.message);
        }
    },

    openSettingsModal() {
        const modalHtml = `
            <div id="cloudSettingsModal" class="modal">
                <div class="modal-backdrop" onclick="CloudSync.closeSettingsModal()"></div>
                <div class="modal-content cloud-settings-modal">
                    <div class="modal-header">
                        <h3 class="modal-title">☁️ 云端同步设置</h3>
                        <button class="close-btn" onclick="CloudSync.closeSettingsModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="cloud-provider-tabs">
                            <button class="provider-tab ${this.config.syncProvider === 'local' ? 'active' : ''}" 
                                    onclick="CloudSync.switchProvider('local')">
                                💾 本地存储
                            </button>
                            <button class="provider-tab ${this.config.syncProvider === 'notion' ? 'active' : ''}"
                                    onclick="CloudSync.switchProvider('notion')">
                                📝 Notion
                            </button>
                            <button class="provider-tab ${this.config.syncProvider === 'firebase' ? 'active' : ''}"
                                    onclick="CloudSync.switchProvider('firebase')">
                                🔥 Firebase
                            </button>
                        </div>

                        <div id="localProvider" class="provider-content ${this.config.syncProvider !== 'local' ? 'hidden' : ''}">
                            <div class="info-card">
                                <p>数据存储在浏览器本地，关闭浏览器后数据不会丢失。</p>
                                <p class="info-warning">⚠️ 清除浏览器数据会导致数据丢失</p>
                            </div>
                        </div>

                        <div id="notionProvider" class="provider-content ${this.config.syncProvider !== 'notion' ? 'hidden' : ''}">
                            <div class="form-group">
                                <label class="form-label">Notion Integration Token</label>
                                <input type="password" id="notionToken" class="form-input" 
                                       value="${this.config.notionToken}"
                                       placeholder="secret_xxxxxxxxxxxxxxxx">
                                <p class="form-hint">
                                    <a href="https://www.notion.so/my-integrations" target="_blank">获取Token</a> | 
                                    <a href="javascript:CloudSync.showNotionHelp()">使用帮助</a>
                                </p>
                            </div>
                            <div class="form-group">
                                <label class="form-label">数据库ID</label>
                                <input type="text" id="notionDatabaseId" class="form-input"
                                       value="${this.config.notionDatabaseId}"
                                       placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
                                <p class="form-hint">从Notion数据库URL中获取</p>
                            </div>
                            <button class="btn btn-secondary" onclick="CloudSync.testNotion()">测试连接</button>
                        </div>

                        <div id="firebaseProvider" class="provider-content ${this.config.syncProvider !== 'firebase' ? 'hidden' : ''}">
                            <div class="form-group">
                                <label class="form-label">Firebase数据库URL（快速配置）</label>
                                <input type="text" id="firebaseUrl" class="form-input"
                                       value="${this.config.firebaseConfig?.databaseURL || localStorage.getItem('gamehub_firebase_url') || ''}"
                                       placeholder="https://your-project.firebaseio.com">
                                <p class="form-hint">只需输入数据库URL即可读取数据</p>
                            </div>
                            <div class="form-group">
                                <label class="form-label">完整Firebase配置（可选）</label>
                                <textarea id="firebaseConfig" class="form-textarea" rows="6"
                                          placeholder='{
  "apiKey": "xxx",
  "authDomain": "xxx.firebaseapp.com",
  "databaseURL": "https://xxx.firebaseio.com",
  "projectId": "xxx"
}'>${this.config.firebaseConfig ? JSON.stringify(this.config.firebaseConfig, null, 2) : ''}</textarea>
                                <p class="form-hint">
                                    <a href="https://console.firebase.google.com" target="_blank">Firebase控制台</a> |
                                    <a href="javascript:CloudSync.showFirebaseHelp()">使用帮助</a>
                                </p>
                            </div>
                            <button class="btn btn-secondary" onclick="CloudSync.testFirebase()">测试连接</button>
                            <button class="btn btn-primary" onclick="CloudSync.loadFromFirebaseUrl()">从URL加载数据</button>
                        </div>

                        <div class="sync-options">
                            <label class="sync-option">
                                <input type="checkbox" id="autoSync" ${this.config.autoSync ? 'checked' : ''}>
                                <span>自动同步</span>
                            </label>
                            <p class="sync-hint">开启后，数据变更时自动同步到云端</p>
                        </div>

                        ${this.config.lastSync ? `
                            <div class="last-sync-info">
                                上次同步：${new Date(this.config.lastSync).toLocaleString()}
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="CloudSync.closeSettingsModal()">取消</button>
                        <button class="btn btn-primary" onclick="CloudSync.saveSettings()">保存设置</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    closeSettingsModal() {
        const modal = document.getElementById('cloudSettingsModal');
        if (modal) modal.remove();
    },

    switchProvider(provider) {
        this.config.syncProvider = provider;
        
        document.querySelectorAll('.provider-tab').forEach(tab => {
            tab.classList.toggle('active', tab.textContent.toLowerCase().includes(provider));
        });
        
        document.getElementById('localProvider').classList.toggle('hidden', provider !== 'local');
        document.getElementById('notionProvider').classList.toggle('hidden', provider !== 'notion');
        document.getElementById('firebaseProvider').classList.toggle('hidden', provider !== 'firebase');
    },

    saveSettings() {
        this.config.syncProvider = document.querySelector('.provider-tab.active')?.textContent.toLowerCase().includes('notion') ? 'notion' :
                                   document.querySelector('.provider-tab.active')?.textContent.toLowerCase().includes('firebase') ? 'firebase' : 'local';
        
        this.config.notionToken = document.getElementById('notionToken')?.value || '';
        this.config.notionDatabaseId = document.getElementById('notionDatabaseId')?.value || '';
        this.config.autoSync = document.getElementById('autoSync')?.checked || false;

        const firebaseUrl = document.getElementById('firebaseUrl')?.value;
        const firebaseConfigStr = document.getElementById('firebaseConfig')?.value;
        
        if (firebaseUrl) {
            this.config.firebaseConfig = { databaseURL: firebaseUrl };
            localStorage.setItem('gamehub_firebase_url', firebaseUrl);
        } else if (firebaseConfigStr) {
            try {
                this.config.firebaseConfig = JSON.parse(firebaseConfigStr);
            } catch (e) {
                App.showToast('Firebase配置格式错误');
                return;
            }
        }

        this.saveConfig();
        this.closeSettingsModal();
        App.showToast('设置已保存');

        if (this.config.autoSync && this.config.syncProvider !== 'local') {
            this.sync();
        }
    },

    async loadFromFirebaseUrl() {
        const url = document.getElementById('firebaseUrl')?.value?.trim();
        if (!url) {
            App.showToast('请输入Firebase数据库URL');
            return;
        }

        App.showToast('正在加载数据...');

        try {
            const response = await fetch(`${url}/games.json`);
            const data = await response.json();
            
            if (data) {
                const rawGames = Object.values(data);
                const games = rawGames.map(g => this.mapGameFields(g));
                this.normalizeAllFields(games);
                App.games = games;
                App.nextId = games.length + 1;
                App.saveData();
                App.render();
                
                this.config.firebaseConfig = { databaseURL: url };
                this.config.lastSync = Date.now();
                this.saveConfig();
                localStorage.setItem('gamehub_firebase_url', url);
                
                App.showToast(`✅ 已加载 ${games.length} 条数据`);
            } else {
                App.showToast('❌ 未找到数据');
            }
        } catch (e) {
            App.showToast('❌ 加载失败：' + e.message);
        }
    },

    mapGameFields(game) {
        const fieldMap = {
            '游戏名': 'title',
            '游戏名称': 'title',
            '名称': 'title',
            '标题': 'title',
            '游戏标题': 'title',
            'title': 'title',
            '图标': 'icon',
            'icon': 'icon',
            '类型': 'category',
            '分类': 'category',
            '类别': 'category',
            'category': 'category',
            '评分': 'rating',
            '分数': 'rating',
            'rating': 'rating',
            '下载量': 'downloads',
            '下载': 'downloads',
            'downloads': 'downloads',
            '介绍': 'description',
            '描述': 'description',
            '简介': 'description',
            'description': 'description',
            '社团': 'developer',
            '开发商': 'developer',
            '开发商/社团': 'developer',
            'developer': 'developer',
            '评价': 'review',
            '简评': 'review',
            'review': 'review'
        };

        const mapped = {
            id: game.id || Date.now() + Math.random(),
            icon: '🎮',
            category: '其他',
            rating: 0,
            downloads: '-',
            description: '',
            updateDate: new Date(),
            isFavorite: false,
            _rawFields: [],
            _rawData: {}
        };

        Object.keys(game).forEach(key => {
            if (key === 'privateData') {
                mapped.privateData = game[key];
                return;
            }
            
            if (key === '_rawFields' || key === '_rawData') return;
            
            const mappedKey = fieldMap[key];
            
            if (mappedKey === 'title') {
                mapped.title = game[key];
            } else if (mappedKey === 'category') {
                mapped.category = game[key];
            } else if (mappedKey === 'rating') {
                const val = parseFloat(game[key]);
                mapped.rating = isNaN(val) ? 0 : val;
            } else if (mappedKey === 'icon') {
                mapped.icon = game[key];
            } else if (mappedKey === 'downloads') {
                mapped.downloads = game[key];
            } else if (mappedKey === 'description') {
                mapped.description = game[key];
            } else if (mappedKey === 'updateDate') {
                mapped.updateDate = new Date(game[key]) || new Date();
            } else {
                mapped._rawFields.push(key);
                mapped._rawData[key] = game[key];
            }
        });

        if (!mapped.title) {
            mapped.title = '未命名';
        }

        return mapped;
    },

    normalizeAllFields(games) {
        const allFieldsSet = new Set();
        games.forEach(g => {
            if (g._rawFields) {
                g._rawFields.forEach(f => allFieldsSet.add(f));
            }
        });
        
        let globalFields = Array.from(allFieldsSet);
        
        const defaultFieldOrder = [
            '文件ID', '类型', '游戏名', '备注', '百度', '迅雷', 'UC', '预览', 
            '排雷|评价', '评级', '评级（成品级别）评分105- X          90-100 SSS           75-85 SS             60-70 S         45-55A     25-40B', 
            '剧情有无代入感10分', '实用度如何', '20分好不好冲？（30分）', '画风立绘建模如何？10分。动态？10分。cg质量？10分（30分）', 
            'CV质量10分，音声10分（20分）', '游戏性|玩法，好不好玩？（15分）', '内容cg丰富度（15分）', 
            '修正分，bug过多，挤牙膏，无意义刷量强行延长游玩时间+反作弊', '封面', '攻略', 'DL号|社团|作者', 
            '最后修改时间', '创建时间', '视频'
        ];
        
        globalFields.sort((a, b) => {
            const ia = defaultFieldOrder.indexOf(a);
            const ib = defaultFieldOrder.indexOf(b);
            if (ia === -1 && ib === -1) {
                return a.localeCompare(b, 'zh-CN');
            }
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });
        
        localStorage.setItem('gamehub_field_order', JSON.stringify(globalFields));
        
        games.forEach(g => {
            g._rawFields = [...globalFields];
            if (!g._rawData) g._rawData = {};
            globalFields.forEach(f => {
                if (!g._rawData.hasOwnProperty(f)) {
                    g._rawData[f] = '';
                }
            });
        });
        
        App.globalFields = globalFields;
        console.log('字段顺序:', globalFields);
        return globalFields;
    },

    saveFieldOrder(fields) {
        localStorage.setItem('gamehub_field_order', JSON.stringify(fields));
        App.globalFields = fields;
        App.games.forEach(g => {
            g._rawFields = [...fields];
        });
        App.saveData();
    },

    async sync() {
        if (this.config.syncProvider === 'local') {
            App.showToast('使用本地存储，无需同步');
            return;
        }

        if (this.config.syncProvider === 'notion') {
            await this.syncToNotion();
        } else if (this.config.syncProvider === 'firebase') {
            await this.syncToFirebase();
        }
    },

    async syncFromCloud() {
        if (this.config.syncProvider === 'notion') {
            await this.syncFromNotion();
        } else if (this.config.syncProvider === 'firebase') {
            await this.syncFromFirebase();
        }
    },

    async syncToNotion() {
        if (!this.config.notionToken || !this.config.notionDatabaseId) {
            App.showToast('请先配置Notion');
            return;
        }

        App.showToast('正在同步到Notion...');

        try {
            for (const game of App.games) {
                await this.createOrUpdateNotionPage(game);
            }
            
            this.config.lastSync = Date.now();
            this.saveConfig();
            App.showToast('✅ 同步成功！');
        } catch (e) {
            console.error('Notion同步失败:', e);
            App.showToast('❌ 同步失败：' + e.message);
        }
    },

    async syncFromNotion() {
        if (!this.config.notionToken || !this.config.notionDatabaseId) {
            App.showToast('请先配置Notion');
            return;
        }

        App.showToast('正在从Notion获取数据...');

        try {
            let allResults = [];
            let hasMore = true;
            let startCursor = undefined;

            const baseUrl = `https://api.notion.com/v1/databases/${this.config.notionDatabaseId}/query`;
            const url = this.getProxyUrl(baseUrl);

            while (hasMore) {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.config.notionToken}`,
                        'Notion-Version': '2022-06-28',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        page_size: 100,
                        start_cursor: startCursor
                    })
                });

                const data = await response.json();
                
                if (data.results) {
                    allResults = allResults.concat(data.results);
                }
                
                hasMore = data.has_more;
                startCursor = data.next_cursor;
            }

            if (allResults.length > 0) {
                const isAdmin = AdminSystem?.config?.isAdmin || false;
                
                const games = allResults.map(page => {
                    const props = page.properties;
                    const isPublic = props['是否公开']?.checkbox ?? 
                                    props['公开']?.checkbox ?? 
                                    props['isPublic']?.checkbox ?? true;
                    
                    if (!isPublic && !isAdmin) {
                        return null;
                    }

                    const game = {
                        id: page.id.replace(/-/g, ''),
                        title: this.getPropertyValue(props, ['标题', '游戏名', 'Name', 'Title'], 'title') || '未命名',
                        icon: this.getPropertyValue(props, ['图标', 'Icon'], 'text') || '🎮',
                        category: this.getPropertyValue(props, ['类型', '分类', 'Category', 'Type'], 'select') || '其他',
                        rating: this.getPropertyValue(props, ['评分', 'Rating', 'Score'], 'number') || 0,
                        downloads: this.getPropertyValue(props, ['下载量', 'Downloads'], 'text') || '-',
                        description: this.getPropertyValue(props, ['介绍', '描述', 'Description', 'Desc'], 'text') || '',
                        developer: this.getPropertyValue(props, ['社团', '开发商', 'Developer', 'Studio'], 'text') || '',
                        review: this.getPropertyValue(props, ['评价', 'Review'], 'text') || '',
                        tags: this.getPropertyValue(props, ['标签', 'Tags'], 'multi_select') || [],
                        cover: this.getPropertyValue(props, ['封面', 'Cover'], 'text') || '',
                        updateDate: new Date(page.last_edited_time),
                        isFavorite: false,
                        isPublic: isPublic
                    };

                    if (isAdmin) {
                        game.hiddenNote = this.getPropertyValue(props, ['隐藏备注', '私密备注', 'HiddenNote'], 'text') || '';
                        game.adminOnly = this.getPropertyValue(props, ['仅管理员', 'AdminOnly'], 'checkbox') || false;
                    }

                    return game;
                }).filter(g => g !== null);

                App.games = games;
                App.nextId = games.length + 1;
                App.saveData();
                App.render();
                
                this.config.lastSync = Date.now();
                this.saveConfig();
                App.showToast(`✅ 已获取 ${games.length} 条数据`);
            }
        } catch (e) {
            console.error('Notion获取失败:', e);
            App.showToast('❌ 获取失败：' + e.message);
        }
    },

    getPropertyValue(props, names, type) {
        for (const name of names) {
            const prop = props[name];
            if (!prop) continue;

            switch (type) {
                case 'title':
                    return prop.title?.[0]?.plain_text || '';
                case 'text':
                    return prop.rich_text?.[0]?.plain_text || '';
                case 'number':
                    return prop.number || 0;
                case 'select':
                    return prop.select?.name || '';
                case 'multi_select':
                    return prop.multi_select?.map(s => s.name) || [];
                case 'checkbox':
                    return prop.checkbox || false;
                case 'date':
                    return prop.date?.start || '';
            }
        }
        return null;
    },

    async createOrUpdateNotionPage(game) {
        const properties = {
            '标题': { title: [{ text: { content: game.title } }] },
            '图标': { rich_text: [{ text: { content: game.icon } }] },
            '分类': { select: { name: game.category } },
            '评分': { number: parseFloat(game.rating) },
            '下载量': { rich_text: [{ text: { content: game.downloads } }] },
            '描述': { rich_text: [{ text: { content: game.description || '' } }] }
        };

        const response = await fetch(`https://api.notion.com/v1/pages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.notionToken}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                parent: { database_id: this.config.notionDatabaseId },
                properties: properties
            })
        });

        return response.json();
    },

    showNotionHelp() {
        const helpHtml = `
            <div id="notionHelpModal" class="modal">
                <div class="modal-backdrop" onclick="document.getElementById('notionHelpModal').remove()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">📝 Notion配置帮助</h3>
                        <button class="close-btn" onclick="document.getElementById('notionHelpModal').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="help-section">
                            <h4>步骤1：创建Integration</h4>
                            <ol>
                                <li>访问 <a href="https://www.notion.so/my-integrations" target="_blank">Notion Integrations</a></li>
                                <li>点击 "+ New integration"</li>
                                <li>填写名称，选择工作区</li>
                                <li>创建后复制 "Internal Integration Token"</li>
                            </ol>
                        </div>
                        <div class="help-section">
                            <h4>步骤2：创建数据库</h4>
                            <ol>
                                <li>在Notion中创建新页面</li>
                                <li>添加数据库（表格视图）</li>
                                <li>创建以下属性：</li>
                            </ol>
                            <table class="help-table">
                                <tr><th>属性名</th><th>类型</th></tr>
                                <tr><td>标题</td><td>Title</td></tr>
                                <tr><td>图标</td><td>Text</td></tr>
                                <tr><td>分类</td><td>Select</td></tr>
                                <tr><td>评分</td><td>Number</td></tr>
                                <tr><td>下载量</td><td>Text</td></tr>
                                <tr><td>描述</td><td>Text</td></tr>
                            </table>
                        </div>
                        <div class="help-section">
                            <h4>步骤3：连接Integration</h4>
                            <ol>
                                <li>打开数据库页面</li>
                                <li>点击右上角 "..." → "Add connections"</li>
                                <li>选择你创建的Integration</li>
                                <li>复制数据库ID（URL中 notion.so/ 后面的部分）</li>
                            </ol>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="document.getElementById('notionHelpModal').remove()">知道了</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', helpHtml);
    },

    async testFirebase() {
        const configStr = document.getElementById('firebaseConfig').value;
        
        if (!configStr) {
            App.showToast('请填写Firebase配置');
            return;
        }

        try {
            const config = JSON.parse(configStr);
            App.showToast('✅ Firebase配置格式正确！');
        } catch (e) {
            App.showToast('❌ JSON格式错误');
        }
    },

    async syncToFirebase() {
        if (!this.config.firebaseConfig) {
            App.showToast('请先配置Firebase');
            return;
        }

        App.showToast('正在同步到Firebase...');
        
        try {
            const response = await fetch(`${this.config.firebaseConfig.databaseURL}/games.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(App.games)
            });

            if (response.ok) {
                this.config.lastSync = Date.now();
                this.saveConfig();
                App.showToast('✅ 同步成功！');
            } else {
                throw new Error('同步失败');
            }
        } catch (e) {
            App.showToast('❌ 同步失败：' + e.message);
        }
    },

    async syncFromFirebase() {
        if (!this.config.firebaseConfig) {
            App.showToast('请先配置Firebase');
            return;
        }

        App.showToast('正在从Firebase获取数据...');

        try {
            const response = await fetch(`${this.config.firebaseConfig.databaseURL}/games.json`);
            const data = await response.json();
            
            if (data) {
                const rawGames = Object.values(data);
                const games = rawGames.map(g => this.mapGameFields(g));
                this.normalizeAllFields(games);
                App.games = games;
                App.nextId = games.length + 1;
                App.saveData();
                App.render();
                
                this.config.lastSync = Date.now();
                this.saveConfig();
                App.showToast(`✅ 已获取 ${games.length} 条数据`);
            }
        } catch (e) {
            App.showToast('❌ 获取失败：' + e.message);
        }
    },

    showFirebaseHelp() {
        const helpHtml = `
            <div id="firebaseHelpModal" class="modal">
                <div class="modal-backdrop" onclick="document.getElementById('firebaseHelpModal').remove()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">🔥 Firebase配置帮助</h3>
                        <button class="close-btn" onclick="document.getElementById('firebaseHelpModal').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="help-section">
                            <h4>步骤1：创建Firebase项目</h4>
                            <ol>
                                <li>访问 <a href="https://console.firebase.google.com" target="_blank">Firebase控制台</a></li>
                                <li>点击 "添加项目"</li>
                                <li>填写项目名称，完成创建</li>
                            </ol>
                        </div>
                        <div class="help-section">
                            <h4>步骤2：创建实时数据库</h4>
                            <ol>
                                <li>在项目中选择 "Realtime Database"</li>
                                <li>点击 "创建数据库"</li>
                                <li>选择位置和安全规则（测试模式即可）</li>
                            </ol>
                        </div>
                        <div class="help-section">
                            <h4>步骤3：获取配置</h4>
                            <ol>
                                <li>点击项目设置（齿轮图标）</li>
                                <li>选择 "项目设置"</li>
                                <li>滚动到底部，点击 "Web应用"</li>
                                <li>复制Firebase配置JSON</li>
                            </ol>
                        </div>
                        <div class="help-section">
                            <h4>数据库规则设置</h4>
                            <p>在 "规则" 标签页设置：</p>
                            <pre class="code-block">{
  "rules": {
    ".read": true,
    ".write": true
  }
}</pre>
                            <p class="warning-text">⚠️ 以上规则允许公开读写，仅用于测试。生产环境请设置认证。</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="document.getElementById('firebaseHelpModal').remove()">知道了</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', helpHtml);
    }
};

document.addEventListener('DOMContentLoaded', () => CloudSync.init());
