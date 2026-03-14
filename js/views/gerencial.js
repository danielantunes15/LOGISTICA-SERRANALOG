// js/views/gerencial.js
import { 
    registerAppUser, 
    fetchAppUsers, 
    deleteAppUser, 
    updateAppUser, 
    fetchEscalaFuncionarios, 
    fetchEscalaTurnos, 
    saveEscalaTurnos, 
    insertItem, 
    deleteItem, 
    updateItem,
    saveFrenteMeta 
} from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
import { formatDateTime, getCurrentShift } from '../timeUtils.js';
import { openModal, closeModal } from '../components/modal.js';
import { dataCache } from '../dataCache.js';

export class GerencialView {
    constructor() {
        this.container = null;
        this.activeTab = 'escala';
        this.users = [];
        this.funcionarios = [];
        this.escalaData = {}; 
        this.scheduleChanged = false;
        
        // Funções atualizadas conforme sua solicitação
        this.funcoes = [
            'Líder de Produção Agrícola',
            'Motorista',
            'Controlador de Tráfego'
        ];
        
        this.frentes = []; 
    }

    async show() {
        this.render();
        await this.loadTabContent();
        this.addEventListeners();
    }

    async hide() {}

    render() {
        const container = document.getElementById('views-container');
        container.innerHTML = `
            <div id="gerencial-view" class="view active-view gerencial-view">
                <div class="gerencial-header">
                    <h1>Painel Gerencial</h1>
                </div>

                <div class="report-internal-menu gerencial-internal-menu">
                    <button class="btn-secondary internal-menu-btn ${this.activeTab === 'escala' ? 'active' : ''}" data-tab="escala">
                        <i class="ph-fill ph-calendar-check"></i> Escala de Turnos
                    </button>
                    <button class="btn-secondary internal-menu-btn ${this.activeTab === 'usuarios' ? 'active' : ''}" data-tab="usuarios">
                        <i class="ph-fill ph-users-three"></i> Gerenciar Usuários
                    </button>
                    <button class="btn-secondary internal-menu-btn ${this.activeTab === 'metas' ? 'active' : ''}" data-tab="metas">
                        <i class="ph-fill ph-chart-line"></i> Gerenciar Metas
                    </button>
                </div>

                <div id="gerencial-content" class="gerencial-content" style="padding: 24px; background-color: var(--bg-light); border-radius: 12px; margin-top: 24px; border: 1px solid var(--border-color);">
                </div>
            </div>
        `;
        this.container = container.querySelector('#gerencial-view');
    }

    addEventListeners() {
        this.container.querySelectorAll('.internal-menu-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                if (tab) {
                    this.activeTab = tab;
                    this.container.querySelectorAll('.internal-menu-btn').forEach(b => b.classList.remove('active'));
                    e.currentTarget.classList.add('active');
                    this.loadTabContent();
                }
            });
        });
        
        document.getElementById('gerencial-content').addEventListener('click', (e) => {
            const target = e.target;
            if (target.closest('#btn-add-user')) this.showRegisterUserModal();
            if (target.closest('.edit-user-btn')) {
                const userId = parseInt(target.closest('.edit-user-btn').dataset.userId);
                const user = this.users.find(u => u.id === userId);
                if (user) this.showEditUserModal(user);
            }
            if (target.closest('.toggle-active-btn')) {
                const userId = parseInt(target.closest('.toggle-active-btn').dataset.userId);
                const user = this.users.find(u => u.id === userId);
                if (user) this.showToggleActiveModal(user);
            }
            if (target.closest('.delete-user-btn')) {
                const userId = target.closest('.delete-user-btn').dataset.userId;
                const userName = target.closest('tr')?.querySelector('td:nth-child(1)')?.textContent.trim() || 'Usuário';
                this.showDeleteUserModal(userId, userName);
            }
            if (target.closest('#btn-manage-funcionarios')) this.showManageFuncionariosModal();
            if (target.closest('#btn-save-escala')) this.handleSaveEscala();
            if (e.target.closest('.btn-save-meta')) {
                const button = e.target.closest('.btn-save-meta');
                const frenteId = button.dataset.frenteId;
                const input = document.getElementById(`meta-input-${frenteId}`);
                if (frenteId && input) this.handleSaveMeta(frenteId, input.value, button);
            }
        });
    }
    
    async loadTabContent() {
        const contentContainer = document.getElementById('gerencial-content');
        if (!contentContainer) return;
        showLoading();
        try {
            if (this.activeTab === 'escala') {
                await this.loadEscalaData();
                contentContainer.innerHTML = this.renderEscalaTab();
                const calendarContainer = this.container.querySelector('.escala-calendario-container');
                if (calendarContainer) {
                    calendarContainer.addEventListener('change', (e) => {
                        if (e.target.classList.contains('turno-select')) {
                            this.scheduleChanged = true;
                            const saveButton = document.getElementById('btn-save-escala');
                            if (saveButton) {
                                saveButton.style.display = 'inline-flex';
                                saveButton.classList.remove('btn-secondary');
                                saveButton.classList.add('btn-primary');
                            }
                        }
                    });
                }
            } else if (this.activeTab === 'usuarios') {
                await this.loadUserData(); 
                contentContainer.innerHTML = this.renderUsersTab();
            } else if (this.activeTab === 'metas') {
                await this.loadMetasData();
                contentContainer.innerHTML = this.renderMetasTab();
            }
        } catch (error) {
            handleOperation(error);
            contentContainer.innerHTML = `<div class="empty-state">Erro ao carregar conteúdo.</div>`;
        } finally {
            hideLoading();
        }
    }

    // ==========================================
    // LÓGICA DE GERAÇÃO DE ESCALAS 4X2 (12H)
    // ==========================================

    /**
     * Gera escala 4x2 com Turno de 12 Horas Rotativo (4 Dia, 2 Folga, 4 Noite, 2 Folga)
     */
    generate4x2TwelveHourRotative(funcionarioId, startDateStr) {
        const schedule = [];
        const [year, month, day] = startDateStr.split('-').map(Number);
        const startDateUTC = new Date(Date.UTC(year, month - 1, day));

        for (let i = 0; i < 366; i++) {
            const currentDate = new Date(startDateUTC);
            currentDate.setUTCDate(currentDate.getUTCDate() + i);
            const currentDateStr = currentDate.toISOString().split('T')[0];

            const mod = i % 12; // Ciclo total de 12 dias (4D + 2F + 4N + 2F)
            let turno = 'Folga';
            if (mod >= 0 && mod <= 3) turno = 'Dia';
            else if (mod >= 6 && mod <= 9) turno = 'Noite';

            schedule.push({ funcionario_id: funcionarioId, data: currentDateStr, turno: turno });
        }
        return schedule;
    }

    /**
     * Gera escala 4x2 com Turno Fixo (Trabalha 4, Folga 2)
     */
    generate4x2FixedTurnSchedule(funcionarioId, startDateStr, fixedTurno) {
        const schedule = [];
        const [year, month, day] = startDateStr.split('-').map(Number);
        const startDateUTC = new Date(Date.UTC(year, month - 1, day));

        for (let i = 0; i < 366; i++) {
            const currentDate = new Date(startDateUTC);
            currentDate.setUTCDate(currentDate.getUTCDate() + i);
            const currentDateStr = currentDate.toISOString().split('T')[0];

            const mod = i % 6; // Trabalha 4, folga 2
            const turno = (mod < 4) ? fixedTurno : 'Folga';

            schedule.push({ funcionario_id: funcionarioId, data: currentDateStr, turno: turno });
        }
        return schedule;
    }

    generate12x36Schedule(funcionarioId, startDateStr, turnoName) {
        const schedule = [];
        const [year, month, day] = startDateStr.split('-').map(Number);
        const startDateUTC = new Date(Date.UTC(year, month - 1, day));
        for (let i = 0; i < 366; i++) {
            const currentDate = new Date(startDateUTC);
            currentDate.setUTCDate(currentDate.getUTCDate() + i);
            const currentDateStr = currentDate.toISOString().split('T')[0];
            schedule.push({ funcionario_id: funcionarioId, data: currentDateStr, turno: (i % 2 === 0) ? turnoName : 'Folga' });
        }
        return schedule;
    }

    generateADMSchedule(funcionarioId, startDateStr) {
        const schedule = [];
        const [year, month, day] = startDateStr.split('-').map(Number);
        const startDateUTC = new Date(Date.UTC(year, month - 1, day));
        for (let i = 0; i < 366; i++) {
            const currentDate = new Date(startDateUTC);
            currentDate.setUTCDate(currentDate.getUTCDate() + i);
            const currentDateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getUTCDay();
            schedule.push({ funcionario_id: funcionarioId, data: currentDateStr, turno: (dayOfWeek === 0 || dayOfWeek === 6) ? 'Folga' : 'ADM' });
        }
        return schedule;
    }

    // --- RENDERIZAÇÃO E DADOS ---

    async loadEscalaData() {
        try {
            this.funcionarios = await fetchEscalaFuncionarios() || [];
            const today = new Date();
            const endDate = new Date();
            endDate.setDate(today.getDate() + 7);
            const turnosData = await fetchEscalaTurnos(today.toISOString().split('T')[0], endDate.toISOString().split('T')[0]) || [];
            this.escalaData = {};
            turnosData.forEach(turno => {
                if (!this.escalaData[turno.funcionario_id]) this.escalaData[turno.funcionario_id] = {};
                this.escalaData[turno.funcionario_id][turno.data] = turno.turno;
            });
        } catch (error) {
            handleOperation(error);
            this.funcionarios = [];
            this.escalaData = {};
        }
    }

    renderEscalaTab() {
        const currentShift = getCurrentShift();
        const hj = new Date().toISOString().split('T')[0];
        const funcsNoTurno = this.funcionarios.filter(f => this.escalaData[f.id]?.[hj] === currentShift.turno);
        return `
            <div class="escala-view">
                <div class="escala-actions">
                    <button class="btn-primary" id="btn-manage-funcionarios"><i class="ph-fill ph-users"></i> Gerenciar Funcionários</button>
                    <button class="btn-secondary" id="btn-save-escala" style="display: none;"><i class="ph-fill ph-floppy-disk"></i> Salvar Alterações</button>
                </div>
                <div class="turno-atual-dashboard">${this.renderEscalaDashboard(currentShift, funcsNoTurno)}</div>
                <div class="escala-calendario-container">${this.renderEscalaCalendar()}</div>
            </div>
        `;
    }

    renderEscalaDashboard(currentShift, funcionarios) {
        return `
            <div class="turno-header">
                <div class="turno-info"><h3>Dashboard do Turno Atual</h3><p>Ativos agora: ${currentShift.inicio} - ${currentShift.fim}</p></div>
                <span class="turno-badge turno-${currentShift.turno.toLowerCase()}">${currentShift.nome}</span>
            </div>
            <div class="turno-funcionarios-grid">
                ${this.funcoes.map(funcao => {
                    const funcs = funcionarios.filter(f => f.funcao === funcao);
                    return `<div class="funcao-card"><h4><i class="ph-fill ph-user-gear"></i> ${funcao}</h4><div class="funcionarios-list">${funcs.length > 0 ? funcs.map(f => `<div class="funcionario-item"><i class="ph-fill ph-user"></i> ${f.nome}</div>`).join('') : '<p class="empty-state-funcao">Nenhum.</p>'}</div></div>`;
                }).join('')}
            </div>
        `;
    }

    renderEscalaCalendar() {
        const today = new Date();
        const dates = Array.from({ length: 8 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i); return d; });
        const headerHTML = dates.map(d => `<th>${d.toLocaleDateString('pt-BR', { weekday: 'short' }).toUpperCase()}<span class="header-date">${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span></th>`).join('');
        let calendarsHTML = '';
        this.funcoes.forEach(funcao => {
            const funcs = this.funcionarios.filter(f => f.funcao === funcao);
            if (funcs.length > 0) {
                const bodyHTML = funcs.map(func => {
                    const cellsHTML = dates.map(date => {
                        const dateStr = date.toISOString().split('T')[0];
                        const turno = this.escalaData[func.id]?.[dateStr] || 'Folga';
                        return `<td><select class="turno-select turno-${turno}" data-funcionario-id="${func.id}" data-date="${dateStr}">
                            <option value="Folga" ${turno === 'Folga' ? 'selected' : ''}>Folga</option>
                            <option value="Dia" ${turno === 'Dia' ? 'selected' : ''}>Dia (12h)</option>
                            <option value="Noite" ${turno === 'Noite' ? 'selected' : ''}>Noite (12h)</option>
                            <option value="A" ${turno === 'A' ? 'selected' : ''}>Turno A</option>
                            <option value="B" ${turno === 'B' ? 'selected' : ''}>Turno B</option>
                            <option value="C" ${turno === 'C' ? 'selected' : ''}>Turno C</option>
                            <option value="ADM" ${turno === 'ADM' ? 'selected' : ''}>ADM</option>
                        </select></td>`;
                    }).join('');
                    return `<tr><td class="funcionario-info"><span class="funcionario-nome">${func.nome}</span></td>${cellsHTML}</tr>`;
                }).join('');
                calendarsHTML += `<h3 style="margin-top: 24px;">${funcao}</h3><div class="escala-table-wrapper"><table class="escala-table"><thead><tr><th class="funcionario-header">Funcionário</th>${headerHTML}</tr></thead><tbody>${bodyHTML}</tbody></table></div>`;
            }
        });
        return `<h2 style="font-size: 1.3rem;">Calendário de Escala (Próximos 7 dias)</h2>${calendarsHTML || '<p>Nenhum funcionário.</p>'}`;
    }

    async handleSaveEscala() {
        showLoading();
        try {
            const upsertData = [];
            this.container.querySelectorAll('.turno-select').forEach(select => {
                if (select.value !== 'Folga') upsertData.push({ funcionario_id: parseInt(select.dataset.funcionarioId, 10), data: select.dataset.date, turno: select.value });
            });
            await saveEscalaTurnos(upsertData);
            showToast('Escala salva!', 'success');
            this.scheduleChanged = false;
            document.getElementById('btn-save-escala').style.display = 'none';
            await this.loadTabContent();
        } catch (error) { handleOperation(error); } finally { hideLoading(); }
    }
    
    showManageFuncionariosModal() {
        const rows = this.funcionarios.map(f => `<tr><td>${f.nome}</td><td>${f.funcao}</td><td><div class="action-buttons-modern"><button class="action-btn delete-btn-modern btn-delete-funcionario" data-id="${f.id}"><i class="ph-fill ph-trash"></i></button></div></td></tr>`).join('');
        const modalContent = `
            <div class="gerenciar-funcionarios-modal">
                <form id="form-add-funcionario" class="form-modern">
                    <h4>Adicionar Funcionário e Gerar Escala 4x2</h4>
                    <div class="form-group"><label>Nome</label><input type="text" id="nome-funcionario" class="form-input" required></div>
                    <div class="form-group"><label>Função</label><select id="funcao-funcionario" class="form-select" required>${this.funcoes.map(f => `<option value="${f}">${f}</option>`).join('')}</select></div>
                    <div class="form-group">
                        <label>Tipo de Escala (Novo)</label>
                        <select id="tipo-escala" class="form-select" required>
                            <option value="4x2_12h_rotativo">4x2 (12h Rotativo: 4 Dia, 2 Folga, 4 Noite)</option>
                            <option value="4x2_12h_dia">4x2 (12h Fixo Dia: 4 Dia, 2 Folga)</option>
                            <option value="4x2_12h_noite">4x2 (12h Fixo Noite: 4 Noite, 2 Folga)</option>
                            <option value="12x36_dia">12x36 (Dia Sim, Dia Não - Dia)</option>
                            <option value="12x36_noite">12x36 (Dia Sim, Dia Não - Noite)</option>
                            <option value="adm">ADM (Segunda a Sexta)</option>
                        </select>
                    </div>
                    <div class="form-group"><label>Data de Início</label><input type="date" id="data-inicio-escala" class="form-input" value="${new Date().toISOString().split('T')[0]}" required></div>
                    <button type="submit" class="btn-primary">Criar Funcionário e Escala</button>
                </form>
                <div class="table-wrapper" style="margin-top:20px; max-height: 200px; overflow-y: auto;"><table class="data-table-modern"><thead><tr><th>Nome</th><th>Função</th><th>Ação</th></tr></thead><tbody id="lista-funcs-body">${rows}</tbody></table></div>
            </div>`;
        openModal('Gerenciar Equipe', modalContent);

        document.getElementById('form-add-funcionario').addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = document.getElementById('nome-funcionario').value;
            const funcao = document.getElementById('funcao-funcionario').value;
            const tipo = document.getElementById('tipo-escala').value;
            const dataInicio = document.getElementById('data-inicio-escala').value;
            showLoading();
            try {
                const { data: novo, error } = await insertItem('escala_funcionarios', { nome, funcao });
                if(error) throw error;
                let escala;
                if (tipo === '4x2_12h_rotativo') escala = this.generate4x2TwelveHourRotative(novo.id, dataInicio);
                else if (tipo === '4x2_12h_dia') escala = this.generate4x2FixedTurnSchedule(novo.id, dataInicio, 'Dia');
                else if (tipo === '4x2_12h_noite') escala = this.generate4x2FixedTurnSchedule(novo.id, dataInicio, 'Noite');
                else if (tipo === '12x36_dia') escala = this.generate12x36Schedule(novo.id, dataInicio, 'Dia');
                else if (tipo === '12x36_noite') escala = this.generate12x36Schedule(novo.id, dataInicio, 'Noite');
                else escala = this.generateADMSchedule(novo.id, dataInicio);
                await saveEscalaTurnos(escala);
                closeModal(); await this.loadTabContent(); showToast('Funcionário e Escala 4x2 criados!', 'success');
            } catch (err) { handleOperation(err); } finally { hideLoading(); }
        });

        document.getElementById('lista-funcs-body').addEventListener('click', async (e) => {
            const del = e.target.closest('.btn-delete-funcionario');
            if (del && confirm('Excluir funcionário e suas escalas?')) {
                showLoading();
                try { await deleteItem('escala_funcionarios', del.dataset.id); closeModal(); await this.loadTabContent(); } catch (err) { handleOperation(err); } finally { hideLoading(); }
            }
        });
    }

    // --- MÉTODOS DE USUÁRIOS E METAS MANTIDOS ---
    async loadUserData() { try { this.users = await fetchAppUsers(); } catch (e) { this.users = []; } }
    renderUsersTab() {
        const rows = this.users.map(u => `<tr><td>${u.nome_completo}</td><td>${u.username_app}</td><td>${u.tipo_usuario}</td><td>${u.ativo ? 'Ativo' : 'Inativo'}</td><td><button class="action-btn delete-user-btn" data-user-id="${u.id}"><i class="ph-fill ph-trash"></i></button></td></tr>`).join('');
        return `<div class="users-tab"><button class="btn-primary" id="btn-add-user">Novo Usuário</button><table class="data-table-modern"><thead><tr><th>Nome</th><th>Usuário</th><th>Tipo</th><th>Status</th><th>Ação</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    async loadMetasData() { try { const d = await dataCache.fetchMasterDataOnly(true); this.frentes = d.frentes_servico.filter(f => f.nome.toLowerCase() !== 'nenhuma'); } catch (e) { this.frentes = []; } }
    renderMetasTab() {
        const rows = this.frentes.map(f => `<tr><td>${f.nome}</td><td><input type="number" class="form-input" id="meta-input-${f.id}" value="${f.frentes_metas?.[0]?.meta_toneladas || 0}"></td><td><button class="btn-primary btn-save-meta" data-frente-id="${f.id}">Salvar</button></td></tr>`).join('');
        return `<div class="metas-tab"><table class="escala-table"><thead><tr><th>Frente</th><th>Meta (Ton)</th><th>Ação</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    async handleSaveMeta(id, val, btn) { try { await saveFrenteMeta(id, parseFloat(val)); showToast('Meta salva!', 'success'); } catch (e) { handleOperation(e); } }
}