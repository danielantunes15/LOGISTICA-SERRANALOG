// js/views/escalas.js
import { dataCache } from '../dataCache.js';
import { showToast, showLoading, hideLoading, handleOperation } from '../helpers.js';
import { insertItem, deleteItem } from '../api.js';
import { supabase } from '../supabase.js';

export class EscalasView {
    constructor() {
        this.containerId = 'views-container';
        this.motoristas = [];
        this.caminhoes = [];
        this.controladores = [];
        this.currentAgendaDate = new Date();
    }

    async show() {
        const container = document.getElementById(this.containerId);
        
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

        document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
        
        const view = document.getElementById('escalas-view');
        if (view) {
            view.style.display = 'block';
            
            // Define data atual
            const todayStr = this.currentAgendaDate.toISOString().split('T')[0];
            document.getElementById('escala-data').value = todayStr;
            document.getElementById('agenda-date-picker').value = todayStr;

            await this.loadData();
            this.initListeners();
            await this.loadAgendaData(todayStr); // Carrega a agenda de hoje
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
            const masterData = await dataCache.fetchMasterDataOnly();
            
            // 1. Caminhões Ativos
            this.caminhoes = (masterData.caminhoes || []).filter(c => c.status !== 'inativo');
            
            // 2. Filtro ROBUSTO de Motoristas e Controladores
            this.motoristas = [];
            this.controladores = [];

            const todosTerceirosAtivos = (masterData.terceiros || []).filter(t => t.situacao === 'ativo');

            todosTerceirosAtivos.forEach(t => {
                const stringBusca = `${t.descricao_atividade || ''} ${t.funcao || ''} ${t.cargo || ''} ${t.tipo || ''}`.toLowerCase();
                
                if (stringBusca.includes('motorista') || stringBusca.includes('mot ')) {
                    this.motoristas.push(t);
                } else if (stringBusca.includes('controlador') || stringBusca.includes('tráfego') || stringBusca.includes('trafego')) {
                    this.controladores.push(t);
                }
            });

            // GATILHO DE SEGURANÇA: Se não achou nenhum "motorista" pelas palavras, joga todo mundo ativo na lista para o gerador não quebrar
            if (this.motoristas.length === 0) {
                this.motoristas = todosTerceirosAtivos;
            }

            this.updateStatsPanel();

        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            showToast('Erro ao buscar motoristas', 'error');
        } finally {
            hideLoading();
        }
    }

    updateStatsPanel() {
        document.getElementById('count-motoristas').textContent = this.motoristas.length;
        document.getElementById('count-caminhoes').textContent = this.caminhoes.length;
    }

    initListeners() {
        // --- Navegação das Abas ---
        const tabs = document.querySelectorAll('.escala-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Remove a classe active de todas as abas e conteúdos
                document.querySelectorAll('.escala-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.escala-tab-content').forEach(c => c.classList.remove('active'));
                
                // Adiciona na aba clicada
                const clickedTab = e.currentTarget;
                clickedTab.classList.add('active');
                
                // Mostra a div correspondente
                const targetId = `tab-${clickedTab.dataset.tab}`;
                document.getElementById(targetId).classList.add('active');

                // Lógica ao trocar de aba
                if (clickedTab.dataset.tab === 'agenda') {
                    this.loadAgendaData(document.getElementById('agenda-date-picker').value);
                } else if (clickedTab.dataset.tab === 'semanal') {
                    this.loadWeeklyAgenda();
                }
            });
        });

        // --- Agenda: Data e Botões ---
        document.getElementById('agenda-date-picker').addEventListener('change', (e) => {
            this.currentAgendaDate = new Date(e.target.value + 'T12:00:00'); 
            this.loadAgendaData(e.target.value);
        });

        document.getElementById('btn-prev-day').addEventListener('click', () => {
            this.currentAgendaDate.setDate(this.currentAgendaDate.getDate() - 1);
            const dateStr = this.currentAgendaDate.toISOString().split('T')[0];
            document.getElementById('agenda-date-picker').value = dateStr;
            this.loadAgendaData(dateStr);
        });

        document.getElementById('btn-next-day').addEventListener('click', () => {
            this.currentAgendaDate.setDate(this.currentAgendaDate.getDate() + 1);
            const dateStr = this.currentAgendaDate.toISOString().split('T')[0];
            document.getElementById('agenda-date-picker').value = dateStr;
            this.loadAgendaData(dateStr);
        });


        // --- Gerador: Botões Principais ---
        document.getElementById('refresh-escalas')?.addEventListener('click', async () => {
            await dataCache.fetchMasterDataOnly(true); 
            await this.loadData();
            await this.loadAgendaData(document.getElementById('agenda-date-picker').value);
            showToast('Dados recarregados.', 'success');
        });
        
        document.getElementById('btn-gerar-auto')?.addEventListener('click', () => this.generateAutomaticScale());
        document.getElementById('btn-add-linha')?.addEventListener('click', () => this.addTableRow());
        document.getElementById('btn-limpar-escala')?.addEventListener('click', () => this.clearScale());
        document.getElementById('btn-salvar-escala')?.addEventListener('click', () => this.saveScale());

        // --- Deleção Dinâmica na Agenda ---
        document.getElementById('agenda-grid-container').addEventListener('click', async (e) => {
            const btnDelete = e.target.closest('.btn-delete-escala');
            if (btnDelete) {
                const id = btnDelete.dataset.id;
                if(confirm('Tem certeza que deseja remover este motorista da escala deste dia?')) {
                    showLoading();
                    const { error } = await deleteItem('escalas', id);
                    hideLoading();
                    if (!error) {
                        showToast('Escala removida!', 'success');
                        this.loadAgendaData(document.getElementById('agenda-date-picker').value);
                    } else {
                        handleOperation(error);
                    }
                }
            }
        });
    }

    // ==========================================
    // LÓGICA: ABA 1 - AGENDA GERAL (HOJE)
    // ==========================================
    async loadAgendaData(dateStr) {
        showLoading();
        try {
            const { data: escalasDb, error } = await supabase
                .from('escalas')
                .select('*')
                .eq('data', dateStr);

            if (error) throw error;

            const listaDia = document.getElementById('agenda-lista-dia');
            const listaNoite = document.getElementById('agenda-lista-noite');
            const listaControladores = document.getElementById('agenda-lista-controladores');

            listaDia.innerHTML = ''; listaNoite.innerHTML = ''; listaControladores.innerHTML = '';
            let countDia = 0, countNoite = 0;

            if (escalasDb && escalasDb.length > 0) {
                escalasDb.forEach(escala => {
                    const motorista = this.motoristas.find(m => m.id === escala.motorista_id);
                    const caminhao = this.caminhoes.find(c => c.id === escala.caminhao_id);

                    const nomeFormatado = motorista ? motorista.nome : 'Motorista Não Encontrado';
                    const caminhaoFormatado = caminhao ? `#${caminhao.cod_equipamento}` : 'Reserva / Folga';

                    const cardHTML = `
                        <div class="agenda-card">
                            <div class="agenda-card-info">
                                <h4>${nomeFormatado}</h4>
                                <p><i class="ph-fill ph-steering-wheel"></i> Motorista</p>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div class="agenda-card-truck"><i class="ph-fill ph-truck"></i> ${caminhaoFormatado}</div>
                                <button class="btn-delete-escala" data-id="${escala.id}" title="Remover da Escala"><i class="ph-bold ph-x"></i></button>
                            </div>
                        </div>
                    `;

                    if (escala.turno.includes('Dia')) {
                        listaDia.innerHTML += cardHTML; countDia++;
                    } else {
                        listaNoite.innerHTML += cardHTML; countNoite++;
                    }
                });
            }

            if (countDia === 0) listaDia.innerHTML = '<div class="empty-state-agenda">Nenhum motorista escalado para o dia.</div>';
            if (countNoite === 0) listaNoite.innerHTML = '<div class="empty-state-agenda">Nenhum motorista escalado para a noite.</div>';

            document.getElementById('count-agenda-dia').textContent = countDia;
            document.getElementById('count-agenda-noite').textContent = countNoite;

            // Controladores Fixos na Base
            document.getElementById('count-agenda-controladores').textContent = this.controladores.length;
            if (this.controladores.length > 0) {
                this.controladores.forEach(ctrl => {
                    listaControladores.innerHTML += `
                        <div class="agenda-card" style="border-left-color: #805AD5;">
                            <div class="agenda-card-info">
                                <h4>${ctrl.nome}</h4><p><i class="ph-fill ph-headset"></i> Ativo na Base</p>
                            </div>
                        </div>`;
                });
            } else {
                listaControladores.innerHTML = '<div class="empty-state-agenda">Nenhum controlador cadastrado ou ativo.</div>';
            }

        } catch (error) {
            console.error(error);
            showToast('Erro ao carregar os dados da agenda.', 'error');
        } finally {
            hideLoading();
        }
    }

    // ==========================================
    // LÓGICA: ABA 2 - VISÃO 7 DIAS
    // ==========================================
    async loadWeeklyAgenda() {
        showLoading();
        try {
            // Gera um array com as datas de Hoje até Hoje + 6
            const today = new Date();
            const datesToFetch = [];
            
            for(let i = 0; i < 7; i++) {
                const d = new Date(today);
                d.setDate(today.getDate() + i);
                datesToFetch.push(d.toISOString().split('T')[0]);
            }

            // Puxa tudo do banco para esses 7 dias
            const { data: escalasDb, error } = await supabase
                .from('escalas')
                .select('*')
                .in('data', datesToFetch);

            if (error) throw error;

            const container = document.getElementById('semana-grid-container');
            container.innerHTML = '';

            // Renderiza um card para cada dia
            datesToFetch.forEach(dateStr => {
                const [y, m, d] = dateStr.split('-');
                const dateFormatted = `${d}/${m}/${y}`;
                
                // Filtra escalas do respectivo dia
                const escalasDoDia = escalasDb.filter(e => e.data === dateStr);
                const diaDrivers = escalasDoDia.filter(e => e.turno.includes('Dia'));
                const noiteDrivers = escalasDoDia.filter(e => e.turno.includes('Noite'));

                // Renderiza Nomes Pequenos
                const renderDriverName = (esc) => {
                    const mot = this.motoristas.find(m => m.id === esc.motorista_id);
                    const nomeStr = mot ? mot.nome.split(' ')[0] : 'Desconhecido';
                    return `<div class="semana-driver-item"><i class="ph-fill ph-user"></i> ${nomeStr}</div>`;
                };

                const diaHTML = diaDrivers.length > 0 
                    ? diaDrivers.map(renderDriverName).join('') 
                    : '<span style="color: var(--text-secondary); font-size: 0.8rem;">Folga Geral</span>';
                
                const noiteHTML = noiteDrivers.length > 0 
                    ? noiteDrivers.map(renderDriverName).join('') 
                    : '<span style="color: var(--text-secondary); font-size: 0.8rem;">Folga Geral</span>';

                container.innerHTML += `
                    <div class="semana-card">
                        <div class="semana-card-header">
                            <span class="date-title"><i class="ph-fill ph-calendar"></i> ${dateFormatted}</span>
                            <span class="badge-count">${escalasDoDia.length} Agendados</span>
                        </div>
                        <div class="semana-turnos">
                            <div class="semana-turno-col">
                                <div class="semana-turno-title"><i class="ph-fill ph-sun" style="color: #D69E2E;"></i> Dia</div>
                                ${diaHTML}
                            </div>
                            <div class="semana-turno-col">
                                <div class="semana-turno-title"><i class="ph-fill ph-moon" style="color: #2B6CB0;"></i> Noite</div>
                                ${noiteHTML}
                            </div>
                        </div>
                    </div>
                `;
            });

        } catch (error) {
            console.error('Erro na visão semanal:', error);
            showToast('Erro ao carregar visão semanal.', 'error');
        } finally {
            hideLoading();
        }
    }


    // ==========================================
    // LÓGICA: ABA 3 - GERADOR AUTOMÁTICO
    // ==========================================
    
    getSelectHTML(tipo, valorSelecionado = null) {
        if (tipo === 'turno') {
            return `
                <select class="select-tabela input-turno">
                    <option value="Turno 1 (Dia)" ${valorSelecionado === 'Turno 1 (Dia)' ? 'selected' : ''}>Turno 1 (Dia)</option>
                    <option value="Turno 2 (Noite)" ${valorSelecionado === 'Turno 2 (Noite)' ? 'selected' : ''}>Turno 2 (Noite)</option>
                </select>
            `;
        }
        if (tipo === 'motorista') {
            const options = this.motoristas.map(m => `<option value="${m.id}" ${m.id === valorSelecionado ? 'selected' : ''}>${m.nome}</option>`).join('');
            return `<select class="select-tabela input-motorista"><option value="">Selecione o Funcionário...</option>${options}</select>`;
        }
        if (tipo === 'caminhao') {
            const options = this.caminhoes.map(c => `<option value="${c.id}" ${c.id === valorSelecionado ? 'selected' : ''}>${c.cod_equipamento} - ${c.placa || ''}</option>`).join('');
            return `<select class="select-tabela input-caminhao"><option value="">Reserva / Sem Caminhão</option>${options}</select>`;
        }
    }

    addTableRow(turnoPref = 'Turno 1 (Dia)', motId = null, camId = null) {
        const tbody = document.getElementById('tabela-escalas-body');
        const linhaVazia = document.getElementById('linha-vazia');
        if (linhaVazia) linhaVazia.remove();

        const tr = document.createElement('tr');
        tr.className = 'escala-row-draft';
        tr.innerHTML = `
            <td>${this.getSelectHTML('turno', turnoPref)}</td>
            <td>${this.getSelectHTML('motorista', motId)}</td>
            <td>${this.getSelectHTML('caminhao', camId)}</td>
            <td style="text-align: center;">
                <button type="button" class="btn-remover-linha" onclick="this.closest('tr').remove()"><i class="ph-bold ph-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);

        document.getElementById('btn-limpar-escala').style.display = 'inline-flex';
        document.getElementById('btn-salvar-escala').style.display = 'inline-flex';
    }

    generateAutomaticScale() {
        if (this.motoristas.length === 0) {
            showToast('Nenhum funcionário encontrado para gerar escala.', 'error');
            return;
        }

        showLoading();
        this.clearScale(); 

        setTimeout(() => {
            const shuffled = [...this.motoristas].sort(() => 0.5 - Math.random());
            const half = Math.ceil(shuffled.length / 2);
            const diaDrivers = shuffled.slice(0, half);
            const noiteDrivers = shuffled.slice(half);

            const trucks = [...this.caminhoes];

            diaDrivers.forEach((d, i) => {
                const truckId = trucks.length > 0 ? trucks[i % trucks.length].id : null;
                this.addTableRow('Turno 1 (Dia)', d.id, truckId);
            });

            noiteDrivers.forEach((d, i) => {
                const truckId = trucks.length > 0 ? trucks[i % trucks.length].id : null;
                this.addTableRow('Turno 2 (Noite)', d.id, truckId);
            });

            hideLoading();
            showToast('Tabela preenchida! Edite o que for necessário e clique em Salvar.', 'success');

        }, 400); 
    }

    clearScale() {
        document.getElementById('tabela-escalas-body').innerHTML = `
            <tr id="linha-vazia">
                <td colspan="4" class="empty-state-escala">
                    <i class="ph-fill ph-table" style="font-size: 3rem; color: var(--text-secondary); margin-bottom: 10px;"></i>
                    <p>Tabela vazia.</p>
                    <span>Clique em "Preencher Automático" ou adicione linhas manualmente.</span>
                </td>
            </tr>
        `;
        document.getElementById('btn-limpar-escala').style.display = 'none';
        document.getElementById('btn-salvar-escala').style.display = 'none';
    }

    async saveScale() {
        const rows = document.querySelectorAll('.escala-row-draft');
        if (rows.length === 0) return;

        const dataSelecionada = document.getElementById('escala-data').value;
        if (!dataSelecionada) {
            showToast('Selecione a data da escala no painel de configuração.', 'error');
            return;
        }

        const escalasParaSalvar = [];
        let temErro = false;

        rows.forEach(row => {
            const turno = row.querySelector('.input-turno').value;
            const motorista_id = row.querySelector('.input-motorista').value;
            const caminhao_id = row.querySelector('.input-caminhao').value;

            if (!motorista_id) {
                temErro = true;
                row.style.borderLeft = "4px solid red";
            } else {
                row.style.borderLeft = "none";
                escalasParaSalvar.push({
                    data: dataSelecionada,
                    turno: turno,
                    motorista_id: motorista_id,
                    caminhao_id: caminhao_id || null 
                });
            }
        });

        if (temErro) {
            showToast('Existem linhas sem motorista selecionado. Corrija para salvar.', 'error');
            return;
        }

        showLoading();
        try {
            for (const esc of escalasParaSalvar) {
                const { error } = await insertItem('escalas', esc);
                if (error) throw error;
            }

            this.clearScale(); 
            showToast('Escala salva no Banco de Dados com Sucesso!', 'success');
            
            // Vai para a aba da agenda para ver o resultado
            document.getElementById('agenda-date-picker').value = dataSelecionada;
            this.currentAgendaDate = new Date(dataSelecionada + 'T12:00:00');
            await this.loadAgendaData(dataSelecionada);
            document.querySelector('.escala-tab[data-tab="agenda"]').click();

        } catch (error) {
            console.error('Erro ao salvar:', error);
            showToast('Erro de comunicação com o servidor ao salvar.', 'error');
        } finally {
            hideLoading();
        }
    }
}