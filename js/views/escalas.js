export class EscalasView {
    constructor() {
        this.containerId = 'views-container';
    }

    async show() {
        const container = document.getElementById(this.containerId);
        
        // Carrega o HTML da partial se ainda não estiver no DOM
        if (!document.getElementById('escalas-view')) {
            try {
                const response = await fetch('partials/escalas.html');
                const html = await response.text();
                // Adiciona o HTML ao container, preservando views existentes
                container.insertAdjacentHTML('beforeend', html);
            } catch (error) {
                console.error("Erro ao carregar partial de escalas:", error);
                return;
            }
        }

        // Esconde todas as outras views
        document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
        
        // Mostra a view de escalas
        const view = document.getElementById('escalas-view');
        if (view) {
            view.style.display = 'block';
            this.initListeners();
            this.loadData();
        }
    }

    async hide() {
        const view = document.getElementById('escalas-view');
        if (view) {
            view.style.display = 'none';
        }
    }

    initListeners() {
        const btnRefresh = document.getElementById('refresh-escalas');
        if (btnRefresh) {
            // Remove listener antigo para evitar duplicidade
            btnRefresh.replaceWith(btnRefresh.cloneNode(true));
            document.getElementById('refresh-escalas').addEventListener('click', () => this.loadData());
        }
        
        const btnNova = document.getElementById('btn-nova-escala');
        if(btnNova) {
            btnNova.replaceWith(btnNova.cloneNode(true));
            document.getElementById('btn-nova-escala').addEventListener('click', () => {
                // Aqui você pode chamar um modal para cadastrar nova escala
                console.log('Abrir modal de nova escala');
            });
        }
    }

    async loadData() {
        // Lógica para buscar os dados do Supabase e popular a tabela "tabela-escalas-body"
        console.log('Carregando dados de escalas...');
    }
}