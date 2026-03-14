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
        
        // Funções operacionais focadas em Logística e Tráfego
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
                if (frenteId && input) {
                    this.handleSaveMeta(frenteId, input.value, button);
                }
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
     * Gera escala 4x2 com Turno de 12 Horas Rotativo
     * Ciclo: 4 Dias (Dia), 2 Folgas, 4 Dias (Noite), 2 Folgas.
     */
    generate4x2TwelveHourRotative(funcionarioId, startDateStr) {
        const schedule = [];
        const [year, month, day] = startDateStr.split('-').map(Number);
        const startDateUTC = new Date(Date.UTC(year, month - 1, day));

        for (let i = 0; i < 366; i++) {
            const currentDate = new Date(startDateUTC);
            currentDate.setUTCDate(currentDate.getUTCDate() + i);
            const currentDateStr = currentDate.toISOString().split('T')[0];

            const mod = i % 12; // Ciclo total de 12 dias
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

            const mod = i % 6; // Ciclo de 6 dias (4 tab + 2 folga)
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

            schedule.push({
                funcionario_id: funcionarioId,
                data: currentDateStr,
                turno: (i % 2 === 0) ? turnoName : 'Folga'
            });
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

            const dayOfWeek = currentDate.getUTCDay(); // 0 = Domingo, 6 = Sábado
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

            schedule.push({
                funcionario_id: funcionarioId,
                data: currentDateStr,
                turno: isWeekend ? 'Folga' : 'ADM'
            });
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
            const turnosData = await fetchEscalaTurnos(
                today.toISOString().split('T')[0],
                endDate.toISOString().split('T')[0]
            ) || [];
            this.escalaData = {};
            turnosData.forEach(turno => {
                if (!this.escalaData[turno.funcionario_id]) {
                    this.escalaData[turno.funcionario_id] = {};
                }
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
                    <button class="btn-primary" id="btn-manage-funcionarios">
                        <i class="ph-fill ph-users"></i> Gerenciar Funcionários
                    </button>
                    <button class="btn-secondary" id="btn-save-escala" style="display: none;">
                        <i class="ph-fill ph-floppy-disk"></i> Salvar Alterações na Escala
                    </button>
                </div>
                <div class="turno-atual-dashboard">
                    ${this.renderEscalaDashboard(currentShift, funcsNoTurno)}
                </div>
                <div class="escala-calendario-container">
                    ${this.renderEscalaCalendar()}
                </div>
            </div>
        `;
    }

    renderEscalaDashboard(currentShift, funcionarios) {
        return `
            <div class="turno-header">
                <div class="turno-info">
                    <h3>Dashboard do Turno Atual</h3>
                    <p>Funcionários trabalhando agora (${currentShift.inicio} - ${currentShift.fim})</p>
                </div>
                <span class="turno-badge turno-${currentShift.turno.toLowerCase()}">${currentShift.nome}</span>
            </div>
            <div class="turno-funcionarios-grid">
                ${this.funcoes.map(funcao => {
                    const funcionariosDaFuncao = funcionarios.filter(f => f.funcao === funcao);
                    return `
                        <div class="funcao-card">
                            <h4><i class="ph-fill ph-user-gear"></i> ${funcao}</h4>
                            <div class="funcionarios-list">
                                ${funcionariosDaFuncao.length > 0 ? 
                                    funcionariosDaFuncao.map(f => `<div class="funcionario-item"><i class="ph-fill ph-user"></i> ${f.nome}</div>`).join('') :
                                    '<p class="empty-state-funcao">Nenhum funcionário neste turno.</p>'
                                }
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    renderEscalaCalendar() {
        const today = new Date();
        const dates = Array.from({ length: 8 }, (_, i) => {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            return date;
        });

        const headerHTML = dates.map(date => {
            const day = date.toLocaleDateString('pt-BR', { weekday: 'short' });
            const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            return `<th>${day.toUpperCase()}<span class="header-date">${dateStr}</span></th>`;
        }).join('');

        let allCalendarsHTML = '';

        this.funcoes.forEach(funcao => {
            const funcionariosDaFuncao = this.funcionarios.filter(f => f.funcao === funcao);
            if (funcionariosDaFuncao.length > 0) {
                const bodyHTML = funcionariosDaFuncao.map(func => {
                    const cellsHTML = dates.map(date => {
                        const dateStr = date.toISOString().split('T')[0];
                        const turno = this.escalaData[func.id]?.[dateStr] || 'Folga';
                        const selectId = `turno-${func.id}-${dateStr}`;
                        return `
                            <td class="td-turno turno-${turno}">
                                <select class="turno-select turno-${turno}" id="${selectId}" data-funcionario-id="${func.id}" data-date="${dateStr}">
                                    <option value="Folga" ${turno === 'Folga' ? 'selected' : ''}>Folga</option>
                                    <option value="Dia" ${turno === 'Dia' ? 'selected' : ''}>Dia (12h)</option>
                                    <option value="Noite" ${turno === 'Noite' ? 'selected' : ''}>Noite (12h)</option>
                                    <option value="A" ${turno === 'A' ? 'selected' : ''}>Turno A (8h)</option>
                                    <option value="B" ${turno === 'B' ? 'selected' : ''}>Turno B (8h)</option>
                                    <option value="C" ${turno === 'C' ? 'selected' : ''}>Turno C (8h)</option>
                                    <option value="ADM" ${turno === 'ADM' ? 'selected' : ''}>ADM</option>
                                </select>
                            </td>
                        `;
                    }).join('');
                    return `
                        <tr>
                            <td class="funcionario-info">
                                <span class="funcionario-nome">${func.nome}</span>
                            </td>
                            ${cellsHTML}
                        </tr>
                    `;
                }).join('');
                allCalendarsHTML += `
                    <h3 style="margin-top: 32px;">${funcao}</h3>
                    <div class="escala-table-wrapper">
                        <table class="escala-table">
                            <thead>
                                <tr>
                                    <th class="funcionario-header">Funcionário</th>
                                    ${headerHTML}
                                </tr>
                            </thead>
                            <tbody>
                                ${bodyHTML}
                            </tbody>
                        </table>
                    </div>
                `;
            }
        });

        return `
            <h2 style="font-size: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Calendário de Escala (Próximos 7 dias)</h2>
            ${allCalendarsHTML || '<p class="empty-state">Nenhum funcionário cadastrado para exibir a escala.</p>'}
        `;
    }

    async handleSaveEscala() {
        if (!this.scheduleChanged) {
            showToast('Nenhuma alteração na escala para salvar.', 'info');
            return;
        }
        showLoading();
        try {
            const upsertData = [];
            this.container.querySelectorAll('.turno-select').forEach(select => {
                const turno = select.value;
                if (turno !== 'Folga') {
                    upsertData.push({
                        funcionario_id: parseInt(select.dataset.funcionarioId, 10),
                        data: select.dataset.date,
                        turno: turno
                    });
                }
            });
            await saveEscalaTurnos(upsertData);
            showToast('Escala salva com sucesso!', 'success');
            this.scheduleChanged = false;
            const saveButton = document.getElementById('btn-save-escala');
            if (saveButton) saveButton.style.display = 'none';
            await this.loadTabContent();
        } catch (error) {
            handleOperation(error);
        } finally {
            hideLoading();
        }
    }
    
    showManageFuncionariosModal() {
        const funcoesOptions = this.funcoes.map(f => `<option value="${f}">${f}</option>`).join('');
        const todayString = new Date().toISOString().split('T')[0];
        const rows = this.funcionarios.map(f => `
            <tr>
                <td>${f.nome}</td>
                <td>${f.funcao}</td>
                <td>
                    <div class="action-buttons-modern">
                        <button class="action-btn delete-btn-modern btn-delete-funcionario" data-id="${f.id}"><i class="ph-fill ph-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        const modalContent = `
            <div class="gerenciar-funcionarios-modal">
                <form id="form-add-funcionario" class="form-modern" style="margin-bottom: 24px;">
                    <h4>Adicionar Funcionário e Gerar Escala 4x2</h4>
                    <div class="form-group">
                        <label for="nome-funcionario">Nome</label>
                        <input type="text" id="nome-funcionario" class="form-input" required>
                    </div>
                    <div class="form-group">
                        <label for="funcao-funcionario">Função</label>
                        <select id="funcao-funcionario" class="form-select" required>
                            <option value="">Selecione...</option>
                            ${funcoesOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="tipo-escala">Tipo de Escala (Novo)</label>
                        <select id="tipo-escala" class="form-select" required>
                            <option value="">Selecione...</option>
                            <option value="4x2_12h_rotativo">4x2 (12h Rotativo: 4 Dia, 2 Folga, 4 Noite)</option>
                            <option value="4x2_12h_dia">4x2 (12h Fixo Dia: 4 Dia, 2 Folga)</option>
                            <option value="4x2_12h_noite">4x2 (12h Fixo Noite: 4 Noite, 2 Folga)</option>
                            <option value="12x36_dia">12x36 (Dia Sim, Dia Não - Dia)</option>
                            <option value="12x36_noite">12x36 (Dia Sim, Dia Não - Noite)</option>
                            <option value="adm">Administrativo (Seg a Sex)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="data-inicio-escala">Data de Início (Primeiro dia da Escala)</label>
                        <input type="date" id="data-inicio-escala" class="form-input" value="${todayString}" required>
                    </div>
                    <button type="submit" class="btn-primary">Adicionar e Gerar Escala</button>
                </form>
                <h4>Funcionários Cadastrados</h4>
                <div class="table-wrapper" style="max-height: 250px; overflow-y: auto;">
                    <table class="data-table-modern">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Função</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="lista-funcionarios-body">
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        openModal('Gerenciar Equipe da Escala', modalContent);

        document.getElementById('form-add-funcionario').addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = document.getElementById('nome-funcionario').value;
            const funcao = document.getElementById('funcao-funcionario').value;
            const tipoEscala = document.getElementById('tipo-escala').value;
            const dataInicio = document.getElementById('data-inicio-escala').value;
            
            showLoading();
            try {
                const { data: novoFuncionario, error: insertError } = await insertItem('escala_funcionarios', { nome, funcao });
                if(insertError) throw insertError;
                
                let escalaGerada;
                let successMessage;

                switch(tipoEscala) {
                    case '4x2_12h_rotativo':
                        escalaGerada = this.generate4x2TwelveHourRotative(novoFuncionario.id, dataInicio);
                        successMessage = 'Funcionário e escala 4x2 (12h Rotativo) gerados!';
                        break;
                    case '4x2_12h_dia':
                        escalaGerada = this.generate4x2FixedTurnSchedule(novoFuncionario.id, dataInicio, 'Dia');
                        successMessage = 'Funcionário e escala 4x2 (Fixo Dia) gerados!';
                        break;
                    case '4x2_12h_noite':
                        escalaGerada = this.generate4x2FixedTurnSchedule(novoFuncionario.id, dataInicio, 'Noite');
                        successMessage = 'Funcionário e escala 4x2 (Fixo Noite) gerados!';
                        break;
                    case '12x36_dia':
                        escalaGerada = this.generate12x36Schedule(novoFuncionario.id, dataInicio, 'Dia');
                        successMessage = 'Escala 12x36 (Dia) gerada!';
                        break;
                    case '12x36_noite':
                        escalaGerada = this.generate12x36Schedule(novoFuncionario.id, dataInicio, 'Noite');
                        successMessage = 'Escala 12x36 (Noite) gerada!';
                        break;
                    case 'adm':
                        escalaGerada = this.generateADMSchedule(novoFuncionario.id, dataInicio);
                        successMessage = 'Escala Administrativa gerada!';
                        break;
                    default:
                        escalaGerada = this.generateADMSchedule(novoFuncionario.id, dataInicio);
                        successMessage = 'Funcionário adicionado!';
                }
                
                await saveEscalaTurnos(escalaGerada);
                closeModal();
                await this.loadTabContent();
                showToast(successMessage, 'success');

            } catch (error) {
                handleOperation(error);
            } finally {
                hideLoading();
            }
        });

        document.getElementById('lista-funcionarios-body').addEventListener('click', async (e) => {
            const deleteButton = e.target.closest('.btn-delete-funcionario');
            if (deleteButton) {
                const id = deleteButton.dataset.id;
                if (confirm('Deseja realmente excluir este funcionário e suas escalas?')) {
                    showLoading();
                    try {
                        await deleteItem('escala_funcionarios', id);
                        closeModal();
                        await this.loadTabContent();
                        showToast('Funcionário excluído!', 'success');
                    } catch (error) {
                        handleOperation(error);
                    } finally {
                        hideLoading();
                    }
                }
            }
        });
    }

    // --- MÉTODOS DE USUÁRIOS E METAS (MANTIDOS) ---
    async loadUserData() { try { this.users = await fetchAppUsers(); } catch (error) { this.users = []; } }
    
    renderUsersTab() {
        const userRowsHTML = this.users.map(user => `
            <tr class="${user.ativo ? '' : 'inactive-row'}">
                <td>${user.nome_completo}</td>
                <td>${user.username_app}</td>
                <td>${user.tipo_usuario}</td>
                <td><span class="caminhao-status-badge status-${user.ativo ? 'ativa' : 'inativa'}">${user.ativo ? 'Ativo' : 'Inativo'}</span></td>
                <td>
                    <button class="action-btn delete-user-btn" data-user-id="${user.id}"><i class="ph-fill ph-trash"></i></button>
                </td>
            </tr>
        `).join('');
        return `<div class="users-tab">
            <button class="btn-primary" id="btn-add-user" style="margin-bottom: 24px;">Novo Usuário</button>
            <table class="data-table-modern"><thead><tr><th>Nome</th><th>Usuário</th><th>Tipo</th><th>Status</th><th>Ações</th></tr></thead><tbody>${userRowsHTML}</tbody></table>
        </div>`;
    }

    async loadMetasData() { try { const masterData = await dataCache.fetchMasterDataOnly(true); this.frentes = masterData.frentes_servico.filter(f => f.nome.toLowerCase() !== 'nenhuma'); } catch (error) { this.frentes = []; } }
    
    renderMetasTab() {
        const rowsHTML = this.frentes.map(frente => `
            <tr>
                <td>${frente.nome}</td>
                <td><input type="number" class="form-input" id="meta-input-${frente.id}" value="${frente.frentes_metas?.[0]?.meta_toneladas || 0}"></td>
                <td><button class="btn-primary btn-save-meta" data-frente-id="${frente.id}">Salvar</button></td>
            </tr>`).join('');
        return `<div class="metas-tab"><table class="escala-table"><thead><tr><th>Frente</th><th>Meta (Ton)</th><th>Ação</th></tr></thead><tbody>${rowsHTML}</tbody></table></div>`;
    }

    async handleSaveMeta(frenteId, metaValue, buttonElement) {
        try { await saveFrenteMeta(frenteId, parseFloat(metaValue)); showToast('Meta salva!', 'success'); } catch (error) { handleOperation(error); }
    }
}