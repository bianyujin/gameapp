const ReviewSystem = {
    currentUser: null,

    init() {
        this.loadUser();
    },

    loadUser() {
        const saved = localStorage.getItem('gamehub_current_user');
        if (saved) {
            this.currentUser = JSON.parse(saved);
        }
    },

    saveUser() {
        if (this.currentUser) {
            localStorage.setItem('gamehub_current_user', JSON.stringify(this.currentUser));
        }
    },

    openUserLogin() {
        const modalHtml = `
            <div id="userLoginModal" class="modal">
                <div class="modal-backdrop" onclick="document.getElementById('userLoginModal').remove()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">👤 用户登录</h3>
                        <button class="close-btn" onclick="document.getElementById('userLoginModal').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">昵称</label>
                            <input type="text" id="userNickname" class="form-input" placeholder="输入你的昵称">
                        </div>
                        <p class="form-hint">无需注册，输入昵称即可使用</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="ReviewSystem.doLogin()">开始使用</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    doLogin() {
        const nickname = document.getElementById('userNickname').value.trim();
        if (!nickname) {
            App.showToast('请输入昵称');
            return;
        }

        this.currentUser = {
            id: Date.now().toString(),
            name: nickname,
            createdAt: new Date().toISOString()
        };
        
        let users = JSON.parse(localStorage.getItem('gamehub_users') || '[]');
        if (!users.find(u => u.name === nickname)) {
            users.push(this.currentUser);
            localStorage.setItem('gamehub_users', JSON.stringify(users));
        }
        
        this.saveUser();
        document.getElementById('userLoginModal').remove();
        App.showToast(`欢迎，${nickname}！`);
        
        if (typeof App !== 'undefined') {
            App.render();
        }
    },

    isLoggedIn() {
        return this.currentUser !== null;
    },

    openReviewModal(gameId) {
        if (!this.isLoggedIn()) {
            this.openUserLogin();
            return;
        }

        const game = App.games.find(g => g.id === gameId);
        if (!game) return;

        const existingReview = this.getUserReview(gameId);
        
        const modalHtml = `
            <div id="reviewModal" class="modal">
                <div class="modal-backdrop" onclick="document.getElementById('reviewModal').remove()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">📝 ${existingReview ? '编辑评价' : '写评价'}</h3>
                        <button class="close-btn" onclick="document.getElementById('reviewModal').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="review-game-info">
                            <span class="game-icon-large">${game.icon}</span>
                            <div>
                                <div class="game-title-large">${game.title}</div>
                                <div class="game-category-large">${game.category}</div>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">评分</label>
                            <div class="rating-stars" id="ratingStars">
                                ${[1,2,3,4,5].map(i => `
                                    <span class="star ${existingReview && i <= existingReview.rating ? 'active' : ''}" 
                                          data-rating="${i}" 
                                          onclick="ReviewSystem.setRating(${i})">★</span>
                                `).join('')}
                            </div>
                            <input type="hidden" id="reviewRating" value="${existingReview?.rating || 0}">
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">评价内容</label>
                            <textarea id="reviewContent" class="form-textarea" rows="4" 
                                      placeholder="分享你对这款游戏的看法...">${existingReview?.content || ''}</textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('reviewModal').remove()">取消</button>
                        <button class="btn btn-primary" onclick="ReviewSystem.submitReview(${gameId})">提交</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    setRating(rating) {
        document.getElementById('reviewRating').value = rating;
        document.querySelectorAll('#ratingStars .star').forEach((star, index) => {
            star.classList.toggle('active', index < rating);
        });
    },

    getUserReview(gameId) {
        const reviews = JSON.parse(localStorage.getItem('gamehub_reviews') || '[]');
        return reviews.find(r => r.gameId === gameId && r.userId === this.currentUser?.id);
    },

    submitReview(gameId) {
        const rating = parseInt(document.getElementById('reviewRating').value);
        const content = document.getElementById('reviewContent').value.trim();

        if (rating === 0) {
            App.showToast('请选择评分');
            return;
        }

        if (!content) {
            App.showToast('请填写评价内容');
            return;
        }

        const game = App.games.find(g => g.id === gameId);
        
        const review = {
            id: Date.now().toString(),
            gameId: gameId,
            gameTitle: game?.title,
            userId: this.currentUser.id,
            userName: this.currentUser.name,
            rating: rating,
            content: content,
            createdAt: new Date().toISOString()
        };

        let reviews = JSON.parse(localStorage.getItem('gamehub_reviews') || '[]');
        
        const existingIndex = reviews.findIndex(r => 
            r.gameId === gameId && r.userId === this.currentUser.id
        );
        
        if (existingIndex > -1) {
            reviews[existingIndex] = review;
        } else {
            reviews.push(review);
        }
        
        localStorage.setItem('gamehub_reviews', JSON.stringify(reviews));
        
        document.getElementById('reviewModal').remove();
        App.showToast('评价已提交');
        
        this.updateGameRating(gameId);
    },

    updateGameRating(gameId) {
        const reviews = JSON.parse(localStorage.getItem('gamehub_reviews') || '[]');
        const gameReviews = reviews.filter(r => r.gameId === gameId);
        
        if (gameReviews.length > 0) {
            const avgRating = gameReviews.reduce((sum, r) => sum + r.rating, 0) / gameReviews.length;
            const game = App.games.find(g => g.id === gameId);
            if (game) {
                game.userRating = avgRating.toFixed(1);
                game.reviewCount = gameReviews.length;
                App.saveData();
            }
        }
    },

    getGameReviews(gameId) {
        const reviews = JSON.parse(localStorage.getItem('gamehub_reviews') || '[]');
        return reviews.filter(r => r.gameId === gameId).sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );
    },

    renderReviewsList(gameId) {
        const reviews = this.getGameReviews(gameId);
        
        if (reviews.length === 0) {
            return '<p class="no-reviews">暂无评价，成为第一个评价的人吧！</p>';
        }

        return reviews.map(r => `
            <div class="review-item">
                <div class="review-header">
                    <span class="review-user-name">${r.userName}</span>
                    <span class="review-rating">⭐ ${r.rating}</span>
                    <span class="review-date">${this.formatDate(r.createdAt)}</span>
                </div>
                <div class="review-content">${r.content}</div>
            </div>
        `).join('');
    },

    formatDate(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff/60000)}分钟前`;
        if (diff < 86400000) return `${Math.floor(diff/3600000)}小时前`;
        if (diff < 604800000) return `${Math.floor(diff/86400000)}天前`;
        
        return date.toLocaleDateString();
    },

    getGameAverageRating(gameId) {
        const reviews = this.getGameReviews(gameId);
        if (reviews.length === 0) return null;
        
        const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
        return {
            average: avg.toFixed(1),
            count: reviews.length
        };
    }
};

document.addEventListener('DOMContentLoaded', () => ReviewSystem.init());
