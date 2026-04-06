const AdminSystem = {
    config: {
        adminPassword: '520hd123',
        isAdmin: false,
        firebaseConfig: null
    },

    init() {
        this.loadConfig();
        this.checkAdminStatus();
    },

    loadConfig() {
        const saved = localStorage.getItem('gamehub_admin_config');
        if (saved) {
            this.config = { ...this.config, ...JSON.parse(saved) };
        }
        if (!this.config.adminPassword) {
            this.config.adminPassword = 'admin123';
            this.saveConfig();
        }
    },

    saveConfig() {
        localStorage.setItem('gamehub_admin_config', JSON.stringify(this.config));
    },

    checkAdminStatus() {
        this.config.isAdmin = localStorage.getItem('gamehub_is_admin') === 'true';
        if (typeof App !== 'undefined') {
            App.isAdmin = this.config.isAdmin;
        }
    },

    login(password) {
        if (password === this.config.adminPassword) {
            this.config.isAdmin = true;
            localStorage.setItem('gamehub_is_admin', 'true');
            App.isAdmin = true;
            return true;
        }
        return false;
    },

    logout() {
        this.config.isAdmin = false;
        localStorage.removeItem('gamehub_is_admin');
        App.isAdmin = false;
    },

    openAdminLogin() {
        const modalHtml = `
            <div id="adminLoginModal" class="modal">
                <div class="modal-backdrop" onclick="AdminSystem.closeAdminLogin()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">🔐 管理员登录</h3>
                        <button class="close-btn" onclick="AdminSystem.closeAdminLogin()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">管理员密码</label>
                            <input type="password" id="adminPassword" class="form-input" placeholder="请输入管理员密码">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="AdminSystem.closeAdminLogin()">取消</button>
                        <button class="btn btn-primary" onclick="AdminSystem.doLogin()">登录</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    closeAdminLogin() {
        const modal = document.getElementById('adminLoginModal');
        if (modal) modal.remove();
    },

    async doLogin() {
        const password = document.getElementById('adminPassword').value;
        const isValid = await CloudSync.verifyAdminPassword(password);
        if (isValid) {
            this.config.isAdmin = true;
            localStorage.setItem('gamehub_is_admin', 'true');
            App.isAdmin = true;
            this.closeAdminLogin();
            App.showToast('✅ 管理员登录成功');
            location.reload();
        } else {
            App.showToast('❌ 密码错误');
        }
    },

    openAdminPanel() {
        if (!this.config.isAdmin) {
            this.openAdminLogin();
            return;
        }

        const modalHtml = `
            <div id="adminPanelModal" class="modal">
                <div class="modal-backdrop" onclick="AdminSystem.closeAdminPanel()"></div>
                <div class="modal-content admin-panel">
                    <div class="modal-header">
                        <h3 class="modal-title">⚙️ 管理员控制面板</h3>
                        <button class="close-btn" onclick="AdminSystem.closeAdminPanel()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="admin-stats">
                            <div class="admin-stat-card">
                                <div class="stat-value">${App.games.length}</div>
                                <div class="stat-label">游戏总数</div>
                            </div>
                            <div class="admin-stat-card">
                                <div class="stat-value">${this.getReviewCount()}</div>
                                <div class="stat-label">评论总数</div>
                            </div>
                            <div class="admin-stat-card">
                                <div class="stat-value">${this.getUserCount()}</div>
                                <div class="stat-label">用户数</div>
                            </div>
                        </div>

                        <div class="admin-section">
                            <h4>数据管理</h4>
                            <div class="admin-actions">
                                <button class="btn btn-secondary" onclick="App.addNewGame()">添加游戏</button>
                                <button class="btn btn-secondary" onclick="AdminSystem.exportAllData()">导出所有数据</button>
                                <button class="btn btn-secondary" onclick="AdminSystem.openImportModal()">批量导入</button>
                                <button class="btn btn-primary" onclick="CloudSync.syncNotionToFirebase()">从Notion导入到Firebase</button>
                            </div>
                        </div>

                        <div class="admin-section">
                            <h4>评论管理</h4>
                            <div class="admin-reviews-list" id="adminReviewsList">
                                ${this.renderRecentReviews()}
                            </div>
                        </div>

                        <div class="admin-section">
                            <h4>设置</h4>
                            <div class="form-group">
                                <label class="form-label">GitHub Config URL (config.json 下载地址)</label>
                                <input type="text" id="githubConfigUrl" class="form-input" 
                                       value="${CloudSync.config.githubConfigUrl}" placeholder="https://github.com/.../config.json">
                            </div>
                            <div class="form-group">
                                <label class="form-label">管理员密码</label>
                                <input type="password" id="newAdminPassword" class="form-input" 
                                       value="${this.config.adminPassword}" placeholder="设置管理员密码">
                            </div>
                            <h5>Notion 配置 (备用)</h5>
                            <div class="form-group">
                                <label class="form-label">Notion Integration Token</label>
                                <input type="password" id="notionToken" class="form-input" 
                                       value="${CloudSync.config.notionToken}" placeholder="secret_xxxxxxxxxxxxxxxx">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Notion 数据库 ID</label>
                                <input type="text" id="notionDatabaseId" class="form-input" 
                                       value="${CloudSync.config.notionDatabaseId}" placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
                            </div>
                            <button class="btn btn-primary" onclick="AdminSystem.saveAdminSettings()">保存设置</button>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="AdminSystem.logoutAdmin()">退出登录</button>
                        <button class="btn btn-primary" onclick="AdminSystem.closeAdminPanel()">关闭</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    closeAdminPanel() {
        const modal = document.getElementById('adminPanelModal');
        if (modal) modal.remove();
    },

    logoutAdmin() {
        this.logout();
        this.closeAdminPanel();
        App.showToast('已退出管理员模式');
        location.reload();
    },

    saveAdminPassword() {
        this.config.adminPassword = document.getElementById('newAdminPassword').value;
        this.saveConfig();
        App.showToast('设置已保存');
    },

    saveAdminSettings() {
        this.config.adminPassword = document.getElementById('newAdminPassword').value;
        CloudSync.config.githubConfigUrl = document.getElementById('githubConfigUrl').value;
        CloudSync.config.notionToken = document.getElementById('notionToken').value;
        CloudSync.config.notionDatabaseId = document.getElementById('notionDatabaseId').value;
        this.saveConfig();
        CloudSync.saveConfig();
        App.showToast('设置已保存');
    },

    getReviewCount() {
        const reviews = JSON.parse(localStorage.getItem('gamehub_reviews') || '[]');
        return reviews.length;
    },

    getUserCount() {
        const users = JSON.parse(localStorage.getItem('gamehub_users') || '[]');
        return users.length;
    },

    renderRecentReviews() {
        const reviews = JSON.parse(localStorage.getItem('gamehub_reviews') || '[]');
        if (reviews.length === 0) {
            return '<p class="no-data">暂无评论</p>';
        }

        return reviews.slice(-5).reverse().map(r => `
            <div class="admin-review-item">
                <div class="review-header">
                    <span class="review-game">${r.gameTitle || '游戏'}</span>
                    <span class="review-rating">⭐ ${r.rating}</span>
                    <span class="review-user">${r.userName || '匿名'}</span>
                </div>
                <div class="review-content">${r.content}</div>
                <button class="btn-small danger" onclick="AdminSystem.deleteReview('${r.id}')">删除</button>
            </div>
        `).join('');
    },

    deleteReview(id) {
        if (!confirm('确定删除此评论？')) return;
        
        let reviews = JSON.parse(localStorage.getItem('gamehub_reviews') || '[]');
        reviews = reviews.filter(r => r.id !== id);
        localStorage.setItem('gamehub_reviews', JSON.stringify(reviews));
        
        App.showToast('评论已删除');
        this.closeAdminPanel();
        this.openAdminPanel();
    },

    exportAllData() {
        const data = {
            games: App.games,
            reviews: JSON.parse(localStorage.getItem('gamehub_reviews') || '[]'),
            users: JSON.parse(localStorage.getItem('gamehub_users') || '[]'),
            exportDate: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gamehub_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        App.showToast('数据已导出');
    },

    openImportModal() {
        const modalHtml = `
            <div id="adminImportModal" class="modal">
                <div class="modal-backdrop" onclick="document.getElementById('adminImportModal').remove()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">📥 批量导入</h3>
                        <button class="close-btn" onclick="document.getElementById('adminImportModal').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">选择JSON文件</label>
                            <input type="file" id="importFile" accept=".json" class="form-input">
                        </div>
                        <p class="form-hint">支持之前导出的备份文件</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('adminImportModal').remove()">取消</button>
                        <button class="btn btn-primary" onclick="AdminSystem.doImport()">导入</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    doImport() {
        const fileInput = document.getElementById('importFile');
        const file = fileInput.files[0];
        
        if (!file) {
            App.showToast('请选择文件');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                if (data.games) {
                    App.games = data.games;
                    App.nextId = Math.max(...data.games.map(g => g.id)) + 1;
                    App.saveData();
                }
                
                if (data.reviews) {
                    localStorage.setItem('gamehub_reviews', JSON.stringify(data.reviews));
                }
                
                if (data.users) {
                    localStorage.setItem('gamehub_users', JSON.stringify(data.users));
                }
                
                App.render();
                document.getElementById('adminImportModal').remove();
                App.showToast('导入成功');
            } catch (err) {
                App.showToast('文件格式错误');
            }
        };
        reader.readAsText(file);
    }
};

document.addEventListener('DOMContentLoaded', () => AdminSystem.init());
