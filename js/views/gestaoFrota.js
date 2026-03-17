// js/views/gestaoFrota.js
import { showToast, showLoading, hideLoading, handleOperation } from '../helpers.js';
import { insertItem } from '../api.js'; 
import { dataCache } from '../dataCache.js';

export class GestaoFrotaView {
    constructor(modulo) {
        this.modulo = modulo; 
        this.container = null;
        this.caminhoes = [];
        this.motoristas = [];
        
        // Dados específicos de cada módulo
        this.abastecimentos = [];
        this.pneus = [];
        this.manutencoes = [];
        this.telemetrias = [];
    }

    async show() {
        showLoading();
        await this.loadData();
        await this.loadHTML();
        this.addEventListeners();
        hideLoading();
    }

    async hide() {}

    async loadData() {
        // 1. Carrega dados mestres do cache (Caminhões e Motoristas)
        const masterData = await dataCache.fetchMasterDataOnly();
        this.caminhoes = masterData.caminhoes || [];
        // Filtra terceiros para pegar apenas quem tem 'motorista' na atividade
        this.motoristas = masterData.terceiros ? masterData.terceiros.filter(t => t.descricao_atividade?.toLowerCase().includes('motorista')) : [];
        
        // 2. Importa o Supabase dinamicamente para buscar as tabelas de Frota
        try {
            const { supabase } = await import('../supabase.js');

            if (this.modulo === 'abastecimento' || this.modulo === 'dashboard') {
                const { data } = await supabase.from('frota_abastecimentos').select('*, caminhoes(cod_equipamento, placa), terceiros(nome)').order('data_abastecimento', { ascending: false }).limit(50);
                this.abastecimentos = data || [];
            }
            if (this.modulo === 'pneus' || this.modulo === 'dashboard') {
                const { data } = await supabase.from('frota_pneus').select('*, caminhoes(cod_equipamento)').order('created_at', { ascending: false });
                this.pneus = data || [];
            }
            if (this.modulo === 'manutencao' || this.modulo === 'dashboard') {
                const { data } = await supabase.from('frota_manutencoes').select('*, caminhoes(cod_equipamento)').order('data_abertura', { ascending: false });
                this.manutencoes = data || [];
            }
            if (this.modulo === 'telemetria' || this.modulo === 'dashboard') {
                const { data } = await supabase.from('frota_telemetria').select('*, caminhoes(cod_equipamento), terceiros(nome)').order('data_leitura', { ascending: false });
                this.telemetrias = data || [];
            }
        } catch (err) {
            console.error(`Erro ao buscar dados do módulo ${this.modulo}:`, err);
        }
    }

    async loadHTML() {
        const container = document.getElementById('views-container');
        
        // Roteamento interno da view
        switch (this.modulo) {
            case 'dashboard': container.innerHTML = this.getDashboardHTML(); break;
            case 'abastecimento': container.innerHTML = this.getAbastecimentoHTML(); break;
            case 'pneus': container.innerHTML = this.getPneusHTML(); break;
            case 'manutencao': container.innerHTML = this.getManutencaoHTML(); break;
            case 'telemetria': container.innerHTML = this.getTelemetriaHTML(); break;
            case 'motoristas': container.innerHTML = this.getMotoristasHTML(); break;
            default: container.innerHTML = `<div class="empty-state">Módulo não encontrado</div>`;
        }
        
        this.container = container;
    }

    // ==========================================
    // 1. DASHBOARD DA FROTA (MODERNIZADO)
    // ==========================================
    getDashboardHTML() {
        // 1. Processamento de Dados (Caminhões e Motoristas)
        const totalCaminhoes = this.caminhoes.length;
        const totalMotoristas = this.motoristas.length;
        
        const caminhoesOperacao = this.caminhoes.filter(c => ['indo_carregar', 'carregando', 'retornando', 'descarregando'].includes(c?.status)).length;
        const caminhoesParados = this.caminhoes.filter(c => ['quebrado', 'parado', 'pendente_checklist'].includes(c?.status)).length;
        const caminhoesDisponiveis = this.caminhoes.filter(c => ['disponivel', 'patio_vazio'].includes(c?.status)).length;

        // Porcentagens para a barra visual
        const pctOperacao = totalCaminhoes > 0 ? (caminhoesOperacao / totalCaminhoes) * 100 : 0;
        const pctParados = totalCaminhoes > 0 ? (caminhoesParados / totalCaminhoes) * 100 : 0;
        const pctDisponivel = totalCaminhoes > 0 ? (caminhoesDisponiveis / totalCaminhoes) * 100 : 0;

        // 2. Processamento de Manutenção
        const osAbertas = this.manutencoes.filter(m => m.status_os !== 'Concluída').length;
        const osConcluidas = this.manutencoes.filter(m => m.status_os === 'Concluída').length;
        const custoTotalManutencao = this.manutencoes.reduce((acc, m) => acc + parseFloat(m.custo_pecas || 0) + parseFloat(m.custo_mao_obra || 0), 0);

        // 3. Processamento de Abastecimento
        let totalMediaKml = 0;
        let countMedia = 0;
        let custoTotalAbastecimento = 0;
        this.abastecimentos.forEach(ab => {
            if (ab.media_kml) { totalMediaKml += parseFloat(ab.media_kml); countMedia++; }
            if (ab.valor_total) { custoTotalAbastecimento += parseFloat(ab.valor_total); }
        });
        const mediaGeralKml = countMedia > 0 ? (totalMediaKml / countMedia).toFixed(2) : '0.00';

        // 4. Processamento de Pneus
        const totalPneus = this.pneus.length;
        const pneusEmUso = this.pneus.filter(p => p.status === 'Em Uso').length;
        const pneusEstoque = this.pneus.filter(p => p.status === 'Estoque').length;
        const pneusManutencao = this.pneus.filter(p => p.status === 'Manutenção').length;

        // 5. Processamento de Telemetria
        let sumFreadas = 0;
        let sumRpm = 0;
        let sumOcioso = 0;
        this.telemetrias.forEach(t => {
            sumFreadas += parseInt(t.eventos_freada_brusca || 0);
            sumRpm += parseInt(t.eventos_excesso_rpm || 0);
            sumOcioso += parseInt(t.tempo_ocioso_minutos || 0);
        });
        const mediaTelemetria = this.telemetrias.length > 0
            ? (this.telemetrias.reduce((acc, t) => acc + parseFloat(t.nota_conducao || 0), 0) / this.telemetrias.length).toFixed(1)
            : 'N/A';

        // Helper Monetário
        const formatMoney = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

        return `
            <div id="gestao-frota-view-dashboard" class="view active-view frota-dashboard-wrapper">
                <div class="cadastro-header" style="margin-bottom: 24px; border: none; padding: 0;">
                    <h1><i class="ph-fill ph-chart-line-up"></i> Painel Gerencial de Frota</h1>
                    <p style="color: var(--text-secondary); margin-top: 5px;">Visão 360º de disponibilidade, manutenções, consumo e telemetria.</p>
                </div>

                <div class="frota-kpi-grid">
                    <div class="frota-kpi-card">
                        <div class="frota-kpi-icon" style="background: linear-gradient(135deg, #3182CE, #2B6CB0);">
                            <i class="ph-fill ph-truck"></i>
                        </div>
                        <div class="frota-kpi-details">
                            <h3>Total de Caminhões</h3>
                            <p>${totalCaminhoes}</p>
                        </div>
                    </div>
                    
                    <div class="frota-kpi-card">
                        <div class="frota-kpi-icon" style="background: linear-gradient(135deg, #38A169, #2F855A);">
                            <i class="ph-fill ph-steering-wheel"></i>
                        </div>
                        <div class="frota-kpi-details">
                            <h3>Motoristas Cadastrados</h3>
                            <p>${totalMotoristas}</p>
                        </div>
                    </div>

                    <div class="frota-kpi-card">
                        <div class="frota-kpi-icon" style="background: linear-gradient(135deg, #E53E3E, #C53030);">
                            <i class="ph-fill ph-wrench"></i>
                        </div>
                        <div class="frota-kpi-details">
                            <h3>O.S. em Andamento</h3>
                            <p>${osAbertas}</p>
                        </div>
                    </div>

                    <div class="frota-kpi-card">
                        <div class="frota-kpi-icon" style="background: linear-gradient(135deg, #D69E2E, #B7791F);">
                            <i class="ph-fill ph-gas-pump"></i>
                        </div>
                        <div class="frota-kpi-details">
                            <h3>Média Geral (Km/L)</h3>
                            <p>${mediaGeralKml}</p>
                        </div>
                    </div>
                </div>

                <div class="frota-panels-grid">
                    
                    <div class="frota-panel">
                        <div class="frota-panel-header">
                            <i class="ph-fill ph-activity"></i> Status Atual da Frota
                        </div>
                        <div class="frota-stat-row">
                            <span class="frota-stat-label">Em Operação (Colheita/Usina)</span>
                            <span class="frota-stat-value highlight-green">${caminhoesOperacao}</span>
                        </div>
                        <div class="frota-stat-row">
                            <span class="frota-stat-label">Disponíveis / Pátio</span>
                            <span class="frota-stat-value highlight-blue">${caminhoesDisponiveis}</span>
                        </div>
                        <div class="frota-stat-row">
                            <span class="frota-stat-label">Em Manutenção / Parados</span>
                            <span class="frota-stat-value highlight-red">${caminhoesParados}</span>
                        </div>
                        
                        <div style="margin-top: 15px;">
                            <span style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 5px; display: block;">Distribuição de Disponibilidade</span>
                            <div class="progress-bar-container">
                                <div style="width: ${pctOperacao}%; background-color: #38A169;" title="Operação: ${pctOperacao.toFixed(1)}%"></div>
                                <div style="width: ${pctDisponivel}%; background-color: #3182CE;" title="Disponível: ${pctDisponivel.toFixed(1)}%"></div>
                                <div style="width: ${pctParados}%; background-color: var(--accent-danger);" title="Parado: ${pctParados.toFixed(1)}%"></div>
                            </div>
                        </div>
                    </div>

                    <div class="frota-panel">
                        <div class="frota-panel-header">
                            <i class="ph-fill ph-wallet"></i> Manutenção & Custos
                        </div>
                        <div class="frota-stat-row">
                            <span class="frota-stat-label">O.S. Concluídas (Histórico)</span>
                            <span class="frota-stat-value">${osConcluidas}</span>
                        </div>
                        <div class="frota-stat-row">
                            <span class="frota-stat-label">O.S. Pendentes / Abertas</span>
                            <span class="frota-stat-value highlight-red">${osAbertas}</span>
                        </div>
                        <div class="frota-stat-row">
                            <span class="frota-stat-label">Custo Total em Manutenções</span>
                            <span class="frota-stat-value highlight-yellow">${formatMoney(custoTotalManutencao)}</span>
                        </div>
                        <div class="frota-stat-row">
                            <span class="frota-stat-label">Custo Total de Combustível (Reg.)</span>
                            <span class="frota-stat-value">${formatMoney(custoTotalAbastecimento)}</span>
                        </div>
                    </div>

                    <div class="frota-panel">
                        <div class="frota-panel-header">
                            <i class="ph-fill ph-broadcast"></i> Telemetria & Condução
                        </div>
                        <div class="frota-stat-row">
                            <span class="frota-stat-label">Nota Média dos Motoristas</span>
                            <span class="frota-stat-value ${mediaTelemetria >= 80 ? 'highlight-green' : 'highlight-red'}">${mediaTelemetria}</span>
                        </div>
                        <div class="frota-stat-row">
                            <span class="frota-stat-label">Total de Freadas Bruscas</span>
                            <span class="frota-stat-value highlight-yellow">${sumFreadas}</span>
                        </div>
                        <div class="frota-stat-row">
                            <span class="frota-stat-label">Eventos de Excesso de RPM</span>
                            <span class="frota-stat-value highlight-red">${sumRpm}</span>
                        </div>
                        <div class="frota-stat-row">
                            <span class="frota-stat-label">Tempo Ocioso Acumulado</span>
                            <span class="frota-stat-value">${sumOcioso} min</span>
                        </div>
                    </div>

                    <div class="frota-panel">
                        <div class="frota-panel-header">
                            <i class="ph-fill ph-circles-four"></i> Inventário de Pneus
                        </div>
                        <div class="frota-stat-row">
                            <span class="frota-stat-label">Total Cadastrados no Sistema</span>
                            <span class="frota-stat-value">${totalPneus}</span>
                        </div>
                        <div class="frota-stat-row">
                            <span class="frota-stat-label">Pneus em Uso (Instalados)</span>
                            <span class="frota-stat-value highlight-blue">${pneusEmUso}</span>
                        </div>
                        <div class="frota-stat-row">
                            <span class="frota-stat-label">Pneus Novos/Bons no Estoque</span>
                            <span class="frota-stat-value highlight-green">${pneusEstoque}</span>
                        </div>
                        <div class="frota-stat-row">
                            <span class="frota-stat-label">Enviados para Recapagem/Manut.</span>
                            <span class="frota-stat-value highlight-yellow">${pneusManutencao}</span>
                        </div>
                    </div>

                </div>
            </div>
        `;
    }

    // ==========================================
    // 2. ABASTECIMENTO (Mantido o que já fizemos)
    // ==========================================
    getAbastecimentoHTML() {
        const optionsCaminhoes = this.caminhoes.map(c => `<option value="${c.id}">${c.cod_equipamento} - ${c.placa || 'Sem Placa'}</option>`).join('');
        const optionsMotoristas = this.motoristas.map(m => `<option value="${m.id}">${m.nome}</option>`).join('');

        const trsHistorico = this.abastecimentos.map(ab => `
            <tr>
                <td>${new Date(ab.data_abastecimento).toLocaleDateString('pt-BR')}</td>
                <td><strong>${ab.caminhoes?.cod_equipamento || 'N/A'}</strong></td>
                <td>${ab.terceiros?.nome || 'Não informado'}</td>
                <td>${ab.odometro_horimetro}</td>
                <td>${ab.litros_diesel} L</td>
                <td>${ab.litros_arla > 0 ? ab.litros_arla + ' L' : '-'}</td>
                <td><strong style="color: var(--accent-primary);">${ab.media_kml ? ab.media_kml + ' km/L' : '1ª Leitura'}</strong></td>
            </tr>
        `).join('');

        return `
            <div id="gestao-frota-view-abastecimento" class="view active-view">
                <div class="cadastro-container">
                    <div class="cadastro-header">
                        <h1><i class="ph-fill ph-gas-pump"></i> Controle de Abastecimento</h1>
                    </div>
                    <div class="cadastro-content">
                        <div class="form-section-modern" style="margin-bottom: 20px;">
                            <h3>Registrar Novo Abastecimento</h3>
                            <form id="form-abastecimento" class="form-modern">
                                <div class="form-group"><label>Caminhão</label><select name="caminhao_id" class="form-select" required><option value="">Selecione...</option>${optionsCaminhoes}</select></div>
                                <div class="form-group"><label>Motorista</label><select name="motorista_id" class="form-select" required><option value="">Selecione...</option>${optionsMotoristas}</select></div>
                                <div class="form-group"><label>Odômetro Atual</label><input type="number" name="odometro_horimetro" class="form-input" required></div>
                                <div class="form-group"><label>Litros Diesel</label><input type="number" step="0.01" name="litros_diesel" class="form-input" required></div>
                                <div class="form-group"><label>Litros Arla</label><input type="number" step="0.01" name="litros_arla" class="form-input"></div>
                                <div class="form-group"><label>Valor (R$)</label><input type="number" step="0.01" name="valor_total" class="form-input"></div>
                                <button type="submit" class="form-submit"><i class="ph-fill ph-floppy-disk"></i> Salvar</button>
                            </form>
                        </div>
                        <div class="list-container-modern">
                            <h2>Últimos Abastecimentos</h2>
                            <div class="table-wrapper"><table class="data-table-modern"><thead><tr><th>Data</th><th>Caminhão</th><th>Motorista</th><th>Odômetro</th><th>Diesel</th><th>Arla</th><th>Média km/L</th></tr></thead><tbody>${trsHistorico || '<tr><td colspan="7">Nenhum registro.</td></tr>'}</tbody></table></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ==========================================
    // 3. GESTÃO DE PNEUS
    // ==========================================
    getPneusHTML() {
        const optionsCaminhoes = this.caminhoes.map(c => `<option value="${c.id}">${c.cod_equipamento}</option>`).join('');
        
        const trsHistorico = this.pneus.map(p => `
            <tr>
                <td><strong>${p.codigo_fogo}</strong></td>
                <td>${p.marca || '-'} / ${p.modelo || '-'}</td>
                <td>${p.vida_atual}</td>
                <td><span class="caminhao-status-badge status-${p.status === 'Em Uso' ? 'disponivel' : 'manutencao'}">${p.status}</span></td>
                <td>${p.caminhoes?.cod_equipamento || 'Estoque'}</td>
                <td>${p.posicao || '-'}</td>
                <td><strong>${p.sulco_mm} mm</strong></td>
            </tr>
        `).join('');

        return `
            <div id="gestao-frota-view-pneus" class="view active-view">
                <div class="cadastro-container">
                    <div class="cadastro-header">
                        <h1><i class="ph-fill ph-circles-four"></i> Gestão de Pneus</h1>
                    </div>
                    <div class="cadastro-content">
                        <div class="form-section-modern" style="margin-bottom: 20px;">
                            <h3>Cadastrar / Instalar Pneu</h3>
                            <form id="form-pneus" class="form-modern">
                                <div class="form-group"><label>Cód. Fogo (Identificação)</label><input type="text" name="codigo_fogo" class="form-input" required placeholder="Ex: F-1020"></div>
                                <div class="form-group"><label>Marca</label><input type="text" name="marca" class="form-input" required></div>
                                <div class="form-group"><label>Profundidade do Sulco (mm)</label><input type="number" step="0.1" name="sulco_mm" class="form-input" required></div>
                                <div class="form-group">
                                    <label>Vida Atual</label>
                                    <select name="vida_atual" class="form-select" required>
                                        <option value="Novo">Novo</option><option value="1ª Recapagem">1ª Recapagem</option><option value="2ª Recapagem">2ª Recapagem</option><option value="Sucata">Sucata</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Status</label>
                                    <select name="status" class="form-select" required>
                                        <option value="Estoque">No Estoque</option><option value="Em Uso">Em Uso (Instalado)</option><option value="Manutenção">Enviado para Recapagem</option>
                                    </select>
                                </div>
                                <div class="form-group"><label>Instalar no Caminhão (Opcional)</label><select name="caminhao_id" class="form-select"><option value="">Deixar no Estoque</option>${optionsCaminhoes}</select></div>
                                <div class="form-group"><label>Posição (Ex: Cavalo-LE1)</label><input type="text" name="posicao" class="form-input"></div>
                                <button type="submit" class="form-submit"><i class="ph-fill ph-floppy-disk"></i> Salvar Pneu</button>
                            </form>
                        </div>
                        <div class="list-container-modern">
                            <h2>Inventário de Pneus</h2>
                            <div class="table-wrapper"><table class="data-table-modern"><thead><tr><th>Fogo</th><th>Marca/Modelo</th><th>Vida</th><th>Status</th><th>Caminhão</th><th>Posição</th><th>Sulco (mm)</th></tr></thead><tbody>${trsHistorico || '<tr><td colspan="7">Nenhum pneu cadastrado.</td></tr>'}</tbody></table></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ==========================================
    // 4. MANUTENÇÃO (Ordens de Serviço)
    // ==========================================
    getManutencaoHTML() {
        const optionsCaminhoes = this.caminhoes.map(c => `<option value="${c.id}">${c.cod_equipamento}</option>`).join('');
        
        const trsHistorico = this.manutencoes.map(m => `
            <tr>
                <td>${new Date(m.data_abertura).toLocaleDateString('pt-BR')}</td>
                <td><strong>${m.caminhoes?.cod_equipamento || 'N/A'}</strong></td>
                <td>${m.tipo_os}</td>
                <td><span class="caminhao-status-badge status-${m.status_os === 'Concluída' ? 'disponivel' : 'manutencao'}">${m.status_os}</span></td>
                <td>${m.descricao_falha}</td>
                <td>R$ ${(parseFloat(m.custo_pecas) + parseFloat(m.custo_mao_obra)).toFixed(2)}</td>
            </tr>
        `).join('');

        return `
            <div id="gestao-frota-view-manutencao" class="view active-view">
                <div class="cadastro-container">
                    <div class="cadastro-header">
                        <h1><i class="ph-fill ph-wrench"></i> Ordens de Serviço (Oficina)</h1>
                    </div>
                    <div class="cadastro-content">
                        <div class="form-section-modern" style="margin-bottom: 20px;">
                            <h3>Abrir Nova O.S.</h3>
                            <form id="form-manutencao" class="form-modern">
                                <div class="form-group"><label>Caminhão</label><select name="caminhao_id" class="form-select" required><option value="">Selecione...</option>${optionsCaminhoes}</select></div>
                                <div class="form-group">
                                    <label>Tipo de Manutenção</label>
                                    <select name="tipo_os" class="form-select" required>
                                        <option value="Corretiva">Corretiva (Quebrou)</option><option value="Preventiva">Preventiva (Revisão)</option><option value="Lubrificação">Lubrificação/Troca de Óleo</option>
                                    </select>
                                </div>
                                <div class="form-group"><label>Odômetro Atual</label><input type="number" name="odometro_atual" class="form-input" required></div>
                                <div class="form-group"><label>Descrição da Falha / Serviço</label><input type="text" name="descricao_falha" class="form-input" required></div>
                                <div class="form-group"><label>Custo Peças (R$)</label><input type="number" step="0.01" name="custo_pecas" class="form-input" value="0"></div>
                                <div class="form-group"><label>Custo Mão de Obra (R$)</label><input type="number" step="0.01" name="custo_mao_obra" class="form-input" value="0"></div>
                                <button type="submit" class="form-submit"><i class="ph-fill ph-wrench"></i> Registrar O.S.</button>
                            </form>
                        </div>
                        <div class="list-container-modern">
                            <h2>Histórico de Manutenções</h2>
                            <div class="table-wrapper"><table class="data-table-modern"><thead><tr><th>Data Abertura</th><th>Caminhão</th><th>Tipo</th><th>Status</th><th>Descrição</th><th>Custo Total</th></tr></thead><tbody>${trsHistorico || '<tr><td colspan="6">Nenhuma O.S. registrada.</td></tr>'}</tbody></table></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ==========================================
    // 5. TELEMETRIA E CONDUÇÃO
    // ==========================================
    getTelemetriaHTML() {
        const optionsCaminhoes = this.caminhoes.map(c => `<option value="${c.id}">${c.cod_equipamento}</option>`).join('');
        const optionsMotoristas = this.motoristas.map(m => `<option value="${m.id}">${m.nome}</option>`).join('');
        
        const trsHistorico = this.telemetrias.map(t => `
            <tr>
                <td>${new Date(t.data_leitura).toLocaleDateString('pt-BR')}</td>
                <td><strong>${t.caminhoes?.cod_equipamento || '-'}</strong></td>
                <td>${t.terceiros?.nome || '-'}</td>
                <td><strong style="color: ${t.nota_conducao > 80 ? 'var(--accent-primary)' : 'var(--accent-danger)'};">${t.nota_conducao}</strong></td>
                <td>${t.eventos_freada_brusca}</td>
                <td>${t.eventos_excesso_rpm}</td>
                <td>${t.tempo_ocioso_minutos} min</td>
            </tr>
        `).join('');

        return `
            <div id="gestao-frota-view-telemetria" class="view active-view">
                <div class="cadastro-container">
                    <div class="cadastro-header">
                        <h1><i class="ph-fill ph-steering-wheel"></i> Telemetria e Condução</h1>
                    </div>
                    <div class="cadastro-content">
                        <div class="form-section-modern" style="margin-bottom: 20px;">
                            <h3>Lançar Dados Diários do Rastreador</h3>
                            <form id="form-telemetria" class="form-modern">
                                <div class="form-group"><label>Data da Leitura</label><input type="date" name="data_leitura" class="form-input" required></div>
                                <div class="form-group"><label>Caminhão</label><select name="caminhao_id" class="form-select" required><option value="">Selecione...</option>${optionsCaminhoes}</select></div>
                                <div class="form-group"><label>Motorista</label><select name="motorista_id" class="form-select" required><option value="">Selecione...</option>${optionsMotoristas}</select></div>
                                <div class="form-group"><label>Nota do Motorista (0 a 100)</label><input type="number" step="0.1" name="nota_conducao" class="form-input" required></div>
                                <div class="form-group"><label>Freadas Bruscas (Qtd)</label><input type="number" name="eventos_freada_brusca" class="form-input" value="0"></div>
                                <div class="form-group"><label>Excesso RPM (Qtd)</label><input type="number" name="eventos_excesso_rpm" class="form-input" value="0"></div>
                                <div class="form-group"><label>Motor Ocioso (Minutos)</label><input type="number" name="tempo_ocioso_minutos" class="form-input" value="0"></div>
                                <button type="submit" class="form-submit"><i class="ph-fill ph-floppy-disk"></i> Salvar Telemetria</button>
                            </form>
                        </div>
                        <div class="list-container-modern">
                            <h2>Ranking de Condução</h2>
                            <div class="table-wrapper"><table class="data-table-modern"><thead><tr><th>Data</th><th>Caminhão</th><th>Motorista</th><th>Nota</th><th>Freadas</th><th>Exc. RPM</th><th>Tempo Ocioso</th></tr></thead><tbody>${trsHistorico || '<tr><td colspan="7">Nenhum dado de telemetria lançado.</td></tr>'}</tbody></table></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ==========================================
    // 6. MOTORISTAS (Visão Geral)
    // ==========================================
    getMotoristasHTML() {
        const trsMotoristas = this.motoristas.map(m => `
            <tr>
                <td><strong>${m.nome}</strong></td>
                <td>${m.cpf_cnpj || '-'}</td>
                <td>${m.empresa_id ? m.proprietarios?.nome || 'Frota Própria' : 'Frota Própria'}</td>
                <td><span class="caminhao-status-badge status-${m.situacao === 'ativo' ? 'disponivel' : 'inativo'}">${m.situacao.toUpperCase()}</span></td>
                <td>
                    <button class="btn-secondary" onclick="alert('Funcionalidade de Escala em breve!')" style="font-size: 0.8rem; padding: 5px;">Ver Escala</button>
                </td>
            </tr>
        `).join('');

        return `
            <div id="gestao-frota-view-motoristas" class="view active-view">
                <div class="cadastro-container">
                    <div class="cadastro-header">
                        <h1><i class="ph-fill ph-identification-card"></i> Quadro de Motoristas</h1>
                        <p>Visão rápida dos motoristas ativos vinculados à frota.</p>
                    </div>
                    <div class="cadastro-content">
                        <div class="list-container-modern">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                                <h2>Motoristas Cadastrados</h2>
                                <button class="btn-primary" onclick="document.querySelector('[data-view=cadastro-terceiros]').click()">
                                    <i class="ph-fill ph-plus"></i> Novo Motorista
                                </button>
                            </div>
                            <div class="table-wrapper"><table class="data-table-modern"><thead><tr><th>Nome do Motorista</th><th>CPF</th><th>Empresa/Vínculo</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${trsMotoristas || '<tr><td colspan="5">Nenhum motorista cadastrado.</td></tr>'}</tbody></table></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ==========================================
    // GERENCIADOR DE FORMULÁRIOS E EVENTOS
    // ==========================================
    addEventListeners() {
        const handleFormSubmit = async (e, tabelaDB) => {
            e.preventDefault();
            showLoading();
            
            const form = e.target;
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            
            // Limpa campos vazios para não quebrar o banco
            for (const key in data) {
                if (data[key] === '') data[key] = null;
            }

            // Tratamentos específicos por tabela
            if (tabelaDB === 'frota_abastecimentos') {
                const ultimoAbast = this.abastecimentos.find(a => a.caminhao_id === data.caminhao_id);
                if (ultimoAbast && ultimoAbast.odometro_horimetro < parseFloat(data.odometro_horimetro)) {
                    const kmRodados = parseFloat(data.odometro_horimetro) - ultimoAbast.odometro_horimetro;
                    data.media_kml = (kmRodados / parseFloat(data.litros_diesel)).toFixed(2);
                }
            }

            try {
                const { error } = await insertItem(tabelaDB, data);
                handleOperation(error, 'Registro salvo com sucesso!');
                if (!error) {
                    form.reset();
                    await this.show(); // Recarrega a tela para mostrar o novo item na tabela
                }
            } catch (err) { handleOperation(err); } 
            finally { hideLoading(); }
        };

        // Associa o formulário correto baseado no módulo atual
        const formIds = {
            'abastecimento': { id: 'form-abastecimento', tabela: 'frota_abastecimentos' },
            'pneus': { id: 'form-pneus', tabela: 'frota_pneus' },
            'manutencao': { id: 'form-manutencao', tabela: 'frota_manutencoes' },
            'telemetria': { id: 'form-telemetria', tabela: 'frota_telemetria' }
        };

        const config = formIds[this.modulo];
        if (config) {
            const formElement = document.getElementById(config.id);
            if (formElement) {
                formElement.addEventListener('submit', (e) => handleFormSubmit(e, config.tabela));
            }
        }
    }
}