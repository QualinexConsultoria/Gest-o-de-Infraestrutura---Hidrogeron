/* ==========================================================================
   js/modulos/manutencao.js — Matriz Cronograma de Manutenção Preventiva
   Layout Industrial Oficial: Todos os 12 Meses (JAN a DEZ)
   Células Verdes (Feitas) e Vermelhas (Pendentes/Vencidas)
   ========================================================================== */

const ManutencaoModule = {
  props: { user: Object },
  emits: ["go-home"],
  setup(props) {
    const equipamentos = ref([]);
    const logs = ref([]);
    const loading = ref(true);
    const erro = ref("");

    // Ano selecionado do Cronograma
    const anoAtual = new Date().getFullYear();
    const mesAtualIndex = new Date().getMonth(); // 0 a 11
    const anoSelecionado = ref(anoAtual);

    // Filtros
    const busca = ref("");
    const filtroSetor = ref("todos");
    const filtroPeriodicidade = ref("todos");
    const filtroStatus = ref("todos"); // 'todos', 'pendentes', 'concluidos'

    // Modal de Checklist
    const modalChecklistAberto = ref(false);
    const equipamentoSelecionado = ref(null);
    const mesAlvoInspecao = ref(mesAtualIndex + 1);
    const gravando = ref(false);

    const formChecklist = reactive({
      status: "C",
      observacoes: "",
      itensChecados: {}
    });

    const meses = [
      { num: 1, sigla: "JAN" },
      { num: 2, sigla: "FEV" },
      { num: 3, sigla: "MAR" },
      { num: 4, sigla: "ABR" },
      { num: 5, sigla: "MAI" },
      { num: 6, sigla: "JUN" },
      { num: 7, sigla: "JUL" },
      { num: 8, sigla: "AGO" },
      { num: 9, sigla: "SET" },
      { num: 10, sigla: "OUT" },
      { num: 11, sigla: "NOV" },
      { num: 12, sigla: "DEZ" }
    ];

    async function carregarDados(force = false) {
      loading.value = true;
      erro.value = "";
      try {
        const raw = await getInitialData(force);
        const base = (raw && raw.data) ? raw.data : raw;
        equipamentos.value = base.equipamentos || base.Equipamentos || [];
        logs.value = base.preventivas || base.Preventivas || [];
      } catch (e) {
        console.error("Erro ao carregar preventiva:", e);
        erro.value = "Não foi possível carregar o cronograma de manutenção preventiva.";
      } finally {
        loading.value = false;
      }
    }

    // Setores únicos disponíveis para o filtro
    const setoresDisponiveis = computed(() => {
      const s = new Set();
      equipamentos.value.forEach(eq => {
        const area = eq.Area || eq.area || eq.Setor;
        if (area) s.add(String(area).trim());
      });
      return Array.from(s).sort();
    });

    // Regra se o mês é aplicável para a periodicidade do equipamento
    function isMesPlanejado(periodicidade, mesNum) {
      const p = String(periodicidade || "MENSAL").toUpperCase().trim();
      if (p === "MENSAL") return true;
      if (p === "BIMESTRAL") return mesNum % 2 === 0;
      if (p === "TRIMESTRAL") return mesNum % 3 === 0;
      if (p === "SEMESTRAL") return mesNum === 6 || mesNum === 12;
      if (p === "ANUAL") return mesNum === 12;
      return true;
    }

    // Verifica status de um mês específico
    function getStatusMes(eq, mesNum) {
      const p = eq.Periodicidade || eq.periodicidade || "Mensal";
      const planejado = isMesPlanejado(p, mesNum);
      if (!planejado) {
        return { tipo: "nao_aplicavel", label: "—", classe: "bg-slate-50 text-slate-300 border-dashed" };
      }

      const mesStr = String(mesNum).padStart(2, "0");
      const prefixoAnoMes = `${anoSelecionado.value}-${mesStr}`;
      const nomeEquip = (eq.Equipamento || eq.equipamento || eq.Nome || "").trim().toLowerCase();

      const logEncontrado = logs.value.find(l => {
        const logEq = (l.Equipamento || l.equipamento || "").trim().toLowerCase();
        if (logEq !== nomeEquip) return false;
        const d = String(l.Data_Hora || l.dataHora || l.Data || "");
        return d.startsWith(prefixoAnoMes) || d.includes(`/${mesStr}/${anoSelecionado.value}`);
      });

      if (logEncontrado) {
        return {
          tipo: "concluido",
          label: "✓",
          title: `Realizado em ${logEncontrado.Data_Hora || logEncontrado.Data} por ${logEncontrado.Usuario || 'Técnico'}`,
          classe: "bg-emerald-500 text-white font-bold hover:bg-emerald-600 shadow-sm"
        };
      }

      // Se não foi feito: verifica se o mês já passou ou é o mês vigente
      const mesPassadoOuAtual = (anoSelecionado.value < anoAtual) || (anoSelecionado.value === anoAtual && (mesNum - 1) <= mesAtualIndex);

      if (mesPassadoOuAtual) {
        return {
          tipo: "pendente",
          label: "!",
          title: "Manutenção planejada PENDENTE / NÃO REALIZADA",
          classe: "bg-rose-500 text-white font-black hover:bg-rose-600 shadow-sm animate-pulse"
        };
      }

      // Mês futuro ainda por realizar
      return {
        tipo: "futuro",
        label: "P",
        title: "Planejado futuro",
        classe: "bg-slate-100 text-slate-400 font-semibold border border-slate-200 hover:bg-slate-200"
      };
    }

    // Processa a matriz completa de equipamentos com os 12 meses
    const matrizEquipamentos = computed(() => {
      return equipamentos.value.map(eq => {
        const mesesStatus = meses.map(m => ({
          ...m,
          status: getStatusMes(eq, m.num)
        }));

        const pendentesCount = mesesStatus.filter(m => m.status.tipo === "pendente").length;
        const concluidosCount = mesesStatus.filter(m => m.status.tipo === "concluido").length;

        return {
          ...eq,
          mesesStatus,
          pendentesCount,
          concluidosCount
        };
      });
    });

    // Filtros aplicados à matriz
    const equipamentosFiltrados = computed(() => {
      let lista = matrizEquipamentos.value;

      const b = busca.value.trim().toLowerCase();
      if (b) {
        lista = lista.filter(e => {
          const combo = `${e.ID || ''} ${e.Equipamento || e.Nome || ''} ${e.Modelo || ''} ${e.Area || ''}`.toLowerCase();
          return combo.includes(b);
        });
      }

      if (filtroSetor.value !== "todos") {
        lista = lista.filter(e => String(e.Area || e.area || e.Setor).trim() === filtroSetor.value);
      }

      if (filtroPeriodicidade.value !== "todos") {
        lista = lista.filter(e => String(e.Periodicidade || "Mensal").toLowerCase() === filtroPeriodicidade.value.toLowerCase());
      }

      if (filtroStatus.value === "pendentes") {
        lista = lista.filter(e => e.pendentesCount > 0);
      } else if (filtroStatus.value === "concluidos") {
        lista = lista.filter(e => e.pendentesCount === 0 && e.concluidosCount > 0);
      }

      return lista;
    });

    // Contadores Totais do Ano
    const totaisGerais = computed(() => {
      let totalPendentes = 0;
      let totalConcluidos = 0;
      matrizEquipamentos.value.forEach(e => {
        totalPendentes += e.pendentesCount;
        totalConcluidos += e.concluidosCount;
      });
      return { totalPendentes, totalConcluidos, maquinas: equipamentos.value.length };
    });

    // Modal de Checklist
    function abrirInspecao(eq, mesNum) {
      equipamentoSelecionado.value = eq;
      mesAlvoInspecao.value = mesNum || (mesAtualIndex + 1);
      formChecklist.status = "C";
      formChecklist.observacoes = "";
      formChecklist.itensChecados = {};

      const itens = (eq.Itens_Inspecao_Recomendados || eq.itensInspecao || "Parte elétrica,Lubrificação,Estrutura mecânica,Limpeza geral").split(",");
      itens.forEach(it => {
        const itemLimpo = it.trim();
        if (itemLimpo) formChecklist.itensChecados[itemLimpo] = true;
      });

      modalChecklistAberto.value = true;
    }

    async function salvarInspecao() {
      if (!equipamentoSelecionado.value) return;
      gravando.value = true;
      try {
        const mesStr = String(mesAlvoInspecao.value).padStart(2, "0");
        const diaStr = String(new Date().getDate()).padStart(2, "0");
        const dataFormatada = `${anoSelecionado.value}-${mesStr}-${diaStr} 08:00`;

        const payload = {
          action: "salvarPreventiva",
          tipo: "preventiva",
          idLog: "LOG-" + Date.now(),
          dataHora: dataFormatada,
          area: String(equipamentoSelecionado.value.Area || "Uso Geral").toUpperCase(),
          equipamento: String(equipamentoSelecionado.value.Equipamento || equipamentoSelecionado.value.Nome).toUpperCase(),
          usuario: String(props.user?.nome || "Eduardo Henrique Pereira").toUpperCase(),
          statusInspecao: formChecklist.status,
          observacoes: formChecklist.observacoes.trim().toUpperCase() || "CHECKLIST PREVENTIVO EXECUTADO",
          empresaId: "HIDROGERON"
        };

        await postToAppsScript(payload);

        logs.value.unshift({
          ID_Log: payload.idLog,
          Data_Hora: payload.dataHora,
          Area: payload.area,
          Equipamento: payload.equipamento,
          Usuario: payload.usuario,
          Status: payload.statusInspecao,
          Observacoes: payload.observacoes
        });

        pushToast(`Preventiva de ${meses[mesAlvoInspecao.value - 1].sigla}/${anoSelecionado.value} registrada com sucesso!`, "success");
        modalChecklistAberto.value = false;
      } catch (err) {
        console.error("Erro ao salvar:", err);
        pushToast("Erro ao gravar inspeção.", "error");
      } finally {
        gravando.value = false;
      }
    }

    onMounted(carregarDados);

    return {
      equipamentos, logs, loading, erro, busca, filtroSetor, filtroPeriodicidade, filtroStatus,
      setoresDisponiveis, matrizEquipamentos, equipamentosFiltrados, totaisGerais,
      anoSelecionado, meses, mesAtualIndex, modalChecklistAberto, equipamentoSelecionado,
      mesAlvoInspecao, formChecklist, gravando, abrirInspecao, salvarInspecao
    };
  },
  template: `
  <div class="space-y-4">
    <!-- BARRA SUPERIOR DE CONTROLO DO CRONOGRAMA ANUAL -->
    <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
      <!-- Seletor do Ano -->
      <div class="flex items-center gap-3">
        <button @click="anoSelecionado--" class="btn-tap p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs">◀</button>
        <div class="flex items-center gap-2 px-4 py-2 bg-sky-50 border border-sky-200 rounded-xl">
          <span class="text-base">📅</span>
          <span class="font-extrabold text-base text-sky-950 tracking-wider font-mono">CRONOGRAMA ANUAL {{ anoSelecionado }}</span>
        </div>
        <button @click="anoSelecionado++" class="btn-tap p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs">▶</button>
      </div>

      <!-- Resumo Cromático de Indicadores -->
      <div class="flex flex-wrap items-center gap-2.5">
        <div class="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
          <span class="w-3 h-3 rounded bg-emerald-500 flex items-center justify-center text-[9px] text-white font-bold">✓</span>
          <span class="text-xs font-bold text-emerald-800">{{ totaisGerais.totalConcluidos }} Realizadas</span>
        </div>
        <div class="flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl">
          <span class="w-3 h-3 rounded bg-rose-500 flex items-center justify-center text-[9px] text-white font-bold">!</span>
          <span class="text-xs font-bold text-rose-800">{{ totaisGerais.totalPendentes }} Pendentes</span>
        </div>
        <div class="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
          <span class="text-xs font-bold text-slate-700">{{ totaisGerais.maquinas }} Máquinas</span>
        </div>
      </div>
    </div>

    <!-- FILTROS E BUSCA INDUSTRIAL -->
    <div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm flex flex-col sm:flex-row gap-2 items-center justify-between">
      <div class="flex-1 w-full sm:w-auto">
        <input v-model="busca" type="text" placeholder="Buscar por máquina, ID, setor ou modelo..."
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none" />
      </div>
      <div class="flex flex-wrap gap-2 w-full sm:w-auto">
        <select v-model="filtroSetor" class="rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white">
          <option value="todos">Todos os Setores</option>
          <option v-for="s in setoresDisponiveis" :key="s" :value="s">{{ s }}</option>
        </select>
        <select v-model="filtroPeriodicidade" class="rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white">
          <option value="todos">Todas Periodicidades</option>
          <option value="Mensal">Mensal</option>
          <option value="Semestral">Semestral</option>
        </select>
        <select v-model="filtroStatus" class="rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white">
          <option value="todos">Todos os Status</option>
          <option value="pendentes">⚠️ Com Pendências (Vermelho)</option>
          <option value="concluidos">✅ Em Dia (Verde)</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-12"><span class="spinner"></span></div>
    <div v-if="erro" class="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl text-xs font-semibold">{{ erro }}</div>

    <!-- MATRIZ OFICIAL: EQUIPAMENTOS X 12 MESES (JAN a DEZ) -->
    <div v-if="!loading" class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-xs text-left border-collapse">
          <thead class="bg-slate-50 text-slate-600 border-b border-slate-200 text-[10px] uppercase font-extrabold tracking-wider">
            <tr>
              <th class="p-3 w-16">ID</th>
              <th class="p-3 min-w-[200px]">Equipamento / Máquina</th>
              <th class="p-3 min-w-[120px]">Setor</th>
              <th class="p-3 text-center">Freq.</th>
              <!-- Cabeçalho dos 12 Meses -->
              <th v-for="m in meses" :key="m.num" class="p-2 text-center w-12" :class="m.num === (mesAtualIndex + 1) ? 'bg-sky-100 text-sky-900 border-x border-sky-200' : ''">
                {{ m.sigla }}
              </th>
              <th class="p-3 text-center w-24">Ação</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="eq in equipamentosFiltrados" :key="eq.ID" class="hover:bg-slate-50/80 transition-colors">
              <td class="p-3 font-mono font-bold text-slate-700">{{ eq.ID }}</td>
              <td class="p-3">
                <p class="font-extrabold text-slate-800 text-xs">{{ eq.Equipamento || eq.Nome }}</p>
                <p class="text-[10px] text-slate-400 mt-0.5">{{ eq.Modelo || 'Industrial' }}</p>
              </td>
              <td class="p-3 text-slate-600 font-semibold">{{ eq.Area || eq.Setor }}</td>
              <td class="p-3 text-center">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase">
                  {{ (eq.Periodicidade || 'Mensal').slice(0, 4) }}
                </span>
              </td>

              <!-- Células dos 12 Meses Cromáticas -->
              <td v-for="m in eq.mesesStatus" :key="m.num" class="p-1 text-center" :class="m.num === (mesAtualIndex + 1) ? 'bg-sky-50/50 border-x border-sky-100' : ''">
                <button @click="m.status.tipo !== 'nao_aplicavel' ? abrirInspecao(eq, m.num) : null"
                  :disabled="m.status.tipo === 'nao_aplicavel'"
                  :title="m.status.title"
                  class="w-7 h-7 mx-auto rounded-lg text-[10px] flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
                  :class="m.status.classe">
                  {{ m.status.label }}
                </button>
              </td>

              <td class="p-3 text-center">
                <button @click="abrirInspecao(eq, mesAtualIndex + 1)" class="btn-tap px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-[10px] shadow-sm">
                  Checklist
                </button>
              </td>
            </tr>
            <tr v-if="equipamentosFiltrados.length === 0">
              <td colspan="17" class="p-8 text-center text-slate-400 font-medium">Nenhum equipamento encontrado para os filtros selecionados.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- MODAL CHECKLIST PREVENTIVO -->
    <div v-if="modalChecklistAberto" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="modalChecklistAberto = false">
      <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto text-xs">
        <div class="flex items-center justify-between border-b pb-2">
          <div>
            <div class="flex items-center gap-1.5">
              <span class="font-mono text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded">{{ equipamentoSelecionado.ID }}</span>
              <span class="font-bold text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded uppercase">Mês Ref: {{ meses[mesAlvoInspecao - 1].sigla }}/{{ anoSelecionado }}</span>
            </div>
            <h3 class="font-extrabold text-slate-800 text-sm mt-1.5">{{ equipamentoSelecionado.Equipamento || equipamentoSelecionado.Nome }}</h3>
          </div>
          <button @click="modalChecklistAberto = false" class="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
        </div>

        <div class="space-y-3">
          <p class="font-bold text-slate-700 uppercase text-[10px]">Itens de Inspeção e Manutenção</p>
          <div class="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div v-for="(val, item) in formChecklist.itensChecados" :key="item" class="flex items-center gap-2">
              <input type="checkbox" v-model="formChecklist.itensChecados[item]" class="rounded text-sky-600 w-4 h-4" />
              <label class="text-slate-700 text-xs font-medium">{{ item }}</label>
            </div>
          </div>

          <div>
            <label class="block font-semibold text-slate-600 mb-1">Status da Inspeção</label>
            <select v-model="formChecklist.status" class="w-full border border-slate-300 rounded-lg p-2 bg-white font-bold">
              <option value="C">Conforme (C) - Aprovado</option>
              <option value="NC">Não Conforme (NC) - Requer Ação</option>
            </select>
          </div>

          <div>
            <label class="block font-semibold text-slate-600 mb-1">Observações do Técnico / Executante</label>
            <textarea v-model="formChecklist.observacoes" rows="2" placeholder="Descreva as ações realizadas..." class="w-full border border-slate-300 rounded-lg p-2 uppercase"></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t pt-3">
          <button @click="modalChecklistAberto = false" class="btn-tap px-3.5 py-2 rounded-lg bg-slate-100 text-slate-600 font-semibold">Cancelar</button>
          <button @click="salvarInspecao" :disabled="gravando" class="btn-tap px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md">
            {{ gravando ? 'Gravando...' : 'Gravar Preventiva' }}
          </button>
        </div>
      </div>
    </div>
  </div>`
};

// Exportações Globais
window.PreventivaModule = ManutencaoModule;
window.ManutencaoModule = ManutencaoModule;

window.CorretivaModule = window.CorretivaModule || {
  props: { user: Object },
  emits: ["go-home"],
  setup() { return {}; },
  template: `
  <div class="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
    <div class="flex items-center justify-between border-b pb-3">
      <div>
        <h2 class="text-base font-extrabold text-slate-800">Manutenção Corretiva & Chamados</h2>
        <p class="text-xs text-slate-500 mt-0.5">Gestão de chamados emergenciais e ordens de serviço.</p>
      </div>
      <span class="text-xs bg-emerald-50 text-emerald-700 font-bold px-3 py-1 rounded-full border border-emerald-200">Operacional</span>
    </div>
    <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
      Módulo carregado e integrado com a base de dados central da Hidrogeron.
    </div>
  </div>`
};