// js/views/gestaoFrota.js
import { showToast, showLoading, hideLoading, handleOperation } from '../helpers.js';
import { insertItem, fetchAllData } from '../api.js'; // Usa a sua API existente
import { dataCache } from '../dataCache.js';

export class GestaoFrotaView {
    constructor(modulo) {
        this.modulo = modulo; 
        this.container = null;
        this.abastecimentos = [];
        this.caminhoes = [];
        this.motoristas = [];
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
        // Busca os caminhões e motoristas do cache para preencher os Selects
        const masterData = await dataCache.fetchMasterDataOnly();
        this.caminhoes = masterData.caminhoes || [];
        this.motoristas = masterData.terceiros ? masterData.terceiros.filter(t => t.descricao_atividade.toLowerCase().includes('motorista')) : [];
        
        // Se for o módulo de abastecimento, busca o histórico no Supabase
        if (this.modulo === 'abastecimento') {
            try {
                // Como você usa Supabase, vamos importar o cliente (assumindo que exporta de supabase.js)
                const { supabase } = await import('../supabase.js');
                const { data, error } = await supabase
                    .from('frota_abastecimentos')
                    .select('*, caminhoes(cod_equipamento, placa), terceiros(nome)')
                    .order('data_abastecimento', { ascending: false })
                    .limit(50);
                
                if (error) throw error;
                this.abastecimentos = data || [];
            } catch (err) {
                console.error("Erro ao buscar abastecimentos:", err);
            }
        }
    }

    async loadHTML() {
        const container = document.getElementById('views-container');
        
        // Se for o módulo de Abastecimento, carrega a tela real
        if (this.modulo === 'abastecimento') {
            container.innerHTML = this.getAbastecimentoHTML();
        } else {
            // Se for outro módulo, mostra o placeholder
            container.innerHTML = this.getPlaceholderHTML();
        }
        
        this.container = container;
    }

    // --- TELA REAL DE ABASTECIMENTO ---
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
            <div id="gestao-frota-view-${this.modulo}" class="view active-view">
                <div class="cadastro-container">
                    <div class="cadastro-header">
                        <h1><i class="ph-fill ph-gas-pump"></i> Controle de Abastecimento (Combustível e Arla)</h1>
                        <p>Registre os abastecimentos para o sistema calcular a média de km/L automaticamente.</p>
                    </div>

                    <div class="cadastro-content">
                        <div class="form-section-modern" style="margin-bottom: 20px;">
                            <h3>Registrar Novo Abastecimento</h3>
                            <form id="form-abastecimento" class="form-modern">
                                <div class="form-group">
                                    <label>Caminhão (Cavalo)</label>
                                    <select name="caminhao_id" class="form-select" required>
                                        <option value="">Selecione o Tritrem...</option>
                                        ${optionsCaminhoes}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Motorista</label>
                                    <select name="motorista_id" class="form-select" required>
                                        <option value="">Selecione o Motorista...</option>
                                        ${optionsMotoristas}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Odômetro Atual (KM)</label>
                                    <input type="number" name="odometro_horimetro" class="form-input" required placeholder="Ex: 152000">
                                </div>
                                <div class="form-group">
                                    <label>Litros de Diesel</label>
                                    <input type="number" step="0.01" name="litros_diesel" class="form-input" required placeholder="Ex: 400.50">
                                </div>
                                <div class="form-group">
                                    <label>Litros de Arla 32</label>
                                    <input type="number" step="0.01" name="litros_arla" class="form-input" placeholder="Ex: 40.00">
                                </div>
                                <div class="form-group">
                                    <label>Valor Total (R$)</label>
                                    <input type="number" step="0.01" name="valor_total" class="form-input" placeholder="Ex: 2500.00">
                                </div>
                                <button type="submit" class="form-submit"><i class="ph-fill ph-floppy-disk"></i> Salvar Abastecimento</button>
                            </form>
                        </div>

                        <div class="list-container-modern">
                            <h2>Últimos Abastecimentos</h2>
                            <div class="table-wrapper">
                                <table class="data-table-modern">
                                    <thead>
                                        <tr>
                                            <th>Data</th>
                                            <th>Caminhão</th>
                                            <th>Motorista</th>
                                            <th>Odômetro</th>
                                            <th>Diesel</th>
                                            <th>Arla</th>
                                            <th>Média km/L</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${trsHistorico || '<tr><td colspan="7" style="text-align: center;">Nenhum abastecimento registrado ainda.</td></tr>'}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // --- PLACEHOLDER PARA OS OUTROS MÓDULOS ---
    getPlaceholderHTML() {
        const configs = {
            'dashboard': { titulo: 'Dashboard da Frota', icone: 'ph-chart-pie-slice' },
            'pneus': { titulo: 'Gestão de Pneus', icone: 'ph-circles-four' },
            'manutencao': { titulo: 'Manutenção (Ordens de Serviço)', icone: 'ph-wrench' },
            'telemetria': { titulo: 'Telemetria e Condução', icone: 'ph-steering-wheel' },
            'motoristas': { titulo: 'Gestão de Motoristas', icone: 'ph-identification-card' }
        };
        const config = configs[this.modulo];

        return `
            <div id="gestao-frota-view-${this.modulo}" class="view active-view">
                <div class="cadastro-container">
                    <div class="cadastro-header">
                        <h1><i class="ph-fill ${config.icone}"></i> ${config.titulo}</h1>
                    </div>
                    <div class="cadastro-content" style="min-height: 60vh; background: white; border-radius: 12px; padding: 20px; display: flex; align-items: center; justify-content: center;">
                        <div class="empty-state">
                            <i class="ph-fill ${config.icone}" style="font-size: 4rem; color: var(--primary-color);"></i>
                            <h2>Módulo em Desenvolvimento</h2>
                            <p>Esta tela será construída na próxima etapa!</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    addEventListeners() {
        if (this.modulo === 'abastecimento') {
            const form = document.getElementById('form-abastecimento');
            if (form) {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    showLoading();
                    
                    const formData = new FormData(form);
                    const data = Object.fromEntries(formData.entries());
                    
                    // Converte strings vazias para null e formata números
                    data.litros_arla = data.litros_arla ? parseFloat(data.litros_arla) : 0;
                    data.valor_total = data.valor_total ? parseFloat(data.valor_total) : null;
                    data.litros_diesel = parseFloat(data.litros_diesel);
                    data.odometro_horimetro = parseInt(data.odometro_horimetro);

                    // Lógica para calcular a Média (Km/L)
                    // Pega o último abastecimento deste caminhão para ver o odômetro anterior
                    const ultimoAbast = this.abastecimentos.find(a => a.caminhao_id === data.caminhao_id);
                    if (ultimoAbast && ultimoAbast.odometro_horimetro < data.odometro_horimetro) {
                        const kmRodados = data.odometro_horimetro - ultimoAbast.odometro_horimetro;
                        data.media_kml = (kmRodados / data.litros_diesel).toFixed(2);
                    }

                    try {
                        const { error } = await insertItem('frota_abastecimentos', data);
                        handleOperation(error, 'Abastecimento registrado com sucesso!');
                        if (!error) {
                            form.reset();
                            await this.show(); // Recarrega a tela para mostrar na tabela
                        }
                    } catch (err) {
                        handleOperation(err);
                    } finally {
                        hideLoading();
                    }
                });
            }
        }
    }
}