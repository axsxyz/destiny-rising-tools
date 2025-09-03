// ===== DESTINY RISING THEORYCRAFT WEBAPP JAVASCRIPT =====

class DestinyRisingApp {
    constructor() {
        this.artifacts = [];
        this.currentPage = 0;
        this.artifactsPerPage = 12;
        this.currentBuild = { 1: null, 2: null, 3: null, 4: null };
        this.filters = { search: '', slot: '', category: '', sort: 'power_score' };
        this.selectedArtifactForModal = null;
        this.lenis = null;
        
        this.init();
    }

    async init() {
        try {
            this.showLoading(true);
            this.initSmoothScroll();
            await this.loadArtifacts();
            this.setupEventListeners();
            this.renderArtifacts();
            this.updateBuildStats();
            this.showLoading(false);
            this.showToast('Welcome to Destiny Rising Theorycrafting!', 'info');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showToast('Failed to load artifacts. Please refresh.', 'error');
            this.showLoading(false);
        }
    }

    initSmoothScroll() {
        // Wait for Lenis to load
        const initLenis = () => {
            if (typeof Lenis !== 'undefined') {
                this.lenis = new Lenis({
                    duration: 1.2,
                    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
                    smooth: true,
                    smoothTouch: false
                });

                const raf = (time) => {
                    this.lenis.raf(time);
                    requestAnimationFrame(raf);
                };
                requestAnimationFrame(raf);
                console.log('✅ Lenis smooth scroll initialized');
            } else {
                console.log('⚠️ Lenis not loaded, using native scroll');
            }
        };

        // Try immediate init, fallback to timeout
        if (typeof Lenis !== 'undefined') {
            initLenis();
        } else {
            setTimeout(initLenis, 100);
        }
    }

    async loadArtifacts() {
        const response = await fetch('/api/artifacts');
        const data = await response.json();
        this.artifacts = data.artifacts;
        document.getElementById('total-artifacts').textContent = this.artifacts.length;
    }

    setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', (e) => {
            this.filters.search = e.target.value;
            this.currentPage = 0;
            this.renderArtifacts();
        });

        // Filter dropdowns
        const slotFilter = document.getElementById('slot-filter');
        const categoryFilter = document.getElementById('category-filter');
        const sortFilter = document.getElementById('sort-filter');

        slotFilter.addEventListener('change', (e) => {
            this.filters.slot = e.target.value;
            this.currentPage = 0;
            this.renderArtifacts();
        });

        categoryFilter.addEventListener('change', (e) => {
            this.filters.category = e.target.value;
            this.currentPage = 0;
            this.renderArtifacts();
        });

        sortFilter.addEventListener('change', (e) => {
            this.filters.sort = e.target.value;
            this.currentPage = 0;
            this.renderArtifacts();
        });

        // Load more button
        document.getElementById('load-more').addEventListener('click', () => {
            this.currentPage++;
            this.renderArtifacts(true);
        });

        // Modal controls
        document.getElementById('modal-close').addEventListener('click', () => {
            this.hideModal();
        });

        document.getElementById('modal-cancel').addEventListener('click', () => {
            this.hideModal();
        });

        document.getElementById('modal-equip').addEventListener('click', () => {
            this.equipArtifact();
        });

        // Click outside modal to close
        document.getElementById('artifact-modal').addEventListener('click', (e) => {
            if (e.target.id === 'artifact-modal') {
                this.hideModal();
            }
        });

        // Slot click handlers
        for (let i = 1; i <= 4; i++) {
            document.getElementById(`slot-${i}`).addEventListener('click', () => {
                this.openSlotSelection(i);
            });
        }
    }

    getFilteredArtifacts() {
        let filtered = [...this.artifacts];

        // Apply search filter
        if (this.filters.search) {
            const searchLower = this.filters.search.toLowerCase();
            filtered = filtered.filter(artifact =>
                artifact.name.toLowerCase().includes(searchLower) ||
                artifact.effect.description.toLowerCase().includes(searchLower)
            );
        }

        // Apply slot filter
        if (this.filters.slot) {
            filtered = filtered.filter(artifact => artifact.slot === parseInt(this.filters.slot));
        }

        // Apply category filter
        if (this.filters.category) {
            filtered = filtered.filter(artifact => artifact.categories.primary === this.filters.category);
        }

        // Apply sorting
        switch (this.filters.sort) {
            case 'power_score':
                filtered.sort((a, b) => (b.gameplay_info.power_score || 0) - (a.gameplay_info.power_score || 0));
                break;
            case 'name':
                filtered.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'game8_tier':
                const tierOrder = { 'S': 4, 'A': 3, 'B': 2, 'C': 1 };
                filtered.sort((a, b) => (tierOrder[b.game8_tier] || 0) - (tierOrder[a.game8_tier] || 0));
                break;
        }

        return filtered;
    }

    renderArtifacts(append = false) {
        const filtered = this.getFilteredArtifacts();
        const grid = document.getElementById('artifacts-grid');
        const loadMoreBtn = document.getElementById('load-more');

        const start = this.currentPage * this.artifactsPerPage;
        const end = start + this.artifactsPerPage;
        const pageArtifacts = filtered.slice(start, end);

        if (!append) {
            grid.innerHTML = '';
        }

        pageArtifacts.forEach(artifact => {
            const card = this.createArtifactCard(artifact);
            grid.appendChild(card);
        });

        // Update load more button
        if (end >= filtered.length) {
            loadMoreBtn.style.display = 'none';
        } else {
            loadMoreBtn.style.display = 'block';
            loadMoreBtn.textContent = `LOAD MORE (${filtered.length - end} remaining)`;
        }
    }

    createArtifactCard(artifact) {
        const card = document.createElement('div');
        card.className = 'artifact-card';
        card.addEventListener('click', () => this.showArtifactModal(artifact));

        const isEquipped = Object.values(this.currentBuild).some(equipped => equipped?.id === artifact.id);
        const equippedClass = isEquipped ? 'equipped' : '';

        card.innerHTML = `
            <div class="artifact-header">
                <img src="${artifact.icon?.url || artifact.icon || '/placeholder-icon.png'}" alt="${artifact.name}" class="artifact-icon" loading="lazy" 
                     onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NSIgZmlsbD0iIzMzMyIvPjx0ZXh0IHg9IjUwIiB5PSI2MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iNDAiPj88L3RleHQ+PC9zdmc+'"
                <div class="artifact-info">
                    <h3>${artifact.name}</h3>
                    <div class="artifact-meta">
                        <span class="slot-badge">SLOT ${artifact.slot}</span>
                        <span class="tier-badge ${artifact.game8_tier}">${artifact.game8_tier}</span>
                        <span class="category-badge">${artifact.categories.primary.toUpperCase()}</span>
                    </div>
                </div>
            </div>
            <div class="artifact-description">
                ${artifact.effect.description}
            </div>
            <div class="artifact-stats">
                <div class="power-score">${artifact.gameplay_info.power_score || 0}</div>
                <div class="mechanics-list">
                    ${artifact.mechanics.slice(0, 3).map(m => `<span class="mechanic-tag">${m}</span>`).join('')}
                    ${artifact.mechanics.length > 3 ? `<span class="mechanic-tag">+${artifact.mechanics.length - 3}</span>` : ''}
                </div>
            </div>
            ${isEquipped ? '<div class="equipped-indicator">✓ EQUIPPED</div>' : ''}
        `;

        if (isEquipped) {
            card.classList.add(equippedClass);
        }

        return card;
    }

    showArtifactModal(artifact) {
        this.selectedArtifactForModal = artifact;
        const modal = document.getElementById('artifact-modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        const equipBtn = document.getElementById('modal-equip');

        title.textContent = artifact.name;
        
        const isEquipped = Object.values(this.currentBuild).some(equipped => equipped?.id === artifact.id);
        
        body.innerHTML = `
            <div class="modal-artifact-details">
                <div class="modal-artifact-header">
                    <img src="${artifact.icon?.url || artifact.icon || '/placeholder-icon.png'}" alt="${artifact.name}" class="modal-artifact-icon" 
                         onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NSIgZmlsbD0iIzMzMyIvPjx0ZXh0IHg9IjUwIiB5PSI2MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iNDAiPj88L3RleHQ+PC9zdmc+'">
                    <div class="modal-artifact-info">
                        <div class="modal-artifact-meta">
                            <span class="slot-badge">SLOT ${artifact.slot}</span>
                            <span class="tier-badge ${artifact.game8_tier}">${artifact.game8_tier}</span>
                            <span class="category-badge">${artifact.categories.primary.toUpperCase()}</span>
                        </div>
                        <div class="power-score-large">${artifact.gameplay_info.power_score || 0} POWER</div>
                    </div>
                </div>
                
                <div class="modal-effect-description">
                    <h4>ARTIFACT EFFECT</h4>
                    <p>${artifact.effect.description}</p>
                </div>

                ${artifact.effect.triggers.length > 0 ? `
                <div class="modal-triggers">
                    <h4>ACTIVATION TRIGGERS</h4>
                    <ul>
                        ${artifact.effect.triggers.map(trigger => `<li>${trigger}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}

                <div class="modal-mechanics">
                    <h4>MECHANICS</h4>
                    <div class="modal-mechanics-grid">
                        ${artifact.mechanics.map(mechanic => `<span class="mechanic-tag">${mechanic}</span>`).join('')}
                    </div>
                </div>

                <div class="modal-playstyles">
                    <h4>PLAYSTYLES</h4>
                    <div class="playstyle-tags">
                        ${artifact.categories.playstyle.map(style => `<span class="playstyle-tag">${style}</span>`).join('')}
                    </div>
                </div>
            </div>
        `;

        equipBtn.textContent = isEquipped ? 'UNEQUIP ARTIFACT' : 'EQUIP ARTIFACT';
        equipBtn.disabled = false;

        modal.classList.add('active');
    }

    hideModal() {
        document.getElementById('artifact-modal').classList.remove('active');
        this.selectedArtifactForModal = null;
    }

    equipArtifact() {
        if (!this.selectedArtifactForModal) return;

        const artifact = this.selectedArtifactForModal;
        const targetSlot = artifact.slot;
        
        // Check if already equipped
        const currentlyEquippedSlot = Object.keys(this.currentBuild).find(slot => 
            this.currentBuild[slot]?.id === artifact.id
        );

        if (currentlyEquippedSlot) {
            // Unequip
            this.currentBuild[currentlyEquippedSlot] = null;
            this.updateSlotDisplay(parseInt(currentlyEquippedSlot));
            this.showToast(`${artifact.name} unequipped from Slot ${currentlyEquippedSlot}`, 'info');
        } else {
            // Check if target slot is occupied
            if (this.currentBuild[targetSlot]) {
                const previousArtifact = this.currentBuild[targetSlot];
                this.showToast(`${previousArtifact.name} replaced with ${artifact.name}`, 'info');
            } else {
                this.showToast(`${artifact.name} equipped to Slot ${targetSlot}`, 'success');
            }
            
            // Equip to target slot
            this.currentBuild[targetSlot] = artifact;
            this.updateSlotDisplay(targetSlot);
        }

        this.updateBuildStats();
        this.renderArtifacts(); // Re-render to update equipped indicators
        this.hideModal();
    }

    updateSlotDisplay(slotNumber) {
        const slot = document.getElementById(`slot-${slotNumber}`);
        const artifact = this.currentBuild[slotNumber];

        if (artifact) {
            slot.className = 'artifact-slot equipped';
            slot.innerHTML = `
                <div class="artifact-in-slot">
                    <img src="${artifact.icon?.url || artifact.icon || '/placeholder-icon.png'}" alt="${artifact.name}" class="artifact-image"
                         onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NSIgZmlsbD0iIzMzMyIvPjx0ZXh0IHg9IjUwIiB5PSI2MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iNDAiPj88L3RleHQ+PC9zdmc+'">>
                    <div class="artifact-name">${artifact.name}</div>
                    <div class="artifact-category">${artifact.categories.primary}</div>
                    <button class="remove-artifact" onclick="app.removeArtifact(${slotNumber})">×</button>
                </div>
            `;
        } else {
            slot.className = 'artifact-slot empty';
            const slotNumbers = { 1: '01', 2: '02', 3: '03', 4: '04' };
            
            slot.innerHTML = `
                <div class="slot-placeholder">
                    <div class="placeholder-number">${slotNumbers[slotNumber]}</div>
                    <span class="placeholder-text">CLICK TO EQUIP</span>
                </div>
            `;
        }
    }

    removeArtifact(slotNumber) {
        const artifact = this.currentBuild[slotNumber];
        if (artifact) {
            this.currentBuild[slotNumber] = null;
            this.updateSlotDisplay(slotNumber);
            this.updateBuildStats();
            this.renderArtifacts();
            this.showToast(`${artifact.name} removed from Slot ${slotNumber}`, 'info');
        }
    }

    openSlotSelection(slotNumber) {
        // Filter artifacts for this slot
        this.filters.slot = slotNumber.toString();
        this.filters.search = '';
        this.currentPage = 0;
        
        // Update filter UI
        document.getElementById('slot-filter').value = slotNumber.toString();
        document.getElementById('search-input').value = '';
        
        this.renderArtifacts();
        
        // Scroll to browser section with Lenis
        if (this.lenis) {
            this.lenis.scrollTo('.browser-section');
        } else {
            document.querySelector('.browser-section').scrollIntoView({ behavior: 'smooth' });
        }
        
        this.showToast(`Showing artifacts for Slot ${slotNumber}`, 'info');
    }

    async updateBuildStats() {
        const equippedArtifacts = Object.values(this.currentBuild).filter(Boolean);
        const artifactIds = equippedArtifacts.map(a => a.id);

        try {
            if (artifactIds.length > 0) {
                const response = await fetch('/api/builds/calculate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ artifacts: artifactIds })
                });
                
                const buildData = await response.json();
                this.displayBuildStats(buildData);
            } else {
                this.displayEmptyBuildStats();
            }
        } catch (error) {
            console.error('Failed to calculate build stats:', error);
            this.displayEmptyBuildStats();
        }
    }

    displayBuildStats(buildData) {
        const stats = buildData.combined_stats;
        const synergies = buildData.synergies;
        const analysis = buildData.build_analysis;

        // Update header build power
        document.getElementById('build-power').textContent = Math.round(analysis.build_score);

        // Update power level badge
        const powerLevelBadge = document.getElementById('power-level');
        powerLevelBadge.textContent = analysis.power_level;
        powerLevelBadge.className = `power-level-badge ${analysis.power_level}`;

        // Update individual stats
        const totalDamageBonus = stats.damage_bonuses.reduce((sum, val) => sum + val, 0);
        const totalDamageResistance = stats.damage_resistance.reduce((sum, val) => sum + val, 0);
        const totalShieldPower = stats.shield_bonuses.reduce((sum, val) => sum + val, 0);
        const totalHealing = stats.healing_values.reduce((sum, val) => sum + val, 0);

        document.getElementById('damage-bonus').textContent = `+${totalDamageBonus.toFixed(1)}%`;
        document.getElementById('damage-resistance').textContent = `+${totalDamageResistance.toFixed(1)}%`;
        document.getElementById('shield-power').textContent = `+${totalShieldPower.toFixed(0)}`;
        document.getElementById('healing-power').textContent = `+${totalHealing.toFixed(0)}`;

        // Update synergy bar
        const synergyPercentage = Math.min(synergies.total_synergy * 100, 100);
        document.getElementById('synergy-fill').style.width = `${synergyPercentage}%`;
        document.getElementById('synergy-value').textContent = `${synergyPercentage.toFixed(0)}%`;

        // Update equipped artifacts descriptions
        this.displayEquippedArtifacts(buildData.artifacts);
    }

    displayEmptyBuildStats() {
        document.getElementById('build-power').textContent = '0';
        document.getElementById('power-level').textContent = 'COMMON';
        document.getElementById('power-level').className = 'power-level-badge COMMON';
        
        document.getElementById('damage-bonus').textContent = '+0%';
        document.getElementById('damage-resistance').textContent = '+0%';
        document.getElementById('shield-power').textContent = '+0';
        document.getElementById('healing-power').textContent = '+0';
        
        document.getElementById('synergy-fill').style.width = '0%';
        document.getElementById('synergy-value').textContent = '0%';
        
        // Clear equipped artifacts descriptions
        this.displayEquippedArtifacts([]);
    }

    displayEquippedArtifacts(artifacts) {
        const container = document.getElementById('equipped-artifacts-list');
        const equippedSection = document.getElementById('equipped-artifacts');
        
        if (!artifacts || artifacts.length === 0) {
            equippedSection.style.display = 'none';
            return;
        }
        
        equippedSection.style.display = 'block';
        container.innerHTML = '';
        
        artifacts.forEach(artifact => {
            const item = document.createElement('div');
            item.className = 'equipped-artifact-item';
            
            item.innerHTML = `
                <div class="equipped-artifact-header">
                    <img src="${artifact.icon?.url || artifact.icon || '/placeholder-icon.png'}" 
                         alt="${artifact.name}" class="equipped-artifact-icon"
                         onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NSIgZmlsbD0iIzMzMyIvPjx0ZXh0IHg9IjUwIiB5PSI2MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iNDAiPj88L3RleHQ+PC9zdmc+'">
                    <span class="equipped-artifact-name">${artifact.name}</span>
                    <span class="equipped-artifact-slot">SLOT ${artifact.slot}</span>
                </div>
                <div class="equipped-artifact-description">
                    ${artifact.effect.description}
                </div>
            `;
            
            container.appendChild(item);
        });
    }

    showLoading(show) {
        const loading = document.getElementById('loading-overlay');
        if (show) {
            loading.classList.add('active');
        } else {
            loading.classList.remove('active');
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: inherit; margin-left: 1rem; cursor: pointer;">×</button>
            </div>
        `;
        
        container.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }
}

// Modal styles are now in styles.css

// Initialize the app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new DestinyRisingApp();
});

// Make app globally accessible for remove button
window.app = app;