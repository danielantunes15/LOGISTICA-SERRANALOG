// js/views/gerencial.js
import { 
    registerAppUser, 
    fetchAppUsers, 
    deleteAppUser, 
    updateAppUser, 
    insertItem, 
    deleteItem, 
    updateItem,
    saveFrenteMeta 
} from '../api.js';
import { showToast, handleOperation, showLoading, hideLoading } from '../helpers.js';
import { openModal, closeModal } from '../components/modal.js';
import { dataCache } from '../dataCache.js';

export class GerencialView {
    constructor() {
        this.container = null;
        this.activeTab = 'usuarios'; // Aba padrão agora é usuários
        this.users = [];
        this.frentes = []; 
        
        // Definição estática de todos os menus disponíveis no sistema
        this.availableMenus = [
            { id: 'dashboard', label: 'Mapa Principal' },
            { id: 'boletim-diario', label: 'Boletim Diário' },
            { id: 'controle', label: 'Painel de Controle' },
            { id: 'frota', label: 'Frota Própria (Módulo Completo)' },
            { id: 'equipamentos', label: 'Equipamentos' },
            { id: 'fila-patio-carregado', label: 'Pátio Carregado' },
            { id: 'fazendas', label: 'Fazendas' },
            { id: 'ocorrencias', label: 'Ocorrências' },
            { id: 'escalas', label: 'Escalas' },
            { id: 'tempo', label: 'Tempo' },
            { id: 'relatorios', label: 'Relatórios' },
            { id: 'gerenciamento-terceiros', label: 'Parceiros' },
            { id: 'gerencial', label: 'Painel Gerencial' },
            { id: 'cadastros', label: 'Cadastros (Módulo Completo)' }
        ];
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
            
            // Listeners para Usuários
            if (target.closest('#btn-add-user')) {
                this.showUserModal();
            }
            if (target.closest('.btn-edit-user')) {
                const userId = target.closest('.btn-edit-user').dataset.id;
                const user = this.users.find(u => u.id == userId);
                if (user) this.showUserModal(user);
            }
            if (target.closest('.btn-delete-user')) {
                const userId = target.closest('.btn-delete-user').dataset.id;
                this.handleDeleteUser(userId);
            }
            
            // Listeners para Metas
            if (target.closest('.btn-save-meta')) {
                const button = target.closest('.btn-save-meta');
                const input = document.getElementById(`meta-input-${button.dataset.frenteId}`);
                if (input) this.handleSaveMeta(button.dataset.frenteId, input.value);
            }
        });
    }
    
    async loadTabContent() {
        const contentContainer = document.getElementById('gerencial-content');
        if (!contentContainer) return;
        showLoading();
        try {
            if (this.activeTab === 'usuarios') {
                await this.loadUserData(); 
                contentContainer.innerHTML = this.renderUsersTab();
            } else if (this.activeTab === 'metas') {
                await this.loadMetasData();
                contentContainer.innerHTML = this.renderMetasTab();
            }
        } catch (error) { 
            handleOperation(error); 
        } finally { 
            hideLoading(); 
        }
    }

    // ==========================================
    // ABA DE USUÁRIOS E PERMISSÕES
    // ==========================================
    async loadUserData() { 
        try { 
            this.users = await fetchAppUsers(); 
        } catch (e) { 
            this.users = []; 
        } 
    }

    renderUsersTab() {
        const rows = this.users.map(u => `
            <tr>
                <td>${u.nome_completo}</td>
                <td>${u.username_app}</td>
                <td>${u.tipo_usuario}</td>
                <td><span class="caminhao-status-badge status-${u.ativo ? 'ativa' : 'inativa'}">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
                <td style="text-align:right;">
                    <div class="action-buttons-modern" style="justify-content:flex-end;">
                        <button class="action-btn btn-edit-user" data-id="${u.id}" style="background-color:var(--accent-primary);color:white;" title="Editar Usuário e Permissões">
                            <i class="ph-fill ph-pencil-simple"></i>
                        </button>
                        <button class="action-btn delete-btn-modern btn-delete-user" data-id="${u.id}" title="Excluir Usuário">
                            <i class="ph-fill ph-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        return `
            <div class="users-tab">
                <div style="display: flex; justify-content: flex-end; margin-bottom: 20px;">
                    <button class="btn-primary" id="btn-add-user">
                        <i class="ph-fill ph-user-plus"></i> Novo Usuário
                    </button>
                </div>
                <div class="table-wrapper">
                    <table class="data-table-modern">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Usuário (Login)</th>
                                <th>Tipo</th>
                                <th>Status</th>
                                <th style="text-align:right;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>${rows || '<tr><td colspan="5" style="text-align:center; padding: 20px;">Nenhum usuário encontrado.</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    showUserModal(user = null) {
        const isEdit = !!user;
        // Se estiver editando, resgata os menus salvos. Se for novo, marca tudo por padrão ou deixa vazio (aqui deixei tudo marcado como padrão para novos)
        const permissoesUser = user && user.menus_permitidos ? user.menus_permitidos : this.availableMenus.map(m => m.id);
        
        // Gerador de checkboxes para cada menu
        const checkboxesHtml = this.availableMenus.map(menu => {
            const isChecked = permissoesUser.includes(menu.id);
            return `
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 0;">
                    <input type="checkbox" name="menus_permitidos" value="${menu.id}" ${isChecked ? 'checked' : ''} style="width: 16px; height: 16px;">
                    <span style="font-size: 0.95rem;">${menu.label}</span>
                </label>
            `;
        }).join('');

        const modalContent = `
            <form id="form-user-modal" class="form-modern">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div class="form-group" style="grid-column: 1 / -1;">
                        <label>Nome Completo</label>
                        <input type="text" id="user-nome" class="form-input" value="${user ? user.nome_completo : ''}" required>
                    </div>
                    <div class="form-group">
                        <label>Nome de Usuário (Login)</label>
                        <input type="text" id="user-username" class="form-input" value="${user ? user.username_app : ''}" required ${isEdit ? 'readonly style="background-color: #eee; cursor: not-allowed;"' : ''}>
                    </div>
                    <div class="form-group">
                        <label>${isEdit ? 'Nova Senha (deixe em branco para manter)' : 'Senha'}</label>
                        <input type="password" id="user-password" class="form-input" ${isEdit ? '' : 'required'}>
                    </div>
                    <div class="form-group">
                        <label>Tipo de Privilégio</label>
                        <select id="user-tipo" class="form-select" required>
                            <option value="usuario" ${user && user.tipo_usuario === 'usuario' ? 'selected' : ''}>Usuário Comum</option>
                            <option value="admin" ${user && user.tipo_usuario === 'admin' ? 'selected' : ''}>Administrador Geral</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Status da Conta</label>
                        <select id="user-status" class="form-select" required>
                            <option value="true" ${!user || user.ativo ? 'selected' : ''}>Ativo</option>
                            <option value="false" ${user && !user.ativo ? 'selected' : ''}>Inativo</option>
                        </select>
                    </div>
                </div>
                
                <div class="form-group" style="margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 20px;">
                    <label style="font-weight: 600; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                        <i class="ph-fill ph-shield-check" style="color: var(--primary-color); font-size: 1.2rem;"></i> 
                        Permissões de Acesso (Menus Liberados)
                    </label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid var(--border-color); max-height: 250px; overflow-y: auto;">
                        ${checkboxesHtml}
                    </div>
                </div>

                <div style="margin-top: 24px; display: flex; justify-content: flex-end; gap: 12px;">
                    <button type="button" class="btn-secondary" onclick="document.querySelector('.modal-close-btn').click()">Cancelar</button>
                    <button type="submit" class="btn-primary">
                        <i class="ph-fill ph-floppy-disk"></i> ${isEdit ? 'Salvar Alterações' : 'Criar Usuário'}
                    </button>
                </div>
            </form>
        `;

        openModal(isEdit ? 'Editar Usuário e Permissões' : 'Novo Usuário', modalContent);

        document.getElementById('form-user-modal').addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoading();
            
            try {
                // Captura todos os menus marcados no formulário
                const menusSelecionados = Array.from(document.querySelectorAll('input[name="menus_permitidos"]:checked')).map(cb => cb.value);

                const userData = {
                    nome_completo: document.getElementById('user-nome').value,
                    tipo_usuario: document.getElementById('user-tipo').value,
                    ativo: document.getElementById('user-status').value === 'true',
                    menus_permitidos: menusSelecionados // Salva as permissões de array de strings
                };

                const pwd = document.getElementById('user-password').value;
                if (pwd) {
                    userData.senha = pwd; 
                }

                if (isEdit) {
                    await updateAppUser(user.id, userData);
                    showToast('Usuário e permissões atualizados!', 'success');
                } else {
                    userData.username_app = document.getElementById('user-username').value;
                    if (!userData.senha) throw new Error("A senha é obrigatória para novos usuários.");
                    await registerAppUser(userData);
                    showToast('Usuário criado com sucesso!', 'success');
                }

                closeModal();
                await this.loadTabContent(); // Recarrega a tabela de usuários
            } catch (err) {
                handleOperation(err);
            } finally {
                hideLoading();
            }
        });
    }

    async handleDeleteUser(userId) {
        if (confirm('Tem certeza que deseja excluir este usuário definitivamente? Esta ação não pode ser desfeita.')) {
            showLoading();
            try {
                await deleteAppUser(userId);
                showToast('Usuário excluído com sucesso!', 'success');
                await this.loadTabContent();
            } catch (error) {
                handleOperation(error);
            } finally {
                hideLoading();
            }
        }
    }

    // ==========================================
    // ABA DE METAS
    // ==========================================
    async loadMetasData() { 
        try { 
            const d = await dataCache.fetchMasterDataOnly(true); 
            this.frentes = d.frentes_servico.filter(f => f.nome.toLowerCase() !== 'nenhuma'); 
        } catch (e) { 
            this.frentes = []; 
        } 
    }

    renderMetasTab() {
        const rows = this.frentes.map(f => `<tr><td>${f.nome}</td><td><input type="number" class="form-input" id="meta-input-${f.id}" value="${f.frentes_metas?.[0]?.meta_toneladas || 0}"></td><td><button class="btn-primary btn-save-meta" data-frente-id="${f.id}">Salvar</button></td></tr>`).join('');
        return `<div class="metas-tab"><table class="escala-table"><thead><tr><th>Frente</th><th>Meta (Ton)</th><th>Ação</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    async handleSaveMeta(id, val) { 
        try { 
            await saveFrenteMeta(id, parseFloat(val)); 
            showToast('Meta salva!', 'success'); 
        } catch (e) { 
            handleOperation(e); 
        } 
    }
}