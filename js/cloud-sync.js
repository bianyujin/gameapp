const CloudSync = {
    config: {
        notionToken: '',
        notionDatabaseId: '',
        notionCsvUrl: '',
        notionEmbedUrl: '',
        firebaseConfig: {
            databaseURL: 'https://galgame-a5758-default-rtdb.asia-southeast1.firebasedatabase.app'
        },
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
        const saved = localStorage.getItem('gamehub_cloud_config');
        if (saved) {
            this.config = { ...this.config, ...JSON.parse(saved) };
        }
        this.config.localDataVersion = localStorage.getItem('gamehub_local_data_version') || null;
    },

    saveLocalDataVersion(version) {
        this.config.localDataVersion = version;
        localStorage.setItem('gamehub_local_data_version', version);
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
        const internalFields = ['id', 'icon', 'category', 'rating', 'downloads', 'description', 'updateDate', 'isFavorite', '_rawFields', '_rawData', 'title', 'privateData', '_fieldMap'];
        
        const privateKeywords = ['搜索', '更新日志', 'FB', '版本及更新时间', '视频', '备注', '百度', '迅雷', 'UC', '预览', '排雷', '评价', '文件', '网盘', '磁链', '密码', '密钥', 'token', 'secret', 'private', '隐藏'];
        
        const isPrivateField = (key) => {
            return privateKeywords.some(kw => key.includes(kw));
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
            _rawData: {},
            privateData: {}
        };
        
        if (game.privateData) {
            Object.assign(mapped.privateData, game.privateData);
        }
        
        const allData = {};
        if (game._rawData && Object.keys(game._rawData).length > 0) {
            Object.assign(allData, game._rawData);
        } else {
            Object.keys(game).forEach(key => {
                if (!internalFields.includes(key)) {
                    allData[key] = game[key];
                }
            });
        }
        
        for (const key in allData) {
            const value = allData[key];
            if (value === undefined || value === null) continue;
            
            const keyLower = key.toLowerCase().replace(/[\[\]（）\(\)\s|]/g, '');
            
            if (key === '类型' || key === '分类' || key === '类别' || keyLower === '类型') {
                if (value) {
                    mapped.category = value;
                }
                continue;
            }
            
            if (keyLower.includes('游戏名') || key === '标题' || key === '游戏名称' || key === '游戏名') {
                if (value && !mapped.title) {
                    mapped.title = value;
                }
                continue;
            }
            
            if (key === '评分' || key === '分数') {
                const val = parseFloat(value);
                if (!isNaN(val)) {
                    mapped.rating = val;
                }
                continue;
            }
            
            if (key === '下载量' || key === '下载') {
                if (value) {
                    mapped.downloads = value;
                }
                continue;
            }
            
            if (key === '介绍' || key === '描述' || key === '简介') {
                if (value && !mapped.description) {
                    mapped.description = value;
                }
                continue;
            }
            
            if (key === '图标') {
                if (value) {
                    mapped.icon = value;
                }
                continue;
            }
            
            if (isPrivateField(key)) {
                mapped.privateData[key] = value;
                continue;
            }
            
            mapped._rawData[key] = value;
            if (!mapped._rawFields.includes(key)) {
                mapped._rawFields.push(key);
            }
        }
        
        if (!mapped.title) {
            mapped.title = '未命名';
        }
        
        const defaultFieldOrder = [
            '文件ID', '排雷|评价', '排雷 评价', '备注', '预览', '百度', '迅雷', 'UC',
            '评级', '评级（成品级别）评分105- X          90-100 SSS           75-85 SS             60-70 S         45-55A     25-40B',
            '剧情有无代入感10分，实用度如何，20分好不好冲？（30分）',
            '画风立绘建模如何？10分。动态？10分。cg质量？10分（30分）',
            'CV质量10分，音声10分（20分）',
            '游戏性|玩法，好不好玩？（15分）',
            '内容cg丰富度（15分）',
            '修正分，bug过多，挤牙膏，无意义刷量强行延长游玩时间+反作弊',
            '封面', '攻略', 'DL号|社团|作者', '最后修改时间', '创建时间'
        ];
        
        mapped._rawFields.sort((a, b) => {
            const ia = defaultFieldOrder.findIndex(f => f === a || a.replace(/[\s|]/g, '') === f.replace(/[\s|]/g, ''));
            const ib = defaultFieldOrder.findIndex(f => f === b || b.replace(/[\s|]/g, '') === f.replace(/[\s|]/g, ''));
            if (ia === -1 && ib === -1) return a.localeCompare(b, 'zh-CN');
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });
        
        if (Object.keys(mapped.privateData).length === 0) {
            delete mapped.privateData;
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

    async syncFromCloud() {
        App.showToast('同步中...');
        console.log('=== syncFromCloud开始 ===');
        
        console.log('清除旧缓存...');
        localStorage.removeItem('gamehub_games');
        localStorage.removeItem('gamehub_cached_games');
        localStorage.removeItem('gamehub_data_version');
        
        await this.loadCloudConfig();
        
        if (!this.config.gamesDataUrl) {
            throw new Error('请先在config.json中配置games_data_url');
        }
        
        try {
            console.log('开始同步游戏数据...');
            await this.syncFromGamesJson();
            console.log('同步成功!');
            App.showToast('同步成功');
            console.log('=== 同步完成 ===');
        } catch (e) {
            console.error('同步失败:', e);
            App.showToast('同步失败: ' + e.message);
        }
    },

    async syncFromGamesJson() {
        console.log('强制刷新，忽略版本检查...');

        let url = this.config.gamesDataUrl;
        
        if (!url) {
            throw new Error('games_data_url未配置，请检查config.json');
        }
        
        console.log('请求URL:', url);
        const response = await fetch(url);
        console.log('响应状态:', response.status);
        console.log('响应ok:', response.ok);
        
        if (!response.ok) {
            console.error('响应失败, 状态:', response.status);
            throw new Error(`下载失败 (状态码: ${response.status})`);
        }
        
        const responseText = await response.text();
        console.log('响应内容前200字符:', responseText.substring(0, 200));
        
        if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
            throw new Error('返回的是HTML页面，不是JSON数据，请检查URL是否正确');
        }
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error('JSON解析失败:', e);
            throw new Error('JSON解析失败，请检查数据格式');
        }
        
        if (data) {
            let games;
            
            if (Array.isArray(data)) {
                games = data.map(g => this.mapGameFields(g));
            } else {
                const rawGames = Object.values(data);
                games = rawGames.map(g => this.mapGameFields(g));
            }
            
            this.normalizeAllFields(games);
            App.games = games;
            App.nextId = games.length + 1;
            App.saveData();
            App.render();
            
            this.saveLocalDataVersion(this.config.gamesDataVersion);
            
            this.config.lastSync = Date.now();
            this.saveConfig();
            App.showToast('同步成功');
        }
    },

    async syncFromNotionCsv() {
        let url = this.config.notionCsvUrl;
        
        if (this.config.useCorsProxy && this.config.corsProxyUrl) {
            url = this.config.corsProxyUrl + encodeURIComponent(url);
        }

        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('从 Notion 下载失败');
        }
        
        let csvText;
        const contentType = response.headers.get('Content-Type') || '';
        
        if (contentType.includes('zip') || url.includes('.zip')) {
            csvText = await this.extractCsvFromZip(response);
        } else {
            csvText = await response.text();
        }
        
        const data = this.parseCsv(csvText);
        
        if (data && data.length > 0) {
            const games = data.map(g => this.mapGameFields(g));
            this.normalizeAllFields(games);
            App.games = games;
            App.nextId = games.length + 1;
            App.saveData();
            App.render();
            
            this.config.lastSync = Date.now();
            this.saveConfig();
            App.showToast('同步成功');
        } else {
            throw new Error('数据为空');
        }
    },

    async extractCsvFromZip(response) {
        try {
            const JSZip = (window.JSZip || window.zip);
            if (!JSZip) {
                throw new Error('需要JSZip库来解压ZIP文件');
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);
            
            let csvFile = null;
            zip.forEach((relativePath, file) => {
                if (file.name.endsWith('.csv')) {
                    csvFile = file;
                }
            });
            
            if (!csvFile) {
                throw new Error('ZIP中找不到CSV文件');
            }
            
            return await csvFile.async('text');
        } catch (e) {
            console.error('解压ZIP失败:', e);
            throw new Error('解压失败，请直接使用CSV链接');
        }
    },

    parseCsv(csv) {
        const lines = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < csv.length; i++) {
            const char = csv[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            }
            if ((char === '\n' || char === '\r') && !inQuotes) {
                if (current.trim()) {
                    lines.push(current);
                }
                current = '';
                if (char === '\r' && csv[i + 1] === '\n') {
                    i++;
                }
            } else {
                current += char;
            }
        }
        if (current.trim()) {
            lines.push(current);
        }
        
        if (lines.length < 2) return [];
        
        const headers = this.parseCsvLine(lines[0]);
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCsvLine(lines[i]);
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            data.push(row);
        }
        
        return data;
    },

    parseCsvLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
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
    },

    async syncNotionToFirebase() {
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
                const games = allResults.map(page => {
                    const props = page.properties;
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
                        isFavorite: false
                    };

                    Object.keys(props).forEach(key => {
                        if (!['标题', '游戏名', 'Name', 'Title', '图标', 'Icon', '类型', '分类', 'Category', 'Type', '评分', 'Rating', 'Score', '下载量', 'Downloads', '介绍', '描述', 'Description', 'Desc', '社团', '开发商', 'Developer', 'Studio', '评价', 'Review', '标签', 'Tags', '封面', 'Cover'].includes(key)) {
                            game[key] = this.getPropertyValue(props, [key], 'text') || '';
                        }
                    });

                    return game;
                });

                App.showToast('正在同步到Firebase...');

                const response = await fetch(`${this.config.firebaseConfig.databaseURL}/games.json`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(games)
                });

                if (response.ok) {
                    this.config.lastSync = Date.now();
                    this.saveConfig();
                    
                    const mappedGames = games.map(g => this.mapGameFields(g));
                    this.normalizeAllFields(mappedGames);
                    App.games = mappedGames;
                    App.nextId = mappedGames.length + 1;
                    App.saveData();
                    App.render();
                    
                    App.showToast(`✅ 成功！从Notion导入 ${games.length} 条数据到Firebase并同步到本地`);
                } else {
                    throw new Error('同步到Firebase失败');
                }
            }
        } catch (e) {
            console.error('Notion到Firebase同步失败:', e);
            App.showToast('❌ 同步失败：' + e.message);
        }
    },

    async loadCloudConfig(forceRefresh = false) {
        console.log('尝试从config.json加载配置...');
        
        try {
            const response = await fetch('config.json');
            if (response.ok) {
                const configData = await response.json();
                this.config.latestVersion = configData.latest_version || '';
                this.config.updateUrl = configData.update_url || '';
                this.config.cloudAdminPassword = configData.admin_password || '';
                this.config.gamesDataUrl = configData.games_data_url || '';
                this.config.gamesDataVersion = configData.games_data_version || '';
                this.config.notionEmbedUrl = configData.notion_embed_url || '';
                console.log('从config.json加载成功:', this.config);
            } else {
                console.log('无法从config.json加载');
            }
        } catch (e) {
            console.log('加载config.json失败:', e);
        }
        
        this.saveConfig();
        return true;
    },

    async checkVersionUpdate() {
        await this.loadCloudConfig();
        
        if (this.config.latestVersion && this.config.appVersion !== this.config.latestVersion) {
            return {
                needsUpdate: true,
                latestVersion: this.config.latestVersion,
                updateUrl: this.config.updateUrl
            };
        }
        
        return { needsUpdate: false };
    },

    async verifyAdminPassword(password) {
        await this.loadCloudConfig(true);
        
        if (this.config.cloudAdminPassword) {
            return password === this.config.cloudAdminPassword;
        }
        
        const defaultPassword = '520hd123';
        return password === defaultPassword;
    }
};

document.addEventListener('DOMContentLoaded', () => CloudSync.init());
