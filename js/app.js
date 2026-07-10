// 存储适配器：localStorage → cookie → sessionStorage，确保跨WebView持久化
const Storage = {
    _store: null,
    _type: '',
    init() {
        // 优先: localStorage
        try {
            const testKey = '__storage_test__';
            localStorage.setItem(testKey, '1');
            localStorage.removeItem(testKey);
            this._store = localStorage;
            this._type = 'localStorage';
            console.log('[Storage] 使用 localStorage');
            return;
        } catch(e) {}
        // 次选: cookie (WebView中比sessionStorage更持久)
        try {
            document.cookie = '__ct=1;max-age=31536000;path=/';
            if (document.cookie.includes('__ct=1')) {
                document.cookie = '__ct=;max-age=0;path=/';
                this._store = {
                    getItem(k) { const m = document.cookie.match(new RegExp('(?:^|; )' + encodeURIComponent(k) + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; },
                    setItem(k, v) { document.cookie = encodeURIComponent(k) + '=' + encodeURIComponent(v) + ';max-age=31536000;path=/'; },
                    removeItem(k) { document.cookie = encodeURIComponent(k) + '=;max-age=0;path=/'; }
                };
                this._type = 'cookie';
                console.log('[Storage] 使用 cookie');
                return;
            }
        } catch(e) {}
        // 最后: sessionStorage (不跨重启)
        this._store = sessionStorage;
        this._type = 'sessionStorage';
        console.log('[Storage] 降级到 sessionStorage');
    },
    getItem(key) { try { return this._store ? this._store.getItem(key) : null; } catch(e) { return null; } },
    setItem(key, val) { try { if (this._store) this._store.setItem(key, val); } catch(e) {} },
    removeItem(key) { try { if (this._store) this._store.removeItem(key); } catch(e) {} }
};
Storage.init();

const APP_VERSION = '2.1.0';

// ========== 全局错误监控 ==========
window.__errors = [];
window.addEventListener('error', (e) => {
    const err = { msg: e.message, src: e.filename, line: e.lineno, time: new Date().toISOString() };
    window.__errors.push(err);
    if (window.__errors.length > 50) window.__errors.shift();
    console.error('[ErrorMonitor]', err);
});
window.addEventListener('unhandledrejection', (e) => {
    const err = { msg: String(e.reason), type: 'unhandledrejection', time: new Date().toISOString() };
    window.__errors.push(err);
    if (window.__errors.length > 50) window.__errors.shift();
    console.error('[ErrorMonitor]', err);
});

const App = {
    games: [],
    isAdmin: false,
    _userSorted: false,
    categories: [
        { name: '动作', icon: '⚔️', count: 24 },
        { name: '角色扮演', icon: '🧙', count: 18 },
        { name: '策略', icon: '♟️', count: 16 },
        { name: '休闲', icon: '🎪', count: 32 },
        { name: '竞技', icon: '🏆', count: 14 },
        { name: '冒险', icon: '🗺️', count: 20 }
    ],
    carouselItems: [
        { title: '新游戏上线', subtitle: '星际探险2震撼来袭', color: '#6366f1' },
        { title: '春季活动', subtitle: '限时活动开启', color: '#8b5cf6' },
        { title: '王国保卫战', subtitle: '重大更新发布', color: '#ec4899' }
    ],
    currentPage: 'home',
    tableTab: 'all',
    tableState: {
        sortColumn: 'updateDate',
        sortDirection: 'desc',
        currentPage: 1,
        pageSize: 5,
        searchQuery: '',
        selectedItems: [],
        filterCategories: new Set(),
        minRating: 0,
        maxRating: 5
    },
    carouselIndex: 0,
    carouselInterval: null,
    nextId: 51,

    init() {
        console.log(`[GAMEACG] v${APP_VERSION} 初始化 | Storage: ${Storage._type}`);
        try { this.isAdmin = Storage.getItem('gamehub_is_admin') === 'true'; } catch(e) { this.isAdmin = false; }
        try { this.loadDarkMode(); } catch(e) {}
        try {
            const savedOrder = Storage.getItem('gamehub_field_order');
            if (savedOrder) this.globalFields = JSON.parse(savedOrder);
        } catch(e) {}
        this.loadData();
        this.bindEvents();
        this.render();
        this.startCarousel();
        this.loadRandomImage();
        this.checkGuideBanner();
        this.initCoverSetting();
        this.autoSync();
        this.checkForUpdates();
        this.initHistory();
        
        const addGameFab = document.getElementById('addGameFab');
        if (addGameFab) {
            addGameFab.style.display = 'flex';
        }
    },

    initHistory() {
        history.replaceState({ page: 'home', type: 'page' }, '');
        
        window.addEventListener('popstate', (e) => {
            if (e.state) {
                if (e.state.type === 'modal') {
                    this.closeModalById(e.state.modalId);
                } else if (e.state.type === 'page') {
                    this.switchPageWithoutHistory(e.state.page);
                }
            }
        });
    },

    pushPageHistory(page) {
        history.pushState({ page: page, type: 'page' }, '');
    },

    pushModalHistory(modalId) {
        history.pushState({ type: 'modal', modalId: modalId }, '');
    },

    closeModalById(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.remove();
    },

    checkGuideBanner() {
        const hasSynced = Storage.getItem('gamehub_has_synced');
        const guideBanner = document.getElementById('guideBanner');
        
        if (!hasSynced && guideBanner) {
            guideBanner.style.display = 'block';
        }
    },

    hideGuideBanner() {
        const guideBanner = document.getElementById('guideBanner');
        if (guideBanner) {
            guideBanner.style.display = 'none';
        }
    },

    async autoSync() {
        try {
            const autoSyncEnabled = Storage.getItem('gamehub_auto_sync_enabled') === 'true';
            if (!autoSyncEnabled) {
                // 自动同步关闭：重置为模版数据
                const hasSynced = Storage.getItem('gamehub_has_synced') === 'true';
                if (hasSynced) {
                    // 清除已同步的数据，下次显示模版数据
                    try { Storage.removeItem('gamehub_games'); } catch(e) {}
                    try { Storage.removeItem('gamehub_has_synced'); } catch(e) {}
                    try { Storage.removeItem('gamehub_last_sync_time'); } catch(e) {}
                    console.log('自动同步已关闭，已清除缓存数据');
                }
                return;
            }

            // 自动同步开启：正常同步流程
            const lastSyncTime = Storage.getItem('gamehub_last_sync_time');
            const hasGameData = !!Storage.getItem('gamehub_games');
            const now = Date.now();
            const oneHour = 60 * 60 * 1000;

            // 没有本地缓存数据时必须同步（cookie放不下大数据，重启后需要重新拉取）
            const syncTime = parseInt(lastSyncTime) || 0;
            if (!hasGameData || !lastSyncTime || isNaN(syncTime) || (now - syncTime) > oneHour) {
                console.log('自动同步开始...');
                try {
                    await CloudSync.syncFromCloud();
                    try { Storage.setItem('gamehub_has_synced', 'true'); } catch(e) {}
                    try { Storage.setItem('gamehub_last_sync_time', now.toString()); } catch(e) {}
                    this.hideGuideBanner();
                    console.log('自动同步完成');
                } catch (e) {
                    console.log('自动同步失败:', e);
                }
            }
        } catch(e) {
            console.log('autoSync跳过（存储不可用）');
        }
    },

    refreshPage() {
        this.showToast('刷新中...');
        this.tableState.sortColumn = 'updateDate';
        this.tableState.sortDirection = 'desc';
        this.tableState.currentPage = 1;
        this.tableState.searchQuery = '';
        this.tableState.filterCategories.clear();
        this.tableState.minRating = 0;
        this.tableState.maxRating = 5;
        
        const searchInput = document.getElementById('tableSearch');
        if (searchInput) searchInput.value = '';
        
        this._userSorted = false;
        this.games.sort((a, b) => this.getGameDate(b) - this.getGameDate(a));
        
        this.renderTable();
        this.loadRandomImage();
        this.showToast('刷新完成');
    },

    loadRandomImage() {
        const img = document.getElementById('randomImage');
        const placeholder = document.getElementById('imagePlaceholder');
        
        if (!img || !placeholder) return;
        
        img.style.display = 'none';
        placeholder.style.display = 'flex';
        placeholder.querySelector('.placeholder-text').textContent = '加载中...';
        
        const loadImage = (url) => {
            img.onload = () => {
                img.style.display = 'block';
                placeholder.style.display = 'none';
            };
            
            img.onerror = () => {
                placeholder.querySelector('.placeholder-text').textContent = '加载失败，点击刷新按钮重试';
                console.log('图片加载失败');
            };
            
            img.src = url + '?t=' + Date.now();
        };
        
        const r18Value = this.isAdmin ? 1 : 0;
        
        fetch(`https://api.lolicon.app/setu/v2?r18=${r18Value}&num=1&size=regular&size=original`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP错误: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data && data.error) {
                    throw new Error(`API错误: ${data.error}`);
                }
                if (data && data.data && data.data[0] && data.data[0].urls) {
                    const imageUrl = data.data[0].urls.regular || data.data[0].urls.original;
                    if (imageUrl) {
                        loadImage(imageUrl);
                    } else {
                        throw new Error('没有可用的图片URL');
                    }
                } else {
                    throw new Error('API返回格式不对');
                }
            })
            .catch(error => {
                console.log('Lolicon API失败，使用备用API:', error);
                const backupApis = [
                    'https://img.xjh.me/random_img.php',
                    'https://www.dmoe.cc/random.php',
                    'https://api.btstu.cn/sjbz/api.php'
                ];
                const randomApi = backupApis[Math.floor(Math.random() * backupApis.length)];
                loadImage(randomApi);
            });
    },

    loadDarkMode() {
        const isDarkMode = Storage.getItem('gamehub_dark_mode') !== 'false';
        if (isDarkMode) {
            document.body.classList.remove('light-mode');
        } else {
            document.body.classList.add('light-mode');
        }
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            darkModeToggle.checked = isDarkMode;
        }
    },

    toggleDarkMode(isDark) {
        if (isDark) {
            document.body.classList.remove('light-mode');
            Storage.setItem('gamehub_dark_mode', 'true');
        } else {
            document.body.classList.add('light-mode');
            Storage.setItem('gamehub_dark_mode', 'false');
        }
    },

    loadData() {
        try {
            const saved = Storage.getItem('gamehub_games');
            const savedId = Storage.getItem('gamehub_nextId');

            if (saved) {
                try {
                    this.games = JSON.parse(saved);
                    this.games.forEach(g => {
                        g.updateDate = new Date(g.updateDate);
                    });
                    this.nextId = savedId ? parseInt(savedId) : this.games.length + 1;
                    console.log(`已加载 ${this.games.length} 条数据`);
                } catch (e) {
                    console.error('加载数据失败:', e);
                    this.loadSampleData();
                }
            } else {
                this.loadSampleData();
            }
        } catch(e) {
            console.log('localStorage不可用，加载假数据');
            this.loadSampleData();
        }
    },

    saveData() {
        try {
            Storage.setItem('gamehub_games', JSON.stringify(this.games));
            Storage.setItem('gamehub_nextId', this.nextId.toString());
            console.log('数据已保存');
        } catch (e) {
            console.log('saveData跳过（存储不可用）');
        }
    },

    loadSampleData() {
        const titles = ['星际探险', '王国保卫战', '极速狂飙', '魔法大陆', '开心消消乐', '忍者传说', '像素地牢', '音乐大师', '王者荣耀', '和平精英', '原神', '我的世界', '英雄联盟手游', '崩坏：星穹铁道', '明日方舟', '阴阳师', '第五人格', '穿越火线', 'QQ飞车', '天天酷跑'];
        const categories = ['动作', '角色扮演', '策略', '休闲', '竞技', '冒险'];
        const icons = ['🚀', '🏰', '🏎️', '✨', '🍬', '🥷', '🗡️', '🎵', '⚔️', '🔫', '🌍', '🧱', '🏹', '🚄', '🏥', '👹', '🎭', '💣', '🏁', '🏃'];

        for (let i = 0; i < 50; i++) {
            this.games.push({
                id: i + 1,
                title: titles[i % titles.length] + (i >= titles.length ? ` ${Math.floor(i / titles.length) + 1}` : ''),
                icon: icons[i % icons.length],
                category: categories[i % categories.length],
                rating: (3.5 + Math.random() * 1.5).toFixed(1),
                downloads: `${(Math.random() * 100 + 10).toFixed(0)}万+`,
                description: '一款精彩的游戏，带给你无限乐趣！',
                updateDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
                isFavorite: Math.random() > 0.7
            });
        }
        this.saveData();
    },

    bindEvents() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.switchPage(e.currentTarget.dataset.page);
            });
        });

        document.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', (e) => {
                this.sortTable(e.target.dataset.sort);
            });
        });

        const tableSearch = document.getElementById('tableSearch');
        if (tableSearch) {
            tableSearch.addEventListener('input', (e) => {
                this.tableState.searchQuery = e.target.value;
                this.tableState.currentPage = 1;
                this.renderTable();
            });
        }

        const filterBtn = document.getElementById('filterBtn');
        if (filterBtn) {
            filterBtn.addEventListener('click', () => {
                this.openFilterModal();
            });
        }

        const sortBtn = document.getElementById('sortBtn');
        if (sortBtn) {
            sortBtn.addEventListener('click', () => {
                this.openSortModal();
            });
        }

        const homeSearch = document.getElementById('homeSearch');
        if (homeSearch) {
            homeSearch.addEventListener('input', (e) => {
                this.renderHomeGames(e.target.value);
            });
        }

        const clearCacheBtn = document.getElementById('clearCacheBtn');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                this.clearCache();
            });
        }

        const exportDataBtn = document.getElementById('exportDataBtn');
        if (exportDataBtn) {
            exportDataBtn.addEventListener('click', () => {
                this.exportData();
            });
        }

        const importDataBtn = document.getElementById('importDataBtn');
        if (importDataBtn) {
            importDataBtn.addEventListener('click', () => {
                this.openImportModal();
            });
        }

        const adminPanelBtn = document.getElementById('adminPanelBtn');
        if (adminPanelBtn) {
            adminPanelBtn.addEventListener('click', () => {
                AdminSystem.openAdminPanel();
            });
        }

        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            darkModeToggle.addEventListener('change', (e) => {
                this.toggleDarkMode(e.target.checked);
                this.showToast(e.target.checked ? '夜间模式已开启' : '夜间模式已关闭');
            });
        }

        const carouselPrev = document.getElementById('carouselPrev');
        if (carouselPrev) {
            carouselPrev.addEventListener('click', () => {
                this.prevSlide();
            });
        }

        const carouselNext = document.getElementById('carouselNext');
        if (carouselNext) {
            carouselNext.addEventListener('click', () => {
                this.nextSlide();
            });
        }
    },

    switchPage(page) {
        this.pushPageHistory(page);
        this.switchPageWithoutHistory(page);
    },

    switchPageWithoutHistory(page) {
        this.currentPage = page;

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        document.querySelectorAll('.page').forEach(p => {
            p.classList.toggle('active', p.id === `page-${page}`);
        });

        const titles = {
            home: '首页',
            table: '数据管理',
            profile: '个人中心'
        };
        document.getElementById('headerTitle').textContent = titles[page];

        if (page === 'table') {
            this.renderTable();
        }
    },

    switchTableTab(tab) {
        this.tableTab = tab;
        this.tableState.currentPage = 1;
        this.tableState.selectedItems = [];

        document.querySelectorAll('.table-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tableTab === tab);
        });

        this.renderTable();
    },

    sortTable(column) {
        if (this.tableState.sortColumn === column) {
            this.tableState.sortDirection = this.tableState.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.tableState.sortColumn = column;
            this.tableState.sortDirection = 'asc';
        }

        document.querySelectorAll('.sortable').forEach(th => {
            th.classList.remove('asc', 'desc');
            if (th.dataset.sort === column) {
                th.classList.add(this.tableState.sortDirection);
            }
        });

        this.renderTable();
    },

    getFilteredGames() {
        let games = [...this.games];

        if (this.tableTab === 'favorites') {
            const favIds = this.loadFavorites();
            games = games.filter(g => favIds.includes(g.id));
        } else if (this.tableTab === 'history') {
            games = games.slice(0, 15);
        }

        if (this.tableState.searchQuery) {
            const q = this.tableState.searchQuery.toLowerCase();
            games = games.filter(g => {
                const titleMatch = (g.title || '').toLowerCase().includes(q);
                const catMatch = (g.category || '').toLowerCase().includes(q);
                const rawSearch = (g._rawData && g._rawData['搜索']) || '';
                const searchMatch = rawSearch.toLowerCase().includes(q);
                let descMatch = false;
                if (g._rawData) {
                    descMatch = Object.values(g._rawData).some(v =>
                        typeof v === 'string' && v.toLowerCase().includes(q)
                    );
                }
                let privateMatch = false;
                if (g.privateData) {
                    privateMatch = Object.values(g.privateData).some(v =>
                        typeof v === 'string' && v.toLowerCase().includes(q)
                    );
                }
                return titleMatch || catMatch || searchMatch || descMatch || privateMatch;
            });
        }

        if (this.tableState.filterCategories.size > 0) {
            games = games.filter(g => {
                const fileId = (g._rawData && g._rawData['文件ID']) || '';
                const rawType = (g._rawData && g._rawData['类型']) || '';
                const title = g.title || '';
                const cat = g.category || '';
                for (const catFilter of this.tableState.filterCategories) {
                    const q = catFilter.toLowerCase();
                    if (fileId.toLowerCase().includes(q) ||
                        rawType.toLowerCase().includes(q) ||
                        title.toLowerCase().includes(q) ||
                        cat.toLowerCase().includes(q)) {
                        return true;
                    }
                }
                return false;
            });
        }

        games = games.filter(g =>
            parseFloat(g.rating) >= this.tableState.minRating &&
            parseFloat(g.rating) <= this.tableState.maxRating
        );

        return games;
    },

    updateProfileCounts() {
        const favoritesCount = document.getElementById('favoritesCount');
        const historyCount = document.getElementById('historyCount');
        if (favoritesCount) {
            favoritesCount.textContent = this.loadFavorites().length;
        }
        if (historyCount) {
            const hist = this.loadHistory();
            historyCount.textContent = hist.length;
        }
    },

    // ========== 收藏功能（用户独立存储，不写入公共数据）==========
    loadFavorites() {
        try { return JSON.parse(Storage.getItem('gamehub_favorites') || '[]'); } catch(e) { return []; }
    },

    saveFavorites(favs) {
        try { Storage.setItem('gamehub_favorites', JSON.stringify(favs)); } catch(e) {}
    },

    isFavorite(gameId) {
        return this.loadFavorites().includes(gameId);
    },

    toggleFavorite(gameId) {
        let favs = this.loadFavorites();
        if (favs.includes(gameId)) {
            favs = favs.filter(id => id !== gameId);
            this.showToast('已取消收藏');
        } else {
            favs.push(gameId);
            this.showToast('已收藏');
        }
        this.saveFavorites(favs);
        this.updateProfileCounts();
    },

    // ========== 历史记录 ==========
    loadHistory() {
        try {
            return JSON.parse(Storage.getItem('gamehub_view_history') || '[]');
        } catch(e) { return []; }
    },

    saveHistory(history) {
        try { Storage.setItem('gamehub_view_history', JSON.stringify(history.slice(0, 100))); } catch(e) {}
    },

    addToHistory(game) {
        let hist = this.loadHistory();
        hist = hist.filter(h => h.id !== game.id);
        hist.unshift({ id: game.id, title: game.title, icon: game.icon, category: game.category, time: Date.now() });
        if (hist.length > 100) hist = hist.slice(0, 100);
        this.saveHistory(hist);
    },

    showFavorites() {
        const favIds = this.loadFavorites();
        const favorites = this.games.filter(g => favIds.includes(g.id));
        this.showListModal('我的收藏', favorites);
    },

    showHistory() {
        const hist = this.loadHistory();
        const items = hist.map(h => this.games.find(g => g.id === h.id)).filter(Boolean);
        this.showListModal('浏览历史', items);
    },

    showListModal(title, items) {
        const listHtml = items.length > 0 ? items.map((item, i) => `
            <div class="list-item" onclick="App.closeListModal(); App.editGameByIndex(${this.games.indexOf(item)})" style="padding: 12px; border-bottom: 1px solid #334155; cursor: pointer;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 24px;">${item.icon || '🎮'}</span>
                    <div>
                        <div style="font-weight: 500;">${item.title || '未命名'}</div>
                        <div style="font-size: 12px; color: #94a3b8;">${item.category || '其他'} · ${this.getGradeDisplay(item) || ((item.rating && item.rating > 0) ? '⭐ ' + item.rating : '？')}</div>
                    </div>
                </div>
            </div>
        `).join('') : '<div style="padding: 40px; text-align: center; color: #64748b;">暂无数据</div>';

        const modalHtml = `
            <div id="listModal" class="modal">
                <div class="modal-backdrop" onclick="App.closeListModal()"></div>
                <div class="modal-content" style="max-width: 400px; max-height: 70vh;">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                        <button class="close-btn" onclick="App.closeListModal()">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 0; max-height: 50vh; overflow-y: auto;">
                        ${listHtml}
                    </div>
                </div>
            </div>
        `;
        
        this.pushModalHistory('editModal');
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    closeListModal() {
        const modal = document.getElementById('listModal');
        if (modal) modal.remove();
    },

    renderPagination(totalPages) {
        const container = document.getElementById('pagination');
        let html = '';

        html += `<button class="pagination-btn" 
                      ${this.tableState.currentPage === 1 ? 'disabled' : ''}
                      onclick="App.goToPage(${this.tableState.currentPage - 1})">‹</button>`;

        for (let i = 1; i <= Math.min(totalPages, 5); i++) {
            html += `<button class="pagination-btn ${this.tableState.currentPage === i ? 'active' : ''}"
                          onclick="App.goToPage(${i})">${i}</button>`;
        }

        if (totalPages > 5) {
            html += `<span style="padding: 0 8px;">...</span>`;
            html += `<button class="pagination-btn ${this.tableState.currentPage === totalPages ? 'active' : ''}"
                          onclick="App.goToPage(${totalPages})">${totalPages}</button>`;
        }

        html += `<button class="pagination-btn" 
                      ${this.tableState.currentPage === totalPages ? 'disabled' : ''}
                      onclick="App.goToPage(${this.tableState.currentPage + 1})">›</button>`;

        container.innerHTML = html;
    },

    goToPage(page) {
        this.tableState.currentPage = page;
        this.renderTable();
    },

    toggleSelect(id) {
        const index = this.tableState.selectedItems.indexOf(id);
        if (index > -1) {
            this.tableState.selectedItems.splice(index, 1);
        } else {
            this.tableState.selectedItems.push(id);
        }
        this.renderTable();
    },

    toggleSelectAll(checked) {
        const games = this.getFilteredGames();
        const start = (this.tableState.currentPage - 1) * this.tableState.pageSize;
        const end = start + this.tableState.pageSize;
        const pageGames = games.slice(start, end);

        if (checked) {
            pageGames.forEach(g => {
                if (!this.tableState.selectedItems.includes(g.id)) {
                    this.tableState.selectedItems.push(g.id);
                }
            });
        } else {
            pageGames.forEach(g => {
                const index = this.tableState.selectedItems.indexOf(g.id);
                if (index > -1) {
                    this.tableState.selectedItems.splice(index, 1);
                }
            });
        }
        this.renderTable();
    },

    toggleSelectByIndex(index) {
        const game = this.games[index];
        if (!game) return;
        const idx = this.tableState.selectedItems.indexOf(game.id);
        if (idx > -1) {
            this.tableState.selectedItems.splice(idx, 1);
        } else {
            this.tableState.selectedItems.push(game.id);
        }
        this.renderTable();
    },

    editGameByIndex(index) {
        const game = this.games[index];
        if (!game) return;
        this.openEditModal(game, index);
    },

    deleteGameByIndex(index) {
        if (confirm('确定要删除这条数据吗？')) {
            if (index > -1 && index < this.games.length) {
                this.games.splice(index, 1);
                this.saveData();
                this.renderTable();
                this.renderHomeGames('');
                this.showToast('已删除');
            }
        }
    },

    editGame(id) {
        const game = this.games.find(g => g.id === id);
        if (!game) return;
        const index = this.games.indexOf(game);
        this.openEditModal(game, index);
    },

    openEditModal(game, index) {
        this.addToHistory(game);
        const rawFields = game._rawFields || Object.keys(game._rawData || {});
        
        const exactPrivateFields = ['搜索', '更新日志', 'FB', '视频'];
        const containsPrivateKeywords = ['版本及更新时间'];
        
        const isPrivateField = (key) => {
            if (exactPrivateFields.includes(key)) return true;
            if (containsPrivateKeywords.some(kw => key.includes(kw))) return true;
            return false;
        };
        
        const allPrivateFields = {};
        if (game.privateData) {
            Object.assign(allPrivateFields, game.privateData);
        }
        if (this.isAdmin && game._rawData) {
            Object.keys(game._rawData).forEach(k => {
                if (!allPrivateFields.hasOwnProperty(k) && isPrivateField(k)) {
                    allPrivateFields[k] = game._rawData[k];
                }
            });
        }
        
        const rawFieldsHtml = rawFields.map((k, i) => {
            const isHidden = !this.isAdmin && isPrivateField(k);
            if (isHidden) return '';
            return `
                <div class="form-group raw-field" data-field="${k}" data-index="${i}">
                    <label class="form-label" style="display: flex; justify-content: space-between; align-items: center;">
                        <span>${k}</span>
                        <span style="display: flex; gap: 4px;">
                            ${this.isAdmin ? `
                                <button type="button" onclick="App.moveRawField(${i}, -1)" style="background: #334155; border: none; color: #94a3b8; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px;">↑</button>
                                <button type="button" onclick="App.moveRawField(${i}, 1)" style="background: #334155; border: none; color: #94a3b8; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px;">↓</button>
                            ` : ''}
                            <button type="button" onclick="App.copyFieldText(this)" style="background: #334155; border: none; color: #94a3b8; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px;">复制</button>
                        </span>
                    </label>
                    <div class="form-textarea raw-field-value" data-field="${k}" style="font-size: 13px; background: #0f172a; min-height: 40px; white-space: pre-wrap; word-break: break-all;">${String(game._rawData[k] || '-')}</div>
                </div>
            `;
        }).join('');

        const modalHtml = `
            <div id="editModal" class="modal">
                <div class="modal-backdrop" onclick="App.closeEditModal()"></div>
                <div class="modal-content" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h3 class="modal-title">📋 数据详情 ${this.isAdmin ? '<span style="font-size: 12px; color: #f59e0b;">[管理员模式]</span>' : ''}</h3>
                        <button class="close-btn" onclick="App.closeEditModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${(() => {
                            const coverUrl = this.getGameCoverUrl(game);
                            if (coverUrl) {
                                return `<div style="margin-bottom:16px;border-radius:12px;overflow:hidden;max-height:300px;"><img src="${coverUrl}" style="width:100%;height:auto;object-fit:cover;display:block;" onerror="this.parentElement.style.display='none'" /></div>`;
                            }
                            return '';
                        })()}
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div class="form-group">
                                <label class="form-label">标题</label>
                                <div class="form-input" style="background: #0f172a;">${game.title || '未命名'}</div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">图标</label>
                                <div class="form-input" style="background: #0f172a;">${game.icon || '🎮'}</div>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                            <div class="form-group">
                                <label class="form-label">分类</label>
                                <div class="form-input" style="background: #0f172a;">${game.category || '其他'}</div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">评级</label>
                                <div class="form-input" style="background: #0f172a;">${this.getGradeDisplay(game) || ((game.rating && game.rating > 0) ? '⭐ ' + game.rating : '？')}</div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">描述</label>
                            <div class="form-textarea" style="background: #0f172a; min-height: 40px;">${game.description || '-'}</div>
                        </div>
                        
                        ${this.isAdmin && allPrivateFields && Object.keys(allPrivateFields).length > 0 ? `
                            <div style="background: #422006; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                                <label class="form-label" style="color: #f59e0b;">🔒 私有数据</label>
                                <div style="font-size: 13px; color: #fcd34d;">
                                    ${Object.keys(allPrivateFields).map(k => 
                                        `<div style="margin-bottom: 4px;"><strong>${k}:</strong> ${String(allPrivateFields[k]).substring(0, 100)}</div>`
                                    ).join('')}
                                </div>
                            </div>
                        ` : ''}
                        
                        ${rawFields.length > 0 ? `
                            <div style="border-top: 1px solid #334155; padding-top: 16px; margin-top: 8px;">
                                <label class="form-label" style="color: #94a3b8; margin-bottom: 12px;">
                                    📝 自定义字段 (${rawFields.filter(k => this.isAdmin || !isPrivateField(k)).length}个) ${this.isAdmin ? '- 点击↑↓调整顺序' : ''}
                                </label>
                                <div id="rawFieldsContainer">
                                    ${rawFieldsHtml}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="App.toggleFavorite(${game.id});App.closeEditModal();" style="flex:1;">${this.isFavorite(game.id) ? '★ 取消收藏' : '☆ 收藏'}</button>
                        <button class="btn btn-primary" onclick="App.closeEditModal()" style="flex:1;">关闭</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    copyFieldText(btn) {
        const fieldDiv = btn.closest('.form-group').querySelector('.form-textarea');
        const text = fieldDiv.textContent;
        navigator.clipboard.writeText(text).then(() => {
            btn.textContent = '已复制';
            setTimeout(() => btn.textContent = '复制', 1500);
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            btn.textContent = '已复制';
            setTimeout(() => btn.textContent = '复制', 1500);
        });
    },

    moveRawField(fieldIndex, direction) {
        console.log('moveRawField called', fieldIndex, direction, 'isAdmin:', this.isAdmin, 'globalFields:', this.globalFields);
        
        if (!this.isAdmin) {
            this.showToast('请先登录管理员');
            return;
        }
        
        const fields = this.globalFields ? [...this.globalFields] : (this.games[0]?._rawFields ? [...this.games[0]._rawFields] : null);
        if (!fields) {
            this.showToast('没有可排序的字段');
            return;
        }
        
        const newIndex = fieldIndex + direction;
        
        if (newIndex < 0 || newIndex >= fields.length) return;
        
        [fields[fieldIndex], fields[newIndex]] = [fields[newIndex], fields[fieldIndex]];
        
        this.globalFields = fields;
        
        this.games.forEach(g => {
            g._rawFields = [...fields];
        });
        
        Storage.setItem('gamehub_field_order', JSON.stringify(fields));
        this.saveData();
        
        const container = document.getElementById('rawFieldsContainer');
        if (container) {
            const game = this.games[0];
            if (game) {
                const newHtml = fields.map((k, i) => `
                    <div class="form-group raw-field" data-field="${k}" data-index="${i}">
                        <label class="form-label" style="display: flex; justify-content: space-between; align-items: center;">
                            <span>${k}</span>
                            <span style="display: flex; gap: 4px;">
                                <button type="button" onclick="App.moveRawField(${i}, -1)" style="background: #334155; border: none; color: #94a3b8; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px;">↑</button>
                                <button type="button" onclick="App.moveRawField(${i}, 1)" style="background: #334155; border: none; color: #94a3b8; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px;">↓</button>
                                <button type="button" onclick="App.copyFieldText(this)" style="background: #334155; border: none; color: #94a3b8; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px;">复制</button>
                            </span>
                        </label>
                    <div class="form-textarea raw-field-value" data-field="${k}" style="font-size: 13px; background: #0f172a; min-height: 40px; white-space: pre-wrap; word-break: break-all;">${String(game.privateData?.[k] || game._rawData[k] || '-')}</div>
                    </div>
                `).join('');
                container.innerHTML = newHtml;
            }
        }
        
        this.showToast('字段顺序已更新');
    },

    closeEditModal() {
        const modal = document.getElementById('editModal');
        if (modal) modal.remove();
    },

    saveEdit(id) {
        const game = this.games.find(g => g.id === id);
        if (!game) return;

        game.title = document.getElementById('editTitle').value;
        game.icon = document.getElementById('editIcon').value;
        game.category = document.getElementById('editCategory').value;
        game.rating = parseFloat(document.getElementById('editRating').value).toFixed(1);
        game.downloads = document.getElementById('editDownloads').value;
        game.description = document.getElementById('editDescription').value;
        game.updateDate = new Date();

        this.saveData();
        this.closeEditModal();
        this.renderTable();
        this.renderHomeGames('');
        this.showToast('已保存修改');
    },

    saveEditByIndex(index) {
        const game = this.games[index];
        if (!game) return;

        game.title = document.getElementById('editTitle').value;
        game.icon = document.getElementById('editIcon').value;
        game.category = document.getElementById('editCategory').value;
        game.rating = parseFloat(document.getElementById('editRating').value) || 0;
        game.downloads = document.getElementById('editDownloads').value;
        game.description = document.getElementById('editDescription').value;
        game.updateDate = new Date();

        document.querySelectorAll('.raw-field-input').forEach(input => {
            const field = input.dataset.field;
            if (field && game._rawData) {
                game._rawData[field] = input.value;
            }
        });

        this.saveData();
        this.closeEditModal();
        this.renderTable();
        this.renderHomeGames('');
        this.showToast('已保存修改');
    },

    deleteGame(id) {
        if (confirm('确定要删除这个游戏吗？')) {
            const index = this.games.findIndex(g => g.id === id);
            if (index > -1) {
                this.games.splice(index, 1);
                this.saveData();
                this.renderTable();
                this.renderHomeGames('');
                this.showToast('已删除');
            }
        }
    },

    openFilterModal() {
        const existingModal = document.getElementById('filterModalDynamic');
        if (existingModal) existingModal.remove();
        
        const modalHtml = `
            <div id="filterModalDynamic" class="modal">
                <div class="modal-backdrop" onclick="App.closeFilterModal()"></div>
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3 class="modal-title">🔽 筛选</h3>
                        <button class="close-btn" onclick="App.closeFilterModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="filter-group">
                            <label class="filter-label">游戏分类</label>
                            <div class="filter-options" id="filterCategories"></div>
                        </div>
                        <div class="filter-group">
                            <label class="filter-label">评分范围</label>
                            <div class="filter-range">
                                <input type="range" id="minRating" min="0" max="5" step="0.5" value="${this.tableState.minRating}" oninput="document.getElementById('minRatingVal').textContent=this.value">
                                <span id="minRatingVal">${this.tableState.minRating}</span>
                                <span>-</span>
                                <input type="range" id="maxRating" min="0" max="5" step="0.5" value="${this.tableState.maxRating}" oninput="document.getElementById('maxRatingVal').textContent=this.value">
                                <span id="maxRatingVal">${this.tableState.maxRating}</span>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="App.resetFilters()">重置</button>
                        <button class="btn btn-primary" onclick="App.applyFilters()">应用</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const container = document.getElementById('filterCategories');
        const cats = this.getGameTypes();
        container.innerHTML = cats.map(cat => `
            <span class="filter-option ${this.tableState.filterCategories.has(cat) ? 'selected' : ''}"
                  onclick="App.toggleFilterCategory('${cat}')">${cat}</span>
        `).join('');
    },

    closeFilterModal() {
        const modal = document.getElementById('filterModalDynamic');
        if (modal) modal.remove();
    },

    toggleFilterCategory(cat) {
        if (this.tableState.filterCategories.has(cat)) {
            this.tableState.filterCategories.delete(cat);
        } else {
            this.tableState.filterCategories.add(cat);
        }
        this.openFilterModal();
    },

    resetFilters() {
        this.tableState.filterCategories.clear();
        this.tableState.minRating = 0;
        this.tableState.maxRating = 5;
        this._userSorted = false;
        this.applyFilters();
    },

    applyFilters() {
        this.tableState.minRating = parseFloat(document.getElementById('minRating')?.value || 0);
        this.tableState.maxRating = parseFloat(document.getElementById('maxRating')?.value || 5);
        this.tableState.currentPage = 1;
        this.closeFilterModal();
        this.renderTable();
        this.showToast('筛选已应用');
    },

    openSortModal() {
        const existingModal = document.getElementById('sortModal');
        if (existingModal) existingModal.remove();
        
        const modalHtml = `
            <div id="sortModal" class="modal">
                <div class="modal-backdrop" onclick="App.closeSortModal()"></div>
                <div class="modal-content" style="max-width: 320px;">
                    <div class="modal-header">
                        <h3 class="modal-title">↕️ 排序</h3>
                        <button class="close-btn" onclick="App.closeSortModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <button class="btn btn-secondary" onclick="App.sortGames('id', 'asc')" style="text-align: left;">🆔 ID 正序</button>
                            <button class="btn btn-secondary" onclick="App.sortGames('id', 'desc')" style="text-align: left;">🆔 ID 倒序</button>
                            <button class="btn btn-secondary" onclick="App.sortGames('title', 'asc')" style="text-align: left;">📝 名称 A-Z</button>
                            <button class="btn btn-secondary" onclick="App.sortGames('title', 'desc')" style="text-align: left;">📝 名称 Z-A</button>
                            <button class="btn btn-secondary" onclick="App.sortGames('rating', 'desc')" style="text-align: left;">⭐ 评分 高-低</button>
                            <button class="btn btn-secondary" onclick="App.sortGames('rating', 'asc')" style="text-align: left;">⭐ 评分 低-高</button>
                            <button class="btn btn-secondary" onclick="App.sortGames('updateDate', 'desc')" style="text-align: left;">🕐 修改时间 新-旧</button>
                            <button class="btn btn-secondary" onclick="App.sortGames('updateDate', 'asc')" style="text-align: left;">🕐 修改时间 旧-新</button>
                            <button class="btn btn-secondary" onclick="App.sortGames('createDate', 'desc')" style="text-align: left;">📅 创建时间 新-旧</button>
                            <button class="btn btn-secondary" onclick="App.sortGames('createDate', 'asc')" style="text-align: left;">📅 创建时间 旧-新</button>
                            <button class="btn btn-secondary" onclick="App.sortGames('size', 'desc')" style="text-align: left;">📦 大小 大-小</button>
                            <button class="btn btn-secondary" onclick="App.sortGames('size', 'asc')" style="text-align: left;">📦 大小 小-大</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    closeSortModal() {
        const modal = document.getElementById('sortModal');
        if (modal) modal.remove();
    },

    randomSort() {
        for (let i = this.games.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.games[i], this.games[j]] = [this.games[j], this.games[i]];
        }
        this._userSorted = true;
        this.closeSortModal();
        this.renderTable();
        this.showToast('随机排序完成');
    },

    sortGames(column, direction) {
        this.games.sort((a, b) => {
            let valA, valB;
            
            if (column === 'id') {
                valA = a._rawData?.['文件ID'] || a.id || '';
                valB = b._rawData?.['文件ID'] || b.id || '';
                const numA = parseFloat(String(valA).replace(/[^0-9.]/g, ''));
                const numB = parseFloat(String(valB).replace(/[^0-9.]/g, ''));
                if (!isNaN(numA) && !isNaN(numB)) {
                    return direction === 'asc' ? numA - numB : numB - numA;
                }
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
            } else if (column === 'updateDate') {
                valA = a._rawData?.['最后修改时间'] || a.updateDate || '';
                valB = b._rawData?.['最后修改时间'] || b.updateDate || '';
                valA = this.parseChineseDate(valA);
                valB = this.parseChineseDate(valB);
            } else if (column === 'createDate') {
                valA = a._rawData?.['创建时间'] || '';
                valB = b._rawData?.['创建时间'] || '';
                valA = this.parseChineseDate(valA);
                valB = this.parseChineseDate(valB);
            } else if (column === 'title') {
                valA = (a.title || '').toLowerCase();
                valB = (b.title || '').toLowerCase();
            } else if (column === 'rating') {
                valA = parseFloat(a.rating) || 0;
                valB = parseFloat(b.rating) || 0;
            } else if (column === 'size') {
                valA = this.parseFileSize(a.title || '');
                valB = this.parseFileSize(b.title || '');
            } else {
                valA = a[column] || 0;
                valB = b[column] || 0;
            }
            
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
        
        this._userSorted = true;
        this.closeSortModal();
        this.renderTable();
        this.showToast('排序完成');
    },

    parseFileSize(str) {
        if (!str) return 0;
        const m = str.match(/([\d.]+)\s*(G|GB|M|MB|K|KB)/i);
        if (!m) return 0;
        const num = parseFloat(m[1]);
        const unit = m[2].toUpperCase();
        if (unit.startsWith('G')) return num * 1024;
        if (unit.startsWith('M')) return num;
        if (unit.startsWith('K')) return num / 1024;
        return num;
    },

    parseChineseDate(dateStr) {
        if (!dateStr) return new Date(0);
        if (dateStr instanceof Date) return dateStr;
        
        const str = String(dateStr);
        const match = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{1,2})/);
        if (match) {
            return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), parseInt(match[4]), parseInt(match[5]));
        }
        
        const isoMatch = str.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
            return new Date(str);
        }
        
        return new Date(0);
    },

    // 获取游戏的修改时间戳（用于排序），优先用精确的原始字段
    getGameDate(game) {
        // 1. 最优先：从 _rawData 取最后修改时间（有精确到分钟的时间）
        if (game._rawData) {
            const raw = game._rawData['最后修改时间'] || game._rawData['最后修改'] || '';
            if (raw) {
                const d = this.parseChineseDate(raw);
                if (d.getTime() > 0) return d.getTime();
            }
        }
        // 2. 兜底：用 updateDate 字段
        if (game.updateDate) {
            const d = new Date(game.updateDate);
            if (!isNaN(d.getTime())) return d.getTime();
        }
        // 3. 最兜底：id 越大越新
        return game.id || 0;
    },

    // 获取预览相册URL（用于懒加载提取图片）
    getPreviewUrl(game) {
        if (!game._rawData) return null;
        const preview = game._rawData['预览'] || '';
        if (preview && /^https?:\/\//i.test(preview) && !preview.includes('notion.com')) {
            return preview;
        }
        return null;
    },

    _previewCache: new Map(),

    extractDirectImageUrls(text) {
        if (!text) return [];
        const regex = /https?:\/\/[^\s,，;；\n\r|'"<>]+?\.(?:jpe?g|png|gif|webp|bmp)(?:\?[^\s,，;；\n\r|'"<>]*)?/gi;
        return [...new Set(text.match(regex) || [])];
    },

    extractAllHttpUrls(text) {
        if (!text) return [];
        const regex = /https?:\/\/[^\s,，;；\n\r|'"<>]+/gi;
        return [...new Set(text.match(regex) || [])];
    },

    async fetchAlbumImages(pageUrl) {
        let html = null;
        try {
            const proxyUrl = '/api/preview?url=' + encodeURIComponent(pageUrl);
            const resp = await fetch(proxyUrl, { cache: 'no-cache' });
            if (resp.ok) html = await resp.text();
        } catch(e) {}
        if (!html) return [];
        const imgs = [];
        const patterns = [
            /https?:\/\/[^"'\s>]+\.(?:jpe?g|png|gif|webp|bmp)(?:\?[^"'\s>]*)?/gi,
            /https?:\/\/i\.postimg\.cc\/[^"'\s>]+/gi,
            /https?:\/\/(?:i\.)?imgbox\.com\/[^"'\s>]+\.(?:jpe?g|png|gif|webp)/gi
        ];
        patterns.forEach(p => { let m; while ((m = p.exec(html)) !== null) imgs.push(m[0]); });
        return [...new Set(imgs)];
    },

    async expandAlbumUrl(url) {
        const lower = url.toLowerCase();
        if (lower.includes('/album/') || lower.includes('/gallery/') ||
            lower.includes('postimg.cc') || lower.includes('imgbox.com')) {
            return await this.fetchAlbumImages(url);
        }
        return [];
    },

    async resolvePreviewUrls(previewText) {
        if (!previewText) return [];
        const cached = this._previewCache.get(previewText);
        if (cached) return cached;

        let urls = this.extractDirectImageUrls(previewText);
        if (urls.length > 0) {
            this._previewCache.set(previewText, urls);
            return urls;
        }

        const allUrls = this.extractAllHttpUrls(previewText);
        const albumUrls = allUrls.filter(u => !urls.includes(u));
        for (const albumUrl of albumUrls) {
            try {
                const expanded = await this.expandAlbumUrl(albumUrl);
                urls = urls.concat(expanded);
            } catch(e) {}
        }
        urls = [...new Set(urls.filter(Boolean))];
        this._previewCache.set(previewText, urls);
        return urls;
    },

    async populateCoverUrls(game) {
        const previewText = this.getPreviewUrl(game);
        if (!previewText) { game.coverUrls = []; return; }
        const cached = this._previewCache.get(previewText);
        if (cached && cached.length > 0) { game.coverUrls = cached; return; }
        try {
            const urls = await this.resolvePreviewUrls(previewText);
            game.coverUrls = urls;
        } catch(e) { game.coverUrls = []; }
    },

    async preloadCoverUrls() {
        const batchSize = 5;
        for (let i = 0; i < this.games.length; i += batchSize) {
            const batch = this.games.slice(i, i + batchSize);
            await Promise.all(batch.map(g => this.populateCoverUrls(g)));
        }
        this.render();
    },

    renderTable() {
        const games = this.getFilteredGames();
        const total = games.length;

        const tbody = document.getElementById('tableBody');
        if (!tbody) {
            console.warn('tableBody元素不存在');
            return;
        }

        if (games.length === 0 && this.games.length === 0) {
            tbody.innerHTML = Array(6).fill('').map(() => `
                <div class="skeleton-card">
                    <div class="skeleton skeleton-avatar"></div>
                    <div class="skeleton-lines">
                        <div class="skeleton skeleton-line w80"></div>
                        <div class="skeleton skeleton-line w60"></div>
                        <div class="skeleton skeleton-line w40"></div>
                    </div>
                </div>
            `).join('');
            return;
        }

        tbody.innerHTML = games.map((game, index) => {
            const gameIndex = this.games.indexOf(game);
            const type = this.extractGameType(game.title || '') || this.extractGameType(game.category || '');
            const coverUrl = this.getGameCoverUrl(game);
            const gradient = this.getTypeGradient(type);
            const typeIcon = this.getGameTypeIcon(type);
            const coverClass = coverUrl ? '' : 'cover-noimage';

            return `
            <div class="game-card" data-index="${gameIndex}" onclick="App.editGameByIndex(${gameIndex})">
                <div class="game-cover ${coverClass}" style="background: ${gradient};">
                    ${coverUrl
                        ? `<img class="cover-img" src="${coverUrl}" alt="" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.remove('cover-loading');this.parentElement.classList.add('cover-noimage');" /><span style="display:none;">${typeIcon}</span>`
                        : `<span>${typeIcon}</span>`
                    }
                </div>
                <div class="game-info">
                    <div class="game-title">${this.escapeHtml(game.title || '未命名')}</div>
                    <div class="game-meta">
                        <span class="game-category">${this.escapeHtml(game.category || '其他')}</span>
                        <span class="game-rating">${this.getGradeDisplay(game) || ((game.rating && game.rating > 0) ? '⭐ ' + game.rating : '？')}</span>
                    </div>
                </div>
            </div>
        `}).join('');

        const tableInfo = document.getElementById('tableInfo');
        if (tableInfo) {
            tableInfo.textContent = `共 ${total} 条`;
        }
        
        this.updateProfileCounts();
    },

    // ========== 封面图懒加载 ==========
    _coverCache: {},       // { previewUrl: [imgUrl1, imgUrl2, ...] }
    _loadingPreviews: new Set(), // 正在加载的URL

    initCoverLazyLoad() {
        const cards = document.querySelectorAll('.game-card[data-preview]');
        if (!cards.length) return;

        if (!('IntersectionObserver' in window)) {
            // 不支持Observer，直接加载可见的前5个
            cards.forEach((card, i) => { if (i < 5) this.loadCoverImage(card); });
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadCoverImage(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        }, { rootMargin: '100px', threshold: 0.1 });

        cards.forEach(card => observer.observe(card));
    },

    async loadCoverImage(card) {
        const previewUrl = card.getAttribute('data-preview');
        if (!previewUrl) return;
        const img = card.querySelector('.cover-img');
        const placeholder = card.querySelector('.cover-placeholder');
        if (!img || !placeholder) return;

        // 已有缓存
        if (this._coverCache[previewUrl]) {
            const urls = this._coverCache[previewUrl];
            img.src = urls[Math.floor(Math.random() * urls.length)];
            img.style.display = '';
            placeholder.style.display = 'none';
            return;
        }

        // 正在加载中
        if (this._loadingPreviews.has(previewUrl)) return;
        this._loadingPreviews.add(previewUrl);

        try {
            const resp = await fetch('/api/preview?url=' + encodeURIComponent(previewUrl), {
                signal: AbortSignal.timeout(10000)
            });
            const html = await resp.text();
            const images = this.extractImagesFromHtml(html, previewUrl);

            if (images.length > 0) {
                this._coverCache[previewUrl] = images;
                const pick = images[Math.floor(Math.random() * images.length)];
                img.src = pick;
                img.style.display = '';
                placeholder.style.display = 'none';
            }
        } catch(e) {
            console.log('封面图加载失败:', e.message);
        } finally {
            this._loadingPreviews.delete(previewUrl);
        }
    },

    extractImagesFromHtml(html, baseUrl) {
        const imgs = [];

        // 1. <img src="..."> 标签
        const re = /<img[^>]+src=["']([^"'\s>]+)["']/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
            let src = m[1].replace(/&amp;/g, '&');
            if (/icon|logo|avatar|favicon|emoji|svg|1x1|pixel|tracking/i.test(src)) continue;
            if (!/^https?:\/\//i.test(src)) {
                try { src = new URL(src, baseUrl).href; } catch(e) { continue; }
            }
            if (src.length > 25 && /\.(jpg|jpeg|png|webp|bmp)(\?|$)/i.test(src) && !imgs.includes(src)) {
                imgs.push(src);
            }
        }

        // 2. moebox.io: /image/xxxx.xxxx 格式
        if (baseUrl.includes('moebox.io')) {
            const moeRe = /\/image\/([a-f0-9]{20,}\.[a-zA-Z0-9]{4,})/gi;
            while ((m = moeRe.exec(html)) !== null) {
                const u = 'https://pic.moebox.io/image/' + m[1];
                if (!imgs.includes(u)) imgs.push(u);
            }
        }

        // 3. ibb.co: og:image 或 class="image"
        if (baseUrl.includes('ibb.co')) {
            const ogRe = /content=["']([^"']*\.(?:jpg|jpeg|png|webp)[^"']*?)["'][^>]*property="og:image"/i;
            m = ogRe.exec(html);
            if (m && !imgs.includes(m[1])) imgs.unshift(m[1]);
            
            const clsRe = /<img[^>]+class="[^"]*image[^"]*"[^>]+src=["']([^"']+)["']/i;
            m = clsRe.exec(html);
            if (m && !imgs.includes(m[1])) imgs.unshift(m[1]);
        }

        // 4. tu.coklw.vip: 相对路径图片
        if (baseUrl.includes('coklw.vip')) {
            const cokRe = /src=["'](\/[^"']*\.(?:jpg|jpeg|png|webp)[^"']*?)["']/gi;
            while ((m = cokRe.exec(html)) !== null) {
                const u = 'https://tu.coklw.vip' + m[1];
                if (!imgs.includes(u)) imgs.push(u);
            }
        }

        return imgs;
    },

    // ========== 工具方法 ==========
    getGameGrade(game) {
        if (!game._rawData) return null;
        const gradeKey = Object.keys(game._rawData).find(k => k.includes('评级（成品级别）'));
        if (!gradeKey) return null;
        let val = (game._rawData[gradeKey] || '').toString().trim();
        if (!val || val === '0' || val === '-' || gradeKey === val) return null;
        // 处理各种格式：S / SS 80 / SSS 90 / A 50 / S(SS) / SS(SSS) 85 等
        val = val.replace(/\(.*?\)/g, '').trim();       // 去掉括号注释
        const m = val.match(/^(X|SSS|SS|S|A|B|C)\b/i);
        return m ? m[1].toUpperCase() : (val.length <= 3 ? val.toUpperCase() : null);
    },

    getGradeDisplay(game) {
        const grade = this.getGameGrade(game);
        if (!grade) return '';
        const colors = { X: '#ef4444', SSS: '#f97316', SS: '#eab308', S: '#22c55e', A: '#3b82f6', B: '#8b5cf6', C: '#64748b' };
        const color = colors[grade] || '#6366f1';
        return `<span class="game-rating" style="background:${color}20;color:${color};border:1px solid ${color}40;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">${grade}</span>`;
    },

    // 封面图：从预提取的 coverUrls 中随机取一张
    getGameCoverUrl(game) {
        try {
            if (!this._coverEnabled) return null;
            // 优先用预提取的 coverUrls
            const urls = game.coverUrls;
            if (urls && Array.isArray(urls) && urls.length > 0) {
                return urls[Math.floor(Math.random() * urls.length)];
            }
            // coverUrls 为空时，从预览字段直接提取图片URL
            const preview = this.getPreviewUrl(game);
            if (preview) {
                const direct = this.extractDirectImageUrls(preview);
                if (direct.length > 0) return direct[0];
            }
            return null;
        } catch(e) { return null; }
    },

    _coverResolving: new Set(),
    _resolveCoverAsync(game) {
        if (this._coverResolving.has(game.id)) return;
        const preview = this.getPreviewUrl(game);
        if (!preview) return;
        this._coverResolving.add(game.id);
        this.resolvePreviewUrls(preview).then(urls => {
            if (urls.length > 0) {
                game.coverUrls = urls;
                this.renderTable();
            }
            this._coverResolving.delete(game.id);
        }).catch(() => this._coverResolving.delete(game.id));
    },

    // 封面预览开关状态
    _coverEnabled: true,

    initCoverSetting() {
        try {
            this._coverEnabled = Storage.getItem('gamehub_cover_enabled') === 'true';
        } catch(e) { this._coverEnabled = false; }
    },

    setCoverEnabled(val) {
        this._coverEnabled = !!val;
        try { Storage.setItem('gamehub_cover_enabled', this._coverEnabled ? 'true' : 'false'); } catch(e) {}
        this.render();
    },

    // 验证弹窗（密码验证）
    showAgeVerifyModal() {
        const modalHtml = `
            <div id="ageVerifyModal" class="modal">
                <div class="modal-backdrop"></div>
                <div class="modal-content" style="max-width:340px;">
                    <div class="modal-header">
                        <h3 class="modal-title">⚠️ 内容提示</h3>
                    </div>
                    <div class="modal-body" style="text-align:center;">
                        <p style="color:#f87171;font-size:13px;margin-bottom:12px;">封面预览图可能包含敏感内容，确认要打开吗？</p>
                        <p style="font-size:12px;color:#64748b;margin-bottom:16px;">可前往 <a href="https://vlink.cc/bayj" target="_blank" style="color:#6366f1;">vlink.cc/bayj</a> 获取密码</p>
                        <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:16px;">
                            <input type="text" inputmode="text" autocomplete="off" id="ageInput" placeholder="请输入密码"
                                   style="width:180px;padding:8px 12px;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#e2e8f0;text-align:center;font-size:14px;" />
                        </div>
                        <div id="ageError" style="color:#f87171;font-size:12px;display:none;"></div>
                    </div>
                    <div class="modal-footer" style="justify-content:center;gap:12px;">
                        <button class="btn btn-secondary" onclick="document.getElementById('ageVerifyModal').remove()">取消</button>
                        <button class="btn btn-primary" onclick="App.verifyAge()">确认</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        setTimeout(() => {
            const input = document.getElementById('ageInput');
            if (input) input.focus();
        }, 100);
    },

    verifyAge() {
        const input = document.getElementById('ageInput');
        const err = document.getElementById('ageError');
        const val = (input?.value || '').trim();
        if (!val) {
            if (err) { err.style.display = 'block'; err.textContent = '请输入密码'; }
            return;
        }
        if (val === '彼岸余烬') {
            const modal = document.getElementById('ageVerifyModal');
            if (modal) modal.remove();
            this.setCoverEnabled(true);
            this.updateCoverToggleUI(true);
            App.showToast('封面预览已开启');
        } else {
            if (err) { err.style.display = 'block'; err.textContent = '密码错误。密码是4个字。不知道可前往上方网址查看，这还不知道的说明你真得关注我了>_<'; }
        }
    },

    updateCoverToggleUI(enabled) {
        const checkbox = document.getElementById('coverPreviewToggle');
        if (checkbox) checkbox.checked = enabled;
    },

    extractGameType(str) {
        if (!str) return '其他';
        // 宽松匹配：直接搜类型关键词，不限前缀
        const match = str.match(/\b(ACT|RPG|SLG|ADV|SIM|PUZ|STG|TBS|RTS|FTG|SPG|VN|TD|SRPG|ARPG|MMO|FPS|TPS|RAC|MUS|TAB|PZL|GAL)\b/i);
        return match ? match[1].toUpperCase() : '其他';
    },

    getGameTypes() {
        const typeSet = new Set();
        this.games.forEach(g => {
            const t = this.extractGameType(g.title || '') || this.extractGameType(g.category || '');
            typeSet.add(t);
        });
        const order = ['ACT','RPG','SLG','ADV','SIM','STG','PUZ','TBS','RTS','FTG','SPG','VN','ARPG','FPS','TD','SRPG','GAL','其他'];
        return Array.from(typeSet).sort((a,b) => (order.indexOf(a)||99) - (order.indexOf(b)||99));
    },

    getTypeGradient(type) {
        const g = {
            ACT:'linear-gradient(135deg,#ef4444,#f97316)', RPG:'linear-gradient(135deg,#8b5cf6,#6366f1)',
            SLG:'linear-gradient(135deg,#0ea5e9,#06b6d4)', ADV:'linear-gradient(135deg,#10b981,#059669)',
            SIM:'linear-gradient(135deg,#f59e0b,#eab308)', STG:'linear-gradient(135deg,#ec4899,#db2777)',
            PUZ:'linear-gradient(135deg,#14b8a6,#0d9488)', TBS:'linear-gradient(135deg,#64748b,#475569)',
            VN:'linear-gradient(135deg,#f43f5e,#e11d48)', GAL:'linear-gradient(135deg,#a855f7,#7c3aed)'
        };
        return g[type] || 'linear-gradient(135deg,#6366f1,#8b5cf6)';
    },

    getGameTypeIcon(type) {
        const i = {ACT:'⚔️',RPG:'🧙',SLG:'♟️',ADV:'🗺️',SIM:'💕',STG:'✈️',
                   PUZ:'🧩',TBS:'📊',VN:'📖',GAL:'💜'};
        return i[type] || '🎮';
    },

    escapeHtml(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    },

    exportData() {
        const games = this.getFilteredGames();
        const csv = 'ID,游戏名称,分类,评分,下载量,更新日期\n' +
            games.map(g => 
                `${g.id},"${g.title}",${g.category},${g.rating},${g.downloads},${this.formatDate(g.updateDate)}`
            ).join('\n');

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'gamehub_data.csv';
        link.click();
        this.showToast('数据已导出');
    },

    clearCache() {
        if (confirm('确定要重置数据吗？\n\n将清除本地缓存并重新同步最新数据。')) {
            // 只清除数据相关的缓存，保留配置
            const keys = ['gamehub_games', 'gamehub_nextId', 'gamehub_has_synced', 
                'gamehub_last_sync_time', 'gamehub_local_data_version',
                'gamehub_favorites', 'gamehub_view_history', 'gamehub_field_order'];
            keys.forEach(k => Storage.removeItem(k));
            
            // 清除预览图缓存
            this._previewCache = new Map();
            this._coverCache = {};
            
            this.games = [];
            this.nextId = 51;
            this.globalFields = null;
            
            this.showToast('缓存已清除，正在重新同步...');
            
            // 延迟后强制重新同步
            setTimeout(async () => {
                try {
                    // 重置同步时间，确保强制同步
                    Storage.removeItem('gamehub_last_sync_time');
                    Storage.removeItem('gamehub_has_synced');
                    await CloudSync.syncFromCloud();
                    this.showToast('重置完成，数据已更新');
                } catch(e) {
                    console.error('重置同步失败:', e);
                    this.showToast('同步失败: ' + e.message);
                }
            }, 500);
        }
    },

    openImportModal() {
        const modalHtml = `
            <div id="importModal" class="modal">
                <div class="modal-backdrop" onclick="App.closeImportModal()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">导入数据</h3>
                        <button class="close-btn" onclick="App.closeImportModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="import-tabs">
                            <button class="import-tab active" onclick="App.switchImportTab('json')">JSON格式</button>
                            <button class="import-tab" onclick="App.switchImportTab('csv')">CSV格式</button>
                        </div>
                        <div id="importJsonTab" class="import-content">
                            <p class="import-hint">请粘贴JSON格式的游戏数据：</p>
                            <textarea id="importJsonData" class="form-textarea" rows="10" placeholder='[
  {
    "title": "游戏名称",
    "icon": "🎮",
    "category": "动作",
    "rating": 4.5,
    "downloads": "100万+",
    "description": "游戏描述"
  }
]'></textarea>
                            <div class="import-example">
                                <a href="javascript:App.showJsonExample()">查看示例格式</a>
                            </div>
                        </div>
                        <div id="importCsvTab" class="import-content hidden">
                            <p class="import-hint">请粘贴CSV格式的游戏数据：</p>
                            <textarea id="importCsvData" class="form-textarea" rows="10" placeholder="游戏名称,图标,分类,评分,下载量,描述
星际探险,🚀,冒险,4.8,250万+,太空冒险游戏"></textarea>
                            <div class="import-example">
                                <a href="javascript:App.showCsvExample()">查看示例格式</a>
                            </div>
                        </div>
                        <div class="import-options">
                            <label class="import-option">
                                <input type="radio" name="importMode" value="append" checked>
                                <span>追加到现有数据</span>
                            </label>
                            <label class="import-option">
                                <input type="radio" name="importMode" value="replace">
                                <span>替换所有数据</span>
                            </label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="App.closeImportModal()">取消</button>
                        <button class="btn btn-primary" onclick="App.doImport()">导入</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    closeImportModal() {
        const modal = document.getElementById('importModal');
        if (modal) modal.remove();
    },

    switchImportTab(tab) {
        document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.import-tab:nth-child(${tab === 'json' ? 1 : 2})`).classList.add('active');
        
        document.getElementById('importJsonTab').classList.toggle('hidden', tab !== 'json');
        document.getElementById('importCsvTab').classList.toggle('hidden', tab !== 'csv');
    },

    showJsonExample() {
        const example = [
            {
                title: "星际探险",
                icon: "🚀",
                category: "冒险",
                rating: 4.8,
                downloads: "250万+",
                description: "一款开放世界太空冒险游戏"
            },
            {
                title: "王国保卫战",
                icon: "🏰",
                category: "策略",
                rating: 4.9,
                downloads: "500万+",
                description: "经典塔防游戏续作"
            }
        ];
        document.getElementById('importJsonData').value = JSON.stringify(example, null, 2);
    },

    showCsvExample() {
        const example = `游戏名称,图标,分类,评分,下载量,描述
星际探险,🚀,冒险,4.8,250万+,一款开放世界太空冒险游戏
王国保卫战,🏰,策略,4.9,500万+,经典塔防游戏续作`;
        document.getElementById('importCsvData').value = example;
    },

    doImport() {
        const mode = document.querySelector('input[name="importMode"]:checked').value;
        const jsonTab = document.getElementById('importJsonTab');
        const isJson = !jsonTab.classList.contains('hidden');
        
        try {
            let newGames = [];
            
            if (isJson) {
                const jsonStr = document.getElementById('importJsonData').value.trim();
                if (!jsonStr) {
                    this.showToast('请输入数据');
                    return;
                }
                newGames = JSON.parse(jsonStr);
            } else {
                const csvStr = document.getElementById('importCsvData').value.trim();
                if (!csvStr) {
                    this.showToast('请输入数据');
                    return;
                }
                newGames = this.parseCsv(csvStr);
            }

            if (!Array.isArray(newGames) || newGames.length === 0) {
                this.showToast('数据格式错误');
                return;
            }

            if (mode === 'replace') {
                this.games = [];
                this.nextId = 1;
            }

            newGames.forEach(g => {
                this.games.push({
                    id: this.nextId++,
                    title: g.title || g.游戏名称 || '未命名游戏',
                    icon: g.icon || g.图标 || '🎮',
                    category: g.category || g.分类 || '休闲',
                    rating: parseFloat(g.rating || g.评分 || 4.0).toFixed(1),
                    downloads: g.downloads || g.下载量 || '10万+',
                    description: g.description || g.描述 || '',
                    updateDate: new Date(),
                    isFavorite: false
                });
            });

            this.saveData();
            this.closeImportModal();
            this.render();
            this.showToast(`成功导入 ${newGames.length} 条数据`);
        } catch (e) {
            console.error('导入失败:', e);
            this.showToast('导入失败：' + e.message);
        }
    },

    parseCsv(csvStr) {
        const lines = csvStr.split('\n').filter(l => l.trim());
        if (lines.length < 2) return [];
        
        const headers = lines[0].split(',').map(h => h.trim());
        const games = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const game = {};
            headers.forEach((h, idx) => {
                game[h] = (values[idx] || '').trim();
            });
            games.push(game);
        }
        
        return games;
    },

    addNewGame() {
        this.openAddModal();
    },

    openAddModal() {
        const modalHtml = `
            <div id="addModal" class="modal">
                <div class="modal-backdrop" onclick="App.closeAddModal()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">添加新游戏</h3>
                        <button class="close-btn" onclick="App.closeAddModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">游戏名称 *</label>
                            <input type="text" id="addTitle" class="form-input" placeholder="请输入游戏名称">
                        </div>
                        <div class="form-group">
                            <label class="form-label">图标 (emoji)</label>
                            <input type="text" id="addIcon" class="form-input" value="🎮" placeholder="🎮">
                        </div>
                        <div class="form-group">
                            <label class="form-label">分类</label>
                            <select id="addCategory" class="form-select">
                                ${['动作', '角色扮演', '策略', '休闲', '竞技', '冒险'].map(c => 
                                    `<option value="${c}">${c}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">评分 (0-5)</label>
                            <input type="number" id="addRating" class="form-input" min="0" max="5" step="0.1" value="4.0">
                        </div>
                        <div class="form-group">
                            <label class="form-label">下载量</label>
                            <input type="text" id="addDownloads" class="form-input" value="10万+" placeholder="如：100万+">
                        </div>
                        <div class="form-group">
                            <label class="form-label">描述</label>
                            <textarea id="addDescription" class="form-textarea" placeholder="请输入游戏描述"></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="App.closeAddModal()">取消</button>
                        <button class="btn btn-primary" onclick="App.saveNewGame()">添加</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    closeAddModal() {
        const modal = document.getElementById('addModal');
        if (modal) modal.remove();
    },

    saveNewGame() {
        const title = document.getElementById('addTitle').value.trim();
        if (!title) {
            this.showToast('请输入游戏名称');
            return;
        }

        const game = {
            id: this.nextId++,
            title: title,
            icon: document.getElementById('addIcon').value || '🎮',
            category: document.getElementById('addCategory').value,
            rating: parseFloat(document.getElementById('addRating').value).toFixed(1),
            downloads: document.getElementById('addDownloads').value || '10万+',
            description: document.getElementById('addDescription').value || '',
            updateDate: new Date(),
            isFavorite: false
        };

        this.games.unshift(game);
        this.saveData();
        this.closeAddModal();
        this.render();
        this.showToast('已添加新游戏');
    },

    render() {
        // 默认始终按修改时间倒序（最新在前），除非用户手动选了其他排序
        if (!this._userSorted) {
            this.games.sort((a, b) => {
                const ta = this.getGameDate(a);
                const tb = this.getGameDate(b);
                return tb - ta;
            });
        }
        this.renderCarousel();
        this.renderCategories();
        this.renderHomeGames('');
        this.renderTable();
    },

    renderCarousel() {
        const track = document.getElementById('carouselTrack');
        const dots = document.getElementById('carouselDots');
        
        if (!track || !dots) return;
        
        track.innerHTML = this.carouselItems.map(item => `
            <div class="carousel-item" style="background: linear-gradient(135deg, ${item.color}, #8b5cf6);">
                <div class="carousel-content">
                    <h3>${item.title}</h3>
                    <p>${item.subtitle}</p>
                </div>
            </div>
        `).join('');

        dots.innerHTML = this.carouselItems.map((_, i) => `
            <div class="carousel-dot ${i === 0 ? 'active' : ''}"
                 onclick="App.goToCarousel(${i})"></div>
        `).join('');
    },

    startCarousel() {
        const track = document.getElementById('carouselTrack');
        if (!track) return;
        
        this.carouselInterval = setInterval(() => {
            this.carouselIndex = (this.carouselIndex + 1) % this.carouselItems.length;
            this.updateCarousel();
        }, 4000);
    },

    goToCarousel(index) {
        this.carouselIndex = index;
        this.updateCarousel();
    },

    updateCarousel() {
        const track = document.getElementById('carouselTrack');
        if (!track) return;
        
        track.style.transform = `translateX(-${this.carouselIndex * 100}%)`;

        document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === this.carouselIndex);
        });
    },

    renderCategories() {
        const container = document.getElementById('homeCategories');
        if (!container) return;
        container.innerHTML = this.categories.map(cat => `
            <div class="category-card" onclick="App.filterHomeCategory('${cat.name}')">
                <div class="category-card-icon">${cat.icon}</div>
                <div class="category-card-name">${cat.name}</div>
            </div>
        `).join('');
    },

    renderHomeGames(query) {
        const container = document.getElementById('homeGames');
        if (!container) return;
        
        let games = this.games.slice(0, 6);
        if (query) {
            const q = query.toLowerCase();
            games = this.games.filter(g => 
                g.title.toLowerCase().includes(q) ||
                g.category.toLowerCase().includes(q)
            ).slice(0, 6);
        }

        container.innerHTML = games.map(game => `
            <div class="game-card" onclick="App.editGame(${game.id})">
                <div class="game-cover">${game.icon}</div>
                <div class="game-info">
                    <div class="game-title">${game.title}</div>
                    <div class="game-meta">
                        <span class="game-category">${game.category}</span>
                    </div>
                </div>
            </div>
        `).join('');
    },

    filterHomeCategory(category) {
        document.getElementById('homeSearch').value = category;
        this.renderHomeGames(category);
        this.showToast(`显示 ${category} 游戏`);
    },

    openGame(id) {
        const game = this.games.find(g => g.id === id);
        if (game) {
            this.showToast(`打开 ${game.title}`);
        }
    },

    toggleView() {
        this.showToast('视图切换');
    },

    formatDate(date) {
        const d = new Date(date);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    },

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.remove('hidden');
        
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 2500);
    },

    openBackupPasswordModal() {
        const modalHtml = `
            <div id="backupPasswordModal" class="modal">
                <div class="modal-backdrop" onclick="App.closeBackupPasswordModal()"></div>
                <div class="modal-content" style="max-width: 350px;">
                    <div class="modal-header">
                        <h3 class="modal-title">请输入密码</h3>
                        <button class="close-btn" onclick="App.closeBackupPasswordModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">访问密码</label>
                            <input type="password" id="backupPasswordInput" class="form-input" placeholder="请输入密码" onkeypress="if(event.key==='Enter')App.verifyBackupPassword()">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="App.closeBackupPasswordModal()">取消</button>
                        <button class="btn btn-primary" onclick="App.verifyBackupPassword()">确认</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        setTimeout(() => document.getElementById('backupPasswordInput')?.focus(), 100);
    },

    closeBackupPasswordModal() {
        const modal = document.getElementById('backupPasswordModal');
        if (modal) modal.remove();
    },

    async verifyBackupPassword() {
        const input = document.getElementById('backupPasswordInput');
        const password = input?.value || '';
        
        if (password === 'BAYJ') {
            this.closeBackupPasswordModal();
            await CloudSync.loadCloudConfig();
            let notionUrl = CloudSync.config.notionEmbedUrl || 'https://resonant-laser-29e.notion.site/ebd//30ad9616662180568b20d6d607924c76?v=30ad96166621802abfa8000cc45c28e6';
            const iframe = document.getElementById('notionIframe');
            if (iframe) {
                iframe.src = notionUrl;
            }
            this.switchPage('notion');
        } else {
            this.showToast('密码错误');
            input.value = '';
            input.focus();
        }
    },

    async checkForUpdates() {
        const githubUrl = 'https://cdn.jsdelivr.net/gh/bianyujin/gameapp@v1.00/games.json';
        const localVersion = Storage.getItem('gamehub_local_data_version');
        
        try {
            const response = await fetch(githubUrl, { method: 'HEAD' });
            if (!response.ok) return;
            
            const lastModified = response.headers.get('Last-Modified');
            const etag = response.headers.get('ETag');
            const remoteVersion = lastModified || etag || Date.now().toString();
            
            const lastCheckTime = Storage.getItem('gamehub_last_update_check');
            const now = Date.now();
            
            if (lastCheckTime && (now - parseInt(lastCheckTime)) < 3600000) {
                return;
            }
            
            Storage.setItem('gamehub_last_update_check', now.toString());
            
            const saved = Storage.getItem('gamehub_games');
            if (!saved) {
                this.showUpdatePrompt();
                return;
            }
            
            const localData = JSON.parse(saved);
            if (!localData || localData.length === 0) {
                this.showUpdatePrompt();
                return;
            }
            
            const response2 = await fetch(githubUrl);
            if (!response2.ok) return;
            
            const remoteData = await response2.json();
            if (remoteData && Array.isArray(remoteData) && remoteData.length !== localData.length) {
                this.showUpdatePrompt();
                return;
            }
            
        } catch (e) {
            console.log('检查更新失败:', e);
        }
    },

    showUpdatePrompt() {
        const modalHtml = `
            <div id="updatePromptModal" class="modal">
                <div class="modal-backdrop" onclick="App.closeUpdatePrompt()"></div>
                <div class="modal-content" style="max-width: 350px;">
                    <div class="modal-header">
                        <h3 class="modal-title">发现新数据</h3>
                        <button class="close-btn" onclick="App.closeUpdatePrompt()">&times;</button>
                    </div>
                    <div class="modal-body" style="text-align: center; padding: 20px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">🔄</div>
                        <p style="color: #94a3b8; margin-bottom: 16px;">检测到 GitHub 有更新的游戏数据，是否立即同步？</p>
                    </div>
                    <div class="modal-footer" style="flex-direction: column; gap: 8px;">
                        <button class="btn btn-primary" style="width: 100%;" onclick="App.closeUpdatePrompt(); CloudSync.syncFromCloud();">立即同步</button>
                        <button class="btn btn-secondary" style="width: 100%;" onclick="App.closeUpdatePrompt()">稍后再说</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    closeUpdatePrompt() {
        const modal = document.getElementById('updatePromptModal');
        if (modal) modal.remove();
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
