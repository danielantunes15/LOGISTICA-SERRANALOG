// js/components/sidebar.js

/**
 * Carrega a barra lateral e os itens de navegação.
 * @param {string} userRole - O papel do usuário logado ('admin' ou 'usuario').
 * @param {string} userNameDisplay - O nome completo do usuário para exibição.
 * @param {object} counts - Objeto contendo os contadores críticos.
 */
export async function loadSidebar(userRole, userNameDisplay = 'Usuário', counts = {}) { 
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    const { 
        downtimeCaminhoes = 0, 
        downtimeEquipamentos = 0, 
        descargaCount = 0 
    } = counts;

    const isAdmin = userRole === 'admin' || userRole === 'superadmin';

    const parceirosMenu = isAdmin ? `
        <button class="nav-button" data-view="gerenciamento-terceiros" style="border-left: 3px solid transparent; transition: all 0.2s;">
            <i class="ph-fill ph-handshake" style="color: var(--primary-color);"></i>
            <span style="font-weight: 500;">Parceiros</span>
        </button>
    ` : '';

    const gerencialGroup = isAdmin ? `
        <div class="nav-group" id="gerencial-group">
            <button class="nav-button-group">
                <i class="ph-fill ph-gear"></i>
                <span>Gerencial</span>
                <i class="ph ph-caret-down caret"></i>
            </button>
            <div class="submenu">
                <button class="nav-button" data-view="gerencial">
                    <i class="ph-fill ph-chart-polar"></i>
                    <span>Painel Gerencial</span>
                </button>
            </div>
        </div>
    ` : '';
    
    // Conteúdo da seção Cadastros - Ordem atualizada
    const cadastrosGroup = `
        <div class="nav-group" id="cadastros-group">
            <button class="nav-button-group">
                <i class="ph-fill ph-database"></i>
                <span>Cadastros</span>
                <i class="ph ph-caret-down caret"></i>
            </button>
            <div class="submenu">
                <button class="nav-button" data-view="cadastro-caminhoes">
                    <i class="ph-fill ph-truck"></i>
                    <span>Caminhões</span>
                </button>
                <button class="nav-button" data-view="cadastro-terceiros">
                    <i class="ph-fill ph-identification-card"></i>
                    <span>Motoristas (Colaboradores)</span>
                </button>
                <button class="nav-button" data-view="cadastro-fazendas">
                    <i class="ph-fill ph-tree-evergreen"></i>
                    <span>Fazendas</span>
                </button>
                <button class="nav-button" data-view="cadastro-equipamentos">
                    <i class="ph-fill ph-tractor"></i>
                    <span>Equipamentos</span>
                </button>
                <button class="nav-button" data-view="cadastro-frentes">
                    <i class="ph-fill ph-users-three"></i>
                    <span>Frentes</span>
                </button>
                <button class="nav-button" data-view="cadastro-fornecedores">
                    <i class="ph-fill ph-user-list"></i>
                    <span>Fornecedores</span>
                </button>
                <button class="nav-button" data-view="cadastro-proprietarios">
                    <i class="ph-fill ph-buildings"></i>
                    <span>Empresas (Proprietários)</span>
                </button>
            </div>
        </div>
    `;

    const frotaGroup = `
        <div class="nav-group" id="frota-group">
            <button class="nav-button-group">
                <i class="ph-fill ph-truck"></i>
                <span>Frota Própria</span>
                ${downtimeCaminhoes > 0 ? `<span class="badge alert" style="margin-left:auto; margin-right:10px;">${downtimeCaminhoes}</span>` : ''}
                <i class="ph ph-caret-down caret"></i>
            </button>
            <div class="submenu">
                <button class="nav-button" data-view="frota-dashboard">
                    <i class="ph-fill ph-chart-pie-slice"></i>
                    <span>Dashboard Frota</span>
                </button>
                <button class="nav-button" data-view="frota-abastecimento">
                    <i class="ph-fill ph-gas-pump"></i>
                    <span>Combustível e Médias</span>
                </button>
                <button class="nav-button" data-view="frota-pneus">
                    <i class="ph-fill ph-circles-four"></i>
                    <span>Gestão de Pneus</span>
                </button>
                <button class="nav-button" data-view="frota-manutencao">
                    <i class="ph-fill ph-wrench"></i>
                    <span>Manutenção (OS)</span>
                </button>
                <button class="nav-button" data-view="frota-telemetria">
                    <i class="ph-fill ph-steering-wheel"></i>
                    <span>Telemetria</span>
                </button>
                <button class="nav-button" data-view="frota-motoristas">
                    <i class="ph-fill ph-identification-card"></i>
                    <span>Motoristas</span>
                </button>
            </div>
        </div>
    `;
    
    const profileFooterBlock = `
        <div class="profile-menu-container">
            <button class="nav-button-group nav-profile-button" id="btn-profile-menu-toggle">
                <i class="ph-fill ph-user-circle"></i>
                <span>${userNameDisplay}</span> <i class="ph ph-caret-up caret"></i>
            </button>

            <div class="submenu profile-submenu" id="profile-submenu">
                <div class="profile-submenu-header">
                    <p class="user-name-header">${userNameDisplay}</p>
                    <p class="user-role-header">${userRole.charAt(0).toUpperCase() + userRole.slice(1)}</p>
                </div>
                <hr class="profile-submenu-divider">
                
                <button class="nav-button" data-action="change-password">
                    <i class="ph-fill ph-key"></i>
                    <span>Trocar Senha</span>
                </button>
                <button class="nav-button btn-danger" data-action="logout">
                    <i class="ph-fill ph-sign-out"></i>
                    <span>Sair</span>
                </button>
            </div>
        </div>
    `;

    sidebar.innerHTML = `
        <div class="sidebar-header">
            <img src="assets/logo-bel.png" alt="Logo LOGISTICA BEL" id="sidebar-logo">
            <h2>LOGISTICA SERRANALOG</h2>
        </div>
        
        <nav id="main-nav-buttons">
            <button class="nav-button active" data-view="dashboard">
                <i class="ph-fill ph-map-trifold"></i>
                <span>Mapa Principal</span>
            </button>
            
            <button class="nav-button" data-view="boletim-diario">
                <i class="ph-fill ph-newspaper"></i>
                <span>Boletim Diário</span>
            </button>
            
            <button class="nav-button" data-view="controle">
                <i class="ph-fill ph-arrows-clockwise"></i>
                <span>Painel de Controle</span>
            </button>
            
            ${frotaGroup}
            
            <button class="nav-button" data-view="equipamentos">
                <i class="ph-fill ph-tractor"></i>
                <span>Equipamentos</span>
                ${downtimeEquipamentos > 0 ? `<span class="badge alert">${downtimeEquipamentos}</span>` : ''}
            </button>
            
            <button class="nav-button" data-view="fila-patio-carregado"> 
                <i class="ph-fill ph-warehouse"></i>
                <span>Pátio Carregado</span>
            </button>
            
            <button class="nav-button" data-view="fazendas"> 
                <i class="ph-fill ph-tree-evergreen"></i>
                <span>Fazendas</span>
            </button>
            <button class="nav-button" data-view="ocorrencias"> 
                <i class="ph-fill ph-siren"></i>
                <span>Ocorrências</span>
            </button>

            <button class="nav-button" data-view="tempo"> 
                <i class="ph-fill ph-cloud-sun"></i>
                <span>Tempo</span>
            </button>
            <button class="nav-button" data-view="relatorios">
                <i class="ph-fill ph-chart-bar"></i>
                <span>Relatórios</span>
            </button>
            
            ${parceirosMenu}
            
            ${gerencialGroup}
            
            ${cadastrosGroup}
        </nav>
        
        ${profileFooterBlock}
    `;

    addSidebarEventListeners();
}

function addSidebarEventListeners() {
    document.querySelectorAll('.nav-button').forEach(button => {
        button.addEventListener('click', (e) => {
            if (e.target.closest('.nav-button-group')) return;
            
            const view = button.dataset.view;
            if (view) {
                switchView(view);
            }
        });
    });

    const cadastrosGroup = document.getElementById('cadastros-group');
    if (cadastrosGroup) {
        const navButtonGroup = cadastrosGroup.querySelector('.nav-button-group');
        if (navButtonGroup) {
            navButtonGroup.addEventListener('click', () => {
                cadastrosGroup.classList.toggle('open');
            });
        }
    }

    const gerencialGroupEl = document.getElementById('gerencial-group');
    if (gerencialGroupEl) {
        const navButtonGroupGerencial = gerencialGroupEl.querySelector('.nav-button-group');
        if (navButtonGroupGerencial) {
            navButtonGroupGerencial.addEventListener('click', () => {
                gerencialGroupEl.classList.toggle('open');
            });
        }
    }

    const frotaGroupEl = document.getElementById('frota-group');
    if (frotaGroupEl) {
        const navButtonGroupFrota = frotaGroupEl.querySelector('.nav-button-group');
        if (navButtonGroupFrota) {
            navButtonGroupFrota.addEventListener('click', () => {
                frotaGroupEl.classList.toggle('open');
            });
        }
    }
    
    const profileMenuContainer = document.querySelector('.profile-menu-container');
    const profileMenuToggle = document.getElementById('btn-profile-menu-toggle');
    const profileSubmenu = document.getElementById('profile-submenu');

    if (profileMenuToggle) {
        profileMenuToggle.addEventListener('click', () => {
            profileMenuContainer.classList.toggle('open');
        });
    }
    
    if (profileSubmenu) {
        profileSubmenu.addEventListener('click', (e) => {
            const actionButton = e.target.closest('.nav-button');
            if (!actionButton) return;
            
            const action = actionButton.dataset.action;
            if (action === 'change-password') {
                profileMenuContainer.classList.remove('open');
                window.app.showChangePasswordModal();
            } else if (action === 'logout') {
                profileMenuContainer.classList.remove('open');
                window.app.handleLogout();
            }
        });
    }
}

function switchView(viewName) {
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
    });

    const clickedButton = document.querySelector(`[data-view="${viewName}"]`);
    if (clickedButton) {
        clickedButton.classList.add('active');
        const parentGroup = clickedButton.closest('.nav-group');
        if (parentGroup) {
            parentGroup.classList.add('open');
        }
    }

    window.dispatchEvent(new CustomEvent('viewChanged', { 
        detail: { view: viewName } 
    }));
}