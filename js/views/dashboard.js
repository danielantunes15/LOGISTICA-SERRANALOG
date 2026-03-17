// js/views/dashboard.js
import { mapManager } from '../maps.js';
import { dataCache } from '../dataCache.js';
import { showToast, showLoading, hideLoading, calculateDistance } from '../helpers.js';
import { CAMINHAO_ROUTE_STATUS } from '../constants.js';
import { getCurrentShift } from '../timeUtils.js';
import { fetchEscalaFuncionarios, fetchEscalaTurnos } from '../api.js';

// Coordenadas da usina (Definidas aqui para o cálculo Haversine)
const USINA_COORDS = [-17.642301, -40.181525];
const INITIAL_ZOOM = 14;

export class DashboardView {
    constructor() {
        this.container = null;
        this.data = {};
        this.autoRefreshInterval = null; 
        this.activeFilters = {
            usina: true,
            ativa: true,
            fazendo_cata: true,
            inativa: true,
            ocorrencia: true 
        };
        this._boundStatusUpdateHandler = this.handleStatusUpdate.bind(this);
    }

    async show() {
        await this.loadHTML();
        await this.initializeMap();
        await this.loadData();
        this.addEventListeners();
        window.addEventListener('statusUpdated', this._boundStatusUpdateHandler);
    }

    async hide() {
        window.removeEventListener('statusUpdated', this._boundStatusUpdateHandler);
    }

    handleStatusUpdate(e) {
        const tables = ['caminhoes', 'frentes_servico', 'ocorrencias'];
        if (tables.includes(e.detail.table)) {
             this.loadData(true);
        }
    }

    async loadHTML() {
        const container = document.getElementById('views-container');
        container.innerHTML = this.getHTML();
        this.container = container;
    }

    mockFrenteCycleTime(frenteId) {
        if (frenteId % 3 === 0) return '03h 45m';
        if (frenteId % 3 === 1) return '04h 10m';
        return '05h 05m';
    }

    getHTML() {
        return `
            <div id="dashboard-view" class="view active-view">
                <div class="dashboard-header">
                    <h1>Dashboard de Operações Florestais</h1>
                    <button class="btn-primary" id="refresh-operations">
                        <i class="ph-fill ph-arrows-clockwise"></i>
                        Atualizar
                    </button>
                </div>

                <div class="map-fullscreen">
                    <div id="dashboard-map"></div>

                    <div class="modern-dashboard-overlay">
                        <div class="stats-panel">
                            <div class="panel-header">
                                <h3>Status das Operações</h3>
                                <div class="on-shift-info">
                                    <div id="on-shift-drivers"></div>
                                    <div id="on-shift-controllers"></div>
                                </div>
                                <div class="last-update" id="last-update">
                                    Atualizado agora
                                </div>
                            </div>

                            <div class="stats-grid">

                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon">
                                            <i class="ph-fill ph-truck"></i>
                                        </div>
                                        <div class="stat-title">Caminhões</div>
                                    </div>
                                    <div class="stat-content status-3-cols">
                                        <div class="stat-main">
                                            <span class="stat-value small-value" id="caminhoes-em-operacao">0</span>
                                            <span class="stat-label">Em Operação</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-value ready small-value" id="caminhoes-prontos">0</span>
                                            <span class="stat-label">Prontos / Pátio</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-badge danger small-value" id="caminhoes-criticos">0</span>
                                            <span class="stat-label">Inativos Críticos</span>
                                        </div>
                                    </div>
                                    <div class="stat-total">
                                        Total: <span id="caminhoes-total">0</span>
                                    </div>
                                </div>

                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon" style="background: linear-gradient(135deg, #2B6CB0, #4C77A5);">
                                            <i class="ph-fill ph-users-three"></i>
                                        </div>
                                        <div class="stat-title">Frentes</div>
                                    </div>
                                    <div class="stat-content status-3-cols">
                                        <div class="stat-main">
                                            <span class="stat-value small-value" id="frentes-ativas">0</span>
                                            <span class="stat-label">Ativas (Colheita)</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-value warning small-value" id="frentes-cata">0</span>
                                            <span class="stat-label">Em Cata</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-badge danger small-value" id="frentes-inativas">0</span>
                                            <span class="stat-label">Inativas</span>
                                        </div>
                                    </div>
                                    <div class="stat-total">
                                        Total: <span id="frentes-total">0</span>
                                    </div>
                                </div>

                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon" style="background: linear-gradient(135deg, #D69E2E, #B7791F);">
                                            <i class="ph-fill ph-tractor"></i>
                                        </div>
                                        <div class="stat-title">Equipamentos</div>
                                    </div>
                                    <div class="stat-content status-3-cols">
                                        <div class="stat-main">
                                            <span class="stat-value small-value" id="equipamentos-em-operacao">0</span>
                                            <span class="stat-label">Em Operação</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-value ready small-value" id="equipamentos-disponiveis">0</span>
                                            <span class="stat-label">Disponíveis (Livre)</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-badge danger small-value" id="equipamentos-criticos">0</span>
                                            <span class="stat-label">Inativos Críticos</span>
                                        </div>
                                    </div>
                                    <div class="stat-total">
                                        Total: <span id="equipamentos-total">0</span>
                                    </div>
                                </div>

                                <div class="stat-card">
                                    <div class="stat-header">
                                        <div class="stat-icon" style="background: linear-gradient(135deg, #805AD5, #6A49B8);">
                                            <i class="ph-fill ph-tree-evergreen"></i>
                                        </div>
                                        <div class="stat-title">Fazendas</div>
                                    </div>
                                    <div class="stat-content status-3-cols">
                                        <div class="stat-main">
                                            <span class="stat-value small-value" id="fazendas-colhendo">0</span>
                                            <span class="stat-label">Colhendo</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-value info-metric small-value" id="raio-medio-km">--</span>
                                            <span class="stat-label">Raio Médio (Km)</span>
                                        </div>
                                        <div class="stat-secondary">
                                            <span class="stat-value small-value" id="fazendas-disponiveis">0</span>
                                            <span class="stat-label">Disponíveis</span>
                                        </div>
                                    </div>
                                    <div class="stat-total">
                                        Total: <span id="fazendas-total">0</span>
                                    </div>
                                </div>
                            </div>

                            <div class="panel-footer">
                                <div class="efficiency-metric">
                                    <div class="metric-label">Eficiência Geral</div>
                                    <div class="metric-value">
                                        <span id="eficiencia-geral">0%</span>
                                        <div class="metric-bar">
                                            <div class="metric-fill" id="eficiencia-bar"></div>
                                        </div>
                                    </div>
                                </div>
                                <div class="active-now">
                                    <i class="ph-fill ph-pulse"></i>
                                    <span id="operacoes-ativas">0</span> operações ativas
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="map-legend" id="map-legend"> <div class="legend-title">Legenda</div>
                        <div class="legend-items">
                            <div class="legend-item ${this.activeFilters.ocorrencia ? '' : 'disabled'}" data-filter-key="ocorrencia">
                                <i class="ph-fill ph-siren" style="font-size: 20px; color: #ED8936; width: 16px; text-align: center;"></i>
                                <span>Ocorrência</span>
                            </div>

                            <div class="legend-item ${this.activeFilters.usina ? '' : 'disabled'}" data-filter-key="usina"> <div class="legend-color usina"></div>
                                <span>Usina</span>
                            </div>
                            <div class="legend-item ${this.activeFilters.ativa ? '' : 'disabled'}" data-filter-key="ativa">
                                <div class="legend-color colhendo"></div>
                                <span>Colhendo</span>
                            </div>
                            <div class="legend-item ${this.activeFilters.fazendo_cata ? '' : 'disabled'}" data-filter-key="fazendo_cata">
                                <div class="legend-color fazendo_cata"></div>
                                <span>Cata</span>
                            </div>
                            <div class="legend-item ${this.activeFilters.inativa ? '' : 'disabled'}" data-filter-key="inativa">
                                <div class="legend-color atencao"></div>
                                <span>Frentes com Atenção</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async initializeMap() {
        return new Promise(resolve => {
            setTimeout(() => {
                const map = mapManager.initDashboardMap();
                if (map) {
                    console.log('Mapa principal inicializado com sucesso');
                    mapManager.invalidateSize('dashboard-map');
                }
                resolve();
            }, 100);
        });
    }

    async loadData(forceRefresh = false) {
        try {
            this.data = await dataCache.fetchMetadata(forceRefresh);
            this.updateDashboardStats();
            this.updateMap();
            await this.updateOnShiftStaff();
            this.updateLastUpdateTime();
        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
            showToast('Erro ao carregar dados', 'error');
        }
    }

    updateDashboardStats() {
        const { caminhoes, frentes_servico, equipamentos, fazendas } = this.data;

        const operationalStatuses = CAMINHAO_ROUTE_STATUS;
        const readyStatuses = ['disponivel', 'patio_vazio'];
        
        // NOVO: Adicionado 'pendente_checklist' para ser contabilizado como crítico no painel
        const criticalStatuses = ['quebrado', 'parado', 'pendente_checklist'];

        const totalCaminhoes = caminhoes ? caminhoes.length : 0;
        const caminhoesEmOperacao = caminhoes ? caminhoes.filter(c => operationalStatuses.includes(c.status)).length : 0;
        const caminhoesProntos = caminhoes ? caminhoes.filter(c => readyStatuses.includes(c.status)).length : 0;
        const caminhoesCriticos = caminhoes ? caminhoes.filter(c => criticalStatuses.includes(c.status)).length : 0;

        const totalFrentes = frentes_servico ? frentes_servico.length : 0;
        const frentesAtivas = frentes_servico ? frentes_servico.filter(f => f.status === 'ativa').length : 0;
        const frentesCata = frentes_servico ? frentes_servico.filter(f => f.status === 'fazendo_cata').length : 0;
        const frentesInativas = frentes_servico ? frentes_servico.filter(f => f.status === 'inativa' || !f.status).length : 0;

        const totalEquipamentos = equipamentos ? equipamentos.length : 0;
        const equipamentosEmOperacao = equipamentos ? equipamentos.filter(e => e.status === 'ativo' && e.frente_id).length : 0;
        const equipamentosDisponiveis = equipamentos ? equipamentos.filter(e => e.status === 'ativo' && !e.frente_id).length : 0;
        const equipamentosCriticos = equipamentos ? equipamentos.filter(e => criticalStatuses.includes(e.status)).length : 0;

        const totalFazendas = fazendas ? fazendas.length : 0;
        const fazendasAtivasIds = new Set(frentes_servico.filter(f => f.fazenda_id && f.status === 'ativa').map(f => f.fazenda_id));
        const fazendasColhendo = fazendasAtivasIds.size;
        const fazendasDisponiveis = frentes_servico ? frentes_servico.filter(f => f.fazenda_id && f.status === 'inativa').length : 0;

        let totalDistance = 0;
        let countHarvestingFazendas = 0;

        fazendas.forEach(f => {
            if (fazendasAtivasIds.has(f.id) && f.latitude && f.longitude) {
                const lat = parseFloat(f.latitude);
                const lon = parseFloat(f.longitude);
                if (!isNaN(lat) && !isNaN(lon)) {
                    const distance = calculateDistance(USINA_COORDS[0], USINA_COORDS[1], lat, lon);
                    totalDistance += distance;
                    countHarvestingFazendas++;
                }
            }
        });

        const averageRadius = countHarvestingFazendas > 0 ? (totalDistance / countHarvestingFazendas).toFixed(1) : '--';

        this.updateStatElement('caminhoes-em-operacao', caminhoesEmOperacao);
        this.updateStatElement('caminhoes-prontos', caminhoesProntos);
        this.updateStatElement('caminhoes-criticos', caminhoesCriticos);
        this.updateStatElement('caminhoes-total', totalCaminhoes);

        this.updateStatElement('frentes-ativas', frentesAtivas);
        this.updateStatElement('frentes-cata', frentesCata);
        this.updateStatElement('frentes-inativas', frentesInativas);
        this.updateStatElement('frentes-total', totalFrentes);

        this.updateStatElement('equipamentos-em-operacao', equipamentosEmOperacao);
        this.updateStatElement('equipamentos-disponiveis', equipamentosDisponiveis);
        this.updateStatElement('equipamentos-criticos', equipamentosCriticos);
        this.updateStatElement('equipamentos-total', totalEquipamentos);

        this.updateStatElement('fazendas-colhendo', fazendasColhendo);
        this.updateStatElement('raio-medio-km', averageRadius);
        this.updateStatElement('fazendas-disponiveis', fazendasDisponiveis);
        this.updateStatElement('fazendas-total', totalFazendas);

        const totalActive = caminhoesEmOperacao + equipamentosEmOperacao + frentesAtivas + frentesCata;
        const totalOverallResources = totalCaminhoes + totalEquipamentos + totalFrentes;
        const eficiencia = totalOverallResources > 0 ? Math.round((totalActive / totalOverallResources) * 100) : 0;

        this.updateStatElement('eficiencia-geral', `${eficiencia}%`);
        this.updateEfficiencyBar(eficiencia);
        this.updateStatElement('operacoes-ativas', totalActive);
    }

    async updateOnShiftStaff() {
        // NOVOS IDs CAPTURADOS DO HTML
        const driversEl = document.getElementById('on-shift-drivers');
        const controllersEl = document.getElementById('on-shift-controllers');
        if (!driversEl || !controllersEl) return;

        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const currentShiftInfo = getCurrentShift();

            // Busca os dados da escala
            const funcionarios = await fetchEscalaFuncionarios();
            const turnosHoje = await fetchEscalaTurnos(todayStr, todayStr);

            // Mapeia os turnos de hoje para fácil acesso
            const turnosMap = new Map();
            turnosHoje.forEach(t => {
                turnosMap.set(t.funcionario_id, t.turno);
            });

            // 1. Conta quantos Motoristas estão no turno atual (Verifica se 'motorista' faz parte do cargo)
            const activeDriversCount = funcionarios.filter(f =>
                f.funcao && f.funcao.toLowerCase().includes('motorista') &&
                turnosMap.get(f.id) === currentShiftInfo.turno
            ).length;

            // 2. Filtra os nomes dos Controladores de Tráfego no turno atual
            const onShiftControllers = funcionarios.filter(f =>
                f.funcao && (f.funcao.toLowerCase().includes('controlador') || f.funcao.toLowerCase().includes('trafego') || f.funcao.toLowerCase().includes('tráfego')) &&
                turnosMap.get(f.id) === currentShiftInfo.turno
            ).map(f => f.nome).join(', ');

            // Atualiza o HTML com visual moderno
            driversEl.innerHTML = `Motoristas Ativos: <span style="font-weight: 600; color: var(--accent-primary);">${activeDriversCount} na escala</span>`;
            controllersEl.innerHTML = `Controlador de Tráfego: <span style="font-weight: 600;">${onShiftControllers || 'Nenhum escalado'}</span>`;

        } catch (error) {
            console.error('Erro ao buscar equipe do turno:', error);
            driversEl.innerHTML = `Motoristas Ativos: <span>Erro</span>`;
            controllersEl.innerHTML = `Controlador de Tráfego: <span>Erro</span>`;
        }
    }

    updateStatElement(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            if (typeof value === 'number' && !isNaN(value)) {
                this.animateCount(element, parseInt(element.textContent) || 0, value);
            } else {
                element.textContent = value;
            }
        }
    }

    animateCount(element, start, end) {
        const duration = 800;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const currentValue = Math.floor(start + (end - start) * easeOut);
            element.textContent = currentValue;

            if (progress < 1) requestAnimationFrame(update);
            else element.textContent = end;
        }
        requestAnimationFrame(update);
    }

    updateEfficiencyBar(percentage) {
        const bar = document.getElementById('eficiencia-bar');
        if (bar) {
            bar.style.width = `${percentage}%`;
            if (percentage >= 80) bar.style.background = 'linear-gradient(90deg, #38A169, #2F855A)';
            else if (percentage >= 60) bar.style.background = 'linear-gradient(90deg, #D69E2E, #B7791F)';
            else bar.style.background = 'linear-gradient(90deg, #E53E3E, #C53030)';
        }
    }

    updateLastUpdateTime() {
        const element = document.getElementById('last-update');
        if (element) {
            const now = new Date();
            element.textContent = `Atualizado: ${now.toLocaleTimeString('pt-BR')}`;
        }
    }

    updateMap() {
        const { fazendas, frentes_servico, caminhoes, equipamentos } = this.data;
        if (!fazendas || fazendas.length === 0) {
            mapManager.maps.get('dashboard-map')?.setView(USINA_COORDS, 10);
            mapManager.updateFazendaMarkersWithStatus([], this.activeFilters);
            this.updateOcorrenciaMarkers();
            return;
        }

        const fazendaDataMap = new Map();
        const cycleStatuses = CAMINHAO_ROUTE_STATUS;
        const frenteMap = new Map(frentes_servico.map(f => [f.id, f]));

        fazendas.forEach(f => {
             fazendaDataMap.set(f.id, { ...f, frenteStatus: null, trucksInRoute: 0, activeEquipment: 0, frenteNome: 'N/A' });
        });

        caminhoes.forEach(c => {
            if (c.frente_id && cycleStatuses.includes(c.status)) {
                const frente = frenteMap.get(c.frente_id);
                if (frente && frente.fazenda_id && fazendaDataMap.has(frente.fazenda_id)) {
                    fazendaDataMap.get(frente.fazenda_id).trucksInRoute++;
                }
            }
        });

        equipamentos.forEach(e => {
            if (e.frente_id && e.status === 'ativo') {
                 const frente = frenteMap.get(e.frente_id);
                if (frente && frente.fazenda_id && fazendaDataMap.has(frente.fazenda_id)) {
                    fazendaDataMap.get(frente.fazenda_id).activeEquipment++;
                }
            }
        });

        frentes_servico.filter(f => f.fazenda_id && (f.status === 'ativa' || f.status === 'fazendo_cata' || f.status === 'inativa'))
                       .forEach(frente => {
                           if (fazendaDataMap.has(frente.fazenda_id)) {
                               const data = fazendaDataMap.get(frente.fazenda_id);
                               data.frenteStatus = frente.status;
                               data.frenteNome = frente.nome || 'N/A';
                               data.frente_id = frente.id;
                               data.cycleTime = this.mockFrenteCycleTime(frente.id);
                           }
                       });

        const fazendasNoMapa = Array.from(fazendaDataMap.values()).filter(f => f.frenteStatus !== null);

        mapManager.updateFazendaMarkersWithStatus(fazendasNoMapa, this.activeFilters);
        this.updateOcorrenciaMarkers();

        if (fazendasNoMapa.length > 0 || this.activeFilters.ocorrencia) {
            this.adjustMapToShowFazendas(fazendasNoMapa);
        } else {
            mapManager.maps.get('dashboard-map')?.setView(USINA_COORDS, 10);
            this.updateLastUpdateTime();
        }
    }

    async updateOcorrenciaMarkers() {
        const fullData = await dataCache.fetchAllData();
        const ocorrencias = fullData.ocorrencias || [];
        const map = mapManager.maps.get('dashboard-map');

        if (!map) return;
        mapManager.clearMarkers('dashboard-ocorrencias');

        if (!this.activeFilters.ocorrencia) return;

        ocorrencias.forEach(ocorrencia => {
            if (ocorrencia.status === 'aberto' && ocorrencia.latitude && ocorrencia.longitude) {
                const coords = [parseFloat(ocorrencia.latitude), parseFloat(ocorrencia.longitude)];

                const ocorrenciaIcon = L.divIcon({
                    className: 'ocorrencia-marker',
                    html: `
                        <div class="marker-pin" style="background-color: #ED8936; border-radius: 50%; width: 40px; height: 40px; margin: 0; display: flex; align-items: center; justify-content: center;">
                            <i class="ph-fill ph-siren" style="font-size: 24px; color: black; transform: rotate(0deg);"></i>
                        </div>
                        <div class="marker-pulse" style="background-color: #ED8936;"></div>
                    `,
                    iconSize: [40, 40],
                    iconAnchor: [20, 40]
                });

                const marker = L.marker(coords, { icon: ocorrenciaIcon });

                const popupContent = `
                    <div class="fazenda-popup" style="min-width: 200px;">
                        <h4>OCORRÊNCIA: ${this.formatOption(ocorrencia.tipo)}</h4>
                        <div class="popup-status fazendo_cata" style="background: rgba(237, 137, 54, 0.2); color: #ED8936;">
                            <i class="ph-fill ph-circle"></i>
                            ${ocorrencia.status === 'aberto' ? 'EM ABERTO' : 'RESOLVIDO'}
                        </div>
                        <div class="popup-details">
                            <p><strong>Detalhes:</strong> <span class="value">${ocorrencia.descricao}</span></p>
                            <p><strong>Frentes Impactadas:</strong> <span class="value">${(ocorrencia.frentes_impactadas || []).length}</span></p>
                            <p><strong>Registro:</strong> <span class="value">${new Date(ocorrencia.created_at).toLocaleDateString('pt-BR')}</span></p>
                        </div>
                        <div class="popup-actions">
                            <button class="btn-primary btn-action-map" data-action="goToOcorrencias" data-ocorrencia-id="${ocorrencia.id}" title="Gerenciar Ocorrência">
                                <i class="ph-fill ph-siren"></i> Gerenciar Ocorrência
                            </button>
                        </div>
                    </div>
                `;

                marker.bindPopup(popupContent);
                marker.addTo(map);

                marker.on('popupopen', () => {
                     const btn = document.querySelector('[data-action="goToOcorrencias"]');
                     if (btn) {
                         btn.addEventListener('click', () => {
                             window.dispatchEvent(new CustomEvent('viewChanged', { detail: { view: 'ocorrencias' } }));
                         });
                     }
                 });

                if (!mapManager.markers.has('dashboard-ocorrencias')) mapManager.markers.set('dashboard-ocorrencias', []);
                mapManager.markers.get('dashboard-ocorrencias').push(marker);
            }
        });
    }

    formatOption(option) {
        if (!option || typeof option !== 'string') return 'N/A';
        return option.charAt(0).toUpperCase() + option.slice(1).replace('_', ' ');
    }

    adjustMapToShowFazendas(fazendas) {
        const map = mapManager.maps.get('dashboard-map');
        if (!map) return;

        const bounds = this.calculateBounds(fazendas);

        if (this.activeFilters.ocorrencia) {
            const ocorrenciasMarkers = mapManager.markers.get('dashboard-ocorrencias') || [];
            ocorrenciasMarkers.forEach(marker => bounds.extend(marker.getLatLng()));
        }

        if (bounds.isValid()) {
            map.fitBounds(bounds, {
                paddingTopLeft: [50, 200],
                paddingBottomRight: [50, 50],
                maxZoom: 14 
            });
        }
    }

    calculateBounds(fazendas) {
        const bounds = L.latLngBounds();
        bounds.extend(USINA_COORDS);
        fazendas.forEach(fazenda => {
            if (fazenda.latitude && fazenda.longitude) {
                bounds.extend([parseFloat(fazenda.latitude), parseFloat(fazenda.longitude)]);
            }
        });
        return bounds;
    }

    addEventListeners() {
        const refreshBtn = document.getElementById('refresh-operations');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadData(true);
                showToast('Operações atualizadas', 'success');
            });
        }

        const legend = document.getElementById('map-legend');
        if (legend) {
            legend.addEventListener('click', (e) => {
                const item = e.target.closest('.legend-item');
                const filterKey = item?.dataset.filterKey;

                if (filterKey) {
                    if (filterKey === 'usina') return;
                    this.activeFilters[filterKey] = !this.activeFilters[filterKey];
                    item.classList.toggle('disabled');
                    this.updateMap(); 
                }
            });
        }
    }
}