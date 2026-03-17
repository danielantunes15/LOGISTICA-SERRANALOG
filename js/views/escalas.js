// js/views/escalas.js
import { dataCache } from '../dataCache.js';
import { showToast, showLoading, hideLoading } from '../helpers.js';

export class EscalasView {
    constructor() {
        this.containerId = 'views-container';
        this.motoristas = [];
        this.caminhoes = [];
        this.escalaGerada = []; // Guarda o rascunho da escala em memória
    }

    async show() {
        const container = document.getElementById(this.containerId);
        
        // Carrega o HTML da partial
        if (!document.getElementById('escalas-view')) {
            try {
                const response = await fetch('partials/escalas.html');
                const html = await response.text();
                container.insertAdjacentHTML('beforeend', html);
            } catch (error) {
                console.error("Erro ao carregar partial de escalas:", error);
                showToast("Erro ao carregar a interface de escalas", "error");
                return;
            }
        }

        // Esconde todas as outras views
        document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
        
        // Mostra a view de escalas
        const view = document.getElementById('escalas-view');
        if (view) {
            view.style.display = 'block';
            
            // Define data atual como padrão no input date
            const dataInput = document.getElementById('escala-data');
            if (dataInput && !dataInput.value) {
                dataInput.value = new Date().toISOString().split('T')[0];
            }

            await this.loadData();
            this.initListeners();
        }
    }

    async hide() {
        const view = document.getElementById('escalas-view');
        if (view) {
            view.style.display = 'none';
        }
    }

    async loadData() {
        showLoading();
        try {
            // Busca dados do cache (Caminhões e Terceiros)
            const masterData = await dataCache.fetchMasterDataOnly();
            
            // 1. Filtra Caminhões (Apenas caminhões ativos/disponíveis da frota)
            this.caminhoes = (masterData.caminhoes || []).filter(c => c.status !== 'inativo');
            
            // 2. Filtra Motoristas (Apenas terceiros ativos que tem 'motorista' na função)
            this.motoristas = (masterData.terceiros || []).filter(t => 
                t.situacao === 'ativo' && 
                t.descricao_atividade?.toLowerCase().includes('motorista')
            );

            // Atualiza os contadores na interface
            this.updateStatsPanel();

        } catch (error) {
            console.error('Erro ao carregar dados de escalas:', error);
            showToast('Erro ao carregar motoristas e caminhões', 'error');
        } finally {
            hideLoading();
        }
    }

    updateStatsPanel() {
        document.getElementById('count-motoristas').textContent = this.motoristas.length;
        document.getElementById('count-caminhoes').textContent = this.caminhoes.length;

        const previewContainer = document.getElementById('motoristas-preview-list');
        if (this.motoristas.length === 0) {
            previewContainer.innerHTML = '<span style="color: var(--text-secondary); font-size: 0.8rem;">Nenhum motorista ativo encontrado.</span>';
        } else {
            previewContainer.innerHTML = this.motoristas
                .map(m => `<span class="motorista-badge">${m.nome.split(' ')[0]} ${m.nome.split(' ').length > 1 ? m.nome.split(' ').pop() : ''}</span>`)
                .join('');
        }
    }

    initListeners() {
        const btnRefresh = document.getElementById('refresh-escalas');
        if (btnRefresh) {
            btnRefresh.replaceWith(btnRefresh.cloneNode(true));
            document.getElementById('refresh-escalas').addEventListener('click', async () => {
                await dataCache.fetchMasterDataOnly(true); // Força refresh do cache
                await this.loadData();
                showToast('Dados atualizados com sucesso.', 'success');
            });
        }
        
        const btnGerar = document.getElementById('btn-gerar-auto');
        if(btnGerar) {
            btnGerar.replaceWith(btnGerar.cloneNode(true));
            document.getElementById('btn-gerar-auto').addEventListener('click', () => this.generateAutomaticScale());
        }

        const btnLimpar = document.getElementById('btn-limpar-escala');
        if(btnLimpar) {
            btnLimpar.replaceWith(btnLimpar.cloneNode(true));
            document.getElementById('btn-limpar-escala').addEventListener('click', () => this.clearScale());
        }

        const btnSalvar = document.getElementById('btn-salvar-escala');
        if(btnSalvar) {
            btnSalvar.replaceWith(btnSalvar.cloneNode(true));
            document.getElementById('btn-salvar-escala').addEventListener('click', () => this.saveScale());
        }
    }

    generateAutomaticScale() {
        if (this.motoristas.length === 0) {
            showToast('Não há motoristas ativos para gerar a escala.', 'warning');
            return;
        }

        const dataInput = document.getElementById('escala-data').value;
        const horaInput = document.getElementById('escala-hora').value;

        if (!dataInput || !horaInput) {
            showToast('Preencha a data e a hora de início.', 'error');
            return;
        }

        showLoading();

        setTimeout(() => {
            // Lógica Matemática do Turno de 12 Horas
            let [h, m] = horaInput.split(':').map(Number);
            
            // Turno 1 (Dia/Primeiro)
            let t1_inicio = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
            let t1_fim_h = (h + 12) % 24;
            let t1_fim = `${String(t1_fim_h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;

            // Turno 2 (Noite/Segundo)
            let t2_inicio = t1_fim;
            let t2_fim = t1_inicio;

            // Formatação da Data para exibição
            const [ano, mes, dia] = dataInput.split('-');
            const dataFormatada = `${dia}/${mes}/${ano}`;

            // Divisão dos motoristas ativos pela metade
            const shuffledDrivers = [...this.motoristas].sort(() => 0.5 - Math.random()); // Opcional: embaralhar
            const half = Math.ceil(shuffledDrivers.length / 2);
            const turno1Drivers = shuffledDrivers.slice(0, half);
            const turno2Drivers = shuffledDrivers.slice(half);

            const trucks = [...this.caminhoes];
            let tbodyHTML = '';
            this.escalaGerada = []; // Reseta a memória

            // Função helper para renderizar a linha
            const renderRow = (driver, index, isTurno1) => {
                // Pega um caminhão (se houver mais motoristas que caminhões, ele recicla o index)
                const truck = trucks.length > 0 ? trucks[index % trucks.length] : { cod_equipamento: 'Sem Veículo' };
                
                const turnoNome = isTurno1 ? 'Turno 1 (Dia)' : 'Turno 2 (Noite)';
                const turnoHorario = isTurno1 ? `${t1_inicio} às ${t1_fim}` : `${t2_inicio} às ${t2_fim}`;
                const turnoClass = isTurno1 ? 'turno-dia' : 'turno-noite';
                const turnoIcon = isTurno1 ? 'ph-sun' : 'ph-moon';

                // Salva na memória
                this.escalaGerada.push({
                    data: dataInput,
                    turno: turnoNome,
                    motorista_id: driver.id,
                    caminhao_id: truck.id || null
                });

                return `
                    <tr>
                        <td><strong>${dataFormatada}</strong></td>
                        <td>
                            <span class="turno-badge ${turnoClass}">
                                <i class="ph-fill ${turnoIcon}"></i> ${turnoNome} (${turnoHorario})
                            </span>
                        </td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <i class="ph-fill ph-steering-wheel" style="color: var(--text-secondary);"></i>
                                <strong>${driver.nome}</strong>
                            </div>
                        </td>
                        <td>
                            <span class="caminhao-status-badge status-disponivel" style="background-color: var(--bg-dark); color: var(--text-primary); border: 1px solid var(--border-color);">
                                <i class="ph-fill ph-truck"></i> #${truck.cod_equipamento}
                            </span>
                        </td>
                        <td>
                            <span class="motorista-badge" style="background-color: rgba(214, 158, 46, 0.1); color: #D69E2E; border-color: rgba(214, 158, 46, 0.3);">
                                Rascunho (Não Salvo)
                            </span>
                        </td>
                    </tr>
                `;
            };

            // Gera as linhas do Turno 1
            turno1Drivers.forEach((driver, i) => {
                tbodyHTML += renderRow(driver, i, true);
            });

            // Gera as linhas do Turno 2
            turno2Drivers.forEach((driver, i) => {
                tbodyHTML += renderRow(driver, i, false);
            });

            // Atualiza a UI
            document.getElementById('tabela-escalas-body').innerHTML = tbodyHTML;
            document.getElementById('btn-limpar-escala').style.display = 'inline-flex';
            document.getElementById('btn-salvar-escala').style.display = 'inline-flex';

            hideLoading();
            showToast('Escala gerada automaticamente! Revise e clique em Salvar.', 'success');

        }, 500); // Simulando um tempo de processamento para melhor UX
    }

    clearScale() {
        this.escalaGerada = [];
        document.getElementById('tabela-escalas-body').innerHTML = `
            <tr>
                <td colspan="5" class="empty-state-escala">
                    <i class="ph-fill ph-calendar-blank" style="font-size: 3rem; color: var(--text-secondary); margin-bottom: 10px;"></i>
                    <p>Escala limpa.</p>
                    <span>Configure as opções ao lado e clique em "Gerar Escala" para criar um novo rascunho.</span>
                </td>
            </tr>
        `;
        document.getElementById('btn-limpar-escala').style.display = 'none';
        document.getElementById('btn-salvar-escala').style.display = 'none';
    }

    async saveScale() {
        if (this.escalaGerada.length === 0) return;

        showLoading();
        try {
            // OBS: Aqui você implementaria a chamada real da API para salvar a escala no banco.
            // Exemplo: await insertItem('escalas', this.escalaGerada);
            
            // Simulação de salvamento
            await new Promise(resolve => setTimeout(resolve, 800));

            // Muda o visual das tags de Rascunho para Salvo
            const statusBadges = document.querySelectorAll('#tabela-escalas-body .motorista-badge');
            statusBadges.forEach(badge => {
                badge.textContent = 'Salvo Oficialmente';
                badge.style.backgroundColor = 'rgba(56, 161, 105, 0.1)';
                badge.style.color = '#38A169';
                badge.style.borderColor = 'rgba(56, 161, 105, 0.3)';
            });

            document.getElementById('btn-salvar-escala').style.display = 'none';
            document.getElementById('btn-limpar-escala').style.display = 'none';

            showToast('Escala oficializada com sucesso no banco de dados!', 'success');
        } catch (error) {
            console.error(error);
            showToast('Erro ao salvar a escala no banco de dados.', 'error');
        } finally {
            hideLoading();
        }
    }
}