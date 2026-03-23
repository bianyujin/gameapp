const App = {
    games: [],
    isAdmin: false,
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
        sortColumn: null,
        sortDirection: 'asc',
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
        this.isAdmin = localStorage.getItem('gamehub_is_admin') === 'true';
        this.loadData();
        this.bindEvents();
        this.render();
        this.startCarousel();
    },

    loadData() {
        const saved = localStorage.getItem('gamehub_games');
        const savedId = localStorage.getItem('gamehub_nextId');
        
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
    },

    saveData() {
        try {
            localStorage.setItem('gamehub_games', JSON.stringify(this.games));
            localStorage.setItem('gamehub_nextId', this.nextId.toString());
            console.log('数据已保存');
        } catch (e) {
            console.error('保存数据失败:', e);
            this.showToast('保存失败，存储空间可能已满');
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
            games = games.filter(g => g.isFavorite);
        } else if (this.tableTab === 'history') {
            games = games.slice(0, 15);
        }

        if (this.tableState.searchQuery) {
            const q = this.tableState.searchQuery.toLowerCase();
            games = games.filter(g => 
                g.title.toLowerCase().includes(q) ||
                g.category.toLowerCase().includes(q)
            );
        }

        if (this.tableState.filterCategories.size > 0) {
            games = games.filter(g => this.tableState.filterCategories.has(g.category));
        }

        games = games.filter(g => 
            parseFloat(g.rating) >= this.tableState.minRating &&
            parseFloat(g.rating) <= this.tableState.maxRating
        );

        if (this.tableState.sortColumn) {
            games.sort((a, b) => {
                let aVal = a[this.tableState.sortColumn];
                let bVal = b[this.tableState.sortColumn];

                if (this.tableState.sortColumn === 'rating') {
                    aVal = parseFloat(aVal);
                    bVal = parseFloat(bVal);
                } else if (this.tableState.sortColumn === 'updateDate') {
                    aVal = new Date(aVal);
                    bVal = new Date(bVal);
                }

                if (aVal < bVal) return this.tableState.sortDirection === 'asc' ? -1 : 1;
                if (aVal > bVal) return this.tableState.sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return games;
    },

    renderTable() {
        const games = this.getFilteredGames();
        const total = games.length;
        const start = (this.tableState.currentPage - 1) * this.tableState.pageSize;
        const end = start + this.tableState.pageSize;
        const pageGames = games.slice(start, end);
        const totalPages = Math.ceil(total / this.tableState.pageSize);

        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = pageGames.map((game, index) => {
            const gameIndex = this.games.indexOf(game);
            return `
            <tr data-index="${gameIndex}" onclick="App.editGameByIndex(${gameIndex})" style="cursor: pointer;">
                <td>
                    <div class="table-icon">${game.icon || '🎮'}</div>
                </td>
                <td>${game.title || '未命名'}</td>
                <td>${game.category || '其他'}</td>
                <td>
                    <span class="table-rating">⭐ ${game.rating || 0}</span>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="table-action-btn" onclick="event.stopPropagation(); App.editGameByIndex(${gameIndex})">详情</button>
                    </div>
                </td>
            </tr>
        `}).join('');

        document.getElementById('tableInfo').textContent = 
            `共 ${total} 条`;

        this.renderPagination(totalPages);
        
        this.updateProfileCounts();
    },

    updateProfileCounts() {
        const favoritesCount = document.getElementById('favoritesCount');
        const historyCount = document.getElementById('historyCount');
        if (favoritesCount) {
            favoritesCount.textContent = this.games.filter(g => g.isFavorite).length;
        }
        if (historyCount) {
            historyCount.textContent = this.viewHistory ? this.viewHistory.length : 0;
        }
    },

    showFavorites() {
        const favorites = this.games.filter(g => g.isFavorite);
        this.showListModal('我的收藏', favorites);
    },

    showHistory() {
        this.showListModal('浏览历史', this.viewHistory || []);
    },

    showListModal(title, items) {
        const listHtml = items.length > 0 ? items.map((item, i) => `
            <div class="list-item" onclick="App.closeListModal(); App.editGameByIndex(${this.games.indexOf(item)})" style="padding: 12px; border-bottom: 1px solid #334155; cursor: pointer;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 24px;">${item.icon || '🎮'}</span>
                    <div>
                        <div style="font-weight: 500;">${item.title || '未命名'}</div>
                        <div style="font-size: 12px; color: #94a3b8;">${item.category || '其他'} · ⭐ ${item.rating || 0}</div>
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
        const rawFields = game._rawFields || Object.keys(game._rawData || {});
        
        const rawFieldsHtml = rawFields.map((k, i) => `
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
        `).join('');

        const modalHtml = `
            <div id="editModal" class="modal">
                <div class="modal-backdrop" onclick="App.closeEditModal()"></div>
                <div class="modal-content" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h3 class="modal-title">📋 数据详情 ${this.isAdmin ? '<span style="font-size: 12px; color: #f59e0b;">[管理员模式]</span>' : ''}</h3>
                        <button class="close-btn" onclick="App.closeEditModal()">&times;</button>
                    </div>
                    <div class="modal-body">
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
                                <label class="form-label">评分</label>
                                <div class="form-input" style="background: #0f172a;">⭐ ${game.rating || 0}</div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">下载量</label>
                                <div class="form-input" style="background: #0f172a;">${game.downloads || '-'}</div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">描述</label>
                            <div class="form-textarea" style="background: #0f172a; min-height: 40px;">${game.description || '-'}</div>
                        </div>
                        
                        ${game.privateData && Object.keys(game.privateData).length > 0 ? `
                            <div style="background: #422006; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                                <label class="form-label" style="color: #f59e0b;">🔒 私有数据</label>
                                <div style="font-size: 13px; color: #fcd34d;">
                                    ${Object.keys(game.privateData).map(k => 
                                        `<div style="margin-bottom: 4px;"><strong>${k}:</strong> ${String(game.privateData[k]).substring(0, 100)}</div>`
                                    ).join('')}
                                </div>
                            </div>
                        ` : ''}
                        
                        ${rawFields.length > 0 ? `
                            <div style="border-top: 1px solid #334155; padding-top: 16px; margin-top: 8px;">
                                <label class="form-label" style="color: #94a3b8; margin-bottom: 12px;">
                                    📝 自定义字段 (${rawFields.length}个) ${this.isAdmin ? '- 点击↑↓调整顺序' : ''}
                                </label>
                                <div id="rawFieldsContainer">
                                    ${rawFieldsHtml}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="App.closeEditModal()" style="width: 100%;">关闭</button>
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
        
        localStorage.setItem('gamehub_field_order', JSON.stringify(fields));
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
                        <div class="form-textarea raw-field-value" data-field="${k}" style="font-size: 13px; background: #0f172a; min-height: 40px; white-space: pre-wrap; word-break: break-all;">${String(game._rawData[k] || '-')}</div>
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
        const cats = ['动作', '角色扮演', '策略', '休闲', '竞技', '冒险'];
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
                            <button class="btn btn-secondary" onclick="App.randomSort()" style="text-align: left;">🎲 随机推荐</button>
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
        this.closeSortModal();
        this.renderTable();
        this.showToast('随机排序完成');
    },

    sortGames(column, direction) {
        this.games.sort((a, b) => {
            let valA = a[column];
            let valB = b[column];
            
            if (column === 'updateDate' || column === 'createDate') {
                valA = new Date(valA || 0);
                valB = new Date(valB || 0);
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            } else if (typeof valA === 'number') {
                // 数字直接比较
            } else {
                valA = valA || 0;
                valB = valB || 0;
            }
            
            if (direction === 'asc') {
                return valA > valB ? 1 : -1;
            } else {
                return valA < valB ? 1 : -1;
            }
        });
        
        this.closeSortModal();
        this.renderTable();
        this.showToast('排序完成');
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
        if (confirm('确定要清除所有数据吗？这将删除所有自定义数据并恢复默认数据。')) {
            localStorage.removeItem('gamehub_games');
            localStorage.removeItem('gamehub_nextId');
            this.games = [];
            this.nextId = 51;
            this.loadSampleData();
            this.render();
            this.showToast('数据已重置');
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
        this.renderCarousel();
        this.renderCategories();
        this.renderHomeGames('');
        this.renderTable();
    },

    renderCarousel() {
        const track = document.getElementById('carouselTrack');
        track.innerHTML = this.carouselItems.map(item => `
            <div class="carousel-item" style="background: linear-gradient(135deg, ${item.color}, #8b5cf6);">
                <div class="carousel-content">
                    <h3>${item.title}</h3>
                    <p>${item.subtitle}</p>
                </div>
            </div>
        `).join('');

        const dots = document.getElementById('carouselDots');
        dots.innerHTML = this.carouselItems.map((_, i) => `
            <div class="carousel-dot ${i === 0 ? 'active' : ''}"
                 onclick="App.goToCarousel(${i})"></div>
        `).join('');
    },

    startCarousel() {
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
        track.style.transform = `translateX(-${this.carouselIndex * 100}%)`;

        document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === this.carouselIndex);
        });
    },

    renderCategories() {
        const container = document.getElementById('homeCategories');
        container.innerHTML = this.categories.map(cat => `
            <div class="category-card" onclick="App.filterHomeCategory('${cat.name}')">
                <div class="category-card-icon">${cat.icon}</div>
                <div class="category-card-name">${cat.name}</div>
            </div>
        `).join('');
    },

    renderHomeGames(query) {
        let games = this.games.slice(0, 8);
        if (query) {
            const q = query.toLowerCase();
            games = this.games.filter(g => 
                g.title.toLowerCase().includes(q) ||
                g.category.toLowerCase().includes(q)
            );
        }

        const container = document.getElementById('homeGames');
        container.innerHTML = games.map(game => `
            <div class="game-card" onclick="App.openGame(${game.id})">
                <div class="game-cover">${game.icon}</div>
                <div class="game-info">
                    <div class="game-title">${game.title}</div>
                    <div class="game-meta">
                        <span class="game-rating">⭐ ${game.rating}</span>
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
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
