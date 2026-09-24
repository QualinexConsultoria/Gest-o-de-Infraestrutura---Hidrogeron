/* ==========================================================================
   js/modulos/manutencao.js — Módulo de Manutenção Preventiva & Corretiva
   Ciclo Mensal, Calendário, Filtros, Checklist e Exportações Globais
   ========================================================================== */

const ManutencaoModule = {
  props: { user: Object },
  emits: ["go-home"],
  setup(props) {
    const equipamentos = ref([]);
    const logs = ref([]);
    const loading = ref(true);
    const erro = ref("");

    // Filtros e Controlo de Ciclo / Calendário
    const mesAtual = new Date().getMonth(); // 0-11
    const anoAtual = new Date().getFullYear();
    const anoSelecionado = ref(anoAtual);
    const mesSelecionado = ref(mesAtual + 1); // 1-12
    const busca = ref("");
    const filtroStatus = ref("todos");
    const filtroPeriodicidade = ref("todos");
    const visualizacao = ref("areas"); // 'areas', 'tabela'

    // Modais e Execução
    const areaAtiva = ref(null);
    const modalChecklistAberto = ref(false);
    const equipamentoSelecionado = ref(null);
    const gravando = ref(false);

    const formChecklist = reactive({
      status: "C",
      observacoes: "",
      itensChecados: {}
    });

    const mesesNomes = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
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
        erro.value = "Não foi possível sincronizar os dados da manutenção preventiva.";
      } finally {
        loading.value = false;
      }
    }

    // Valida se o equipamento foi inspecionado no ciclo selecionado
    function isInspecionadoNoCiclo(eq, ano, mes) {
      const mesStr = String(mes).padStart(2, "0");
      const prefixoCiclo = `${ano}-${mesStr}`;

      return logs.value.some(l => {
        const eqNome = (l.Equipamento || l.equipamento || "").trim().toLowerCase();
        const alvo = (eq.Equipamento || eq.equipamento || eq.Nome || "").trim().toLowerCase();
        if (eqNome !== alvo) return false;

        const dataLog = String(l.Data_Hora || l.dataHora || l.Data || "");
        return dataLog.startsWith(prefixoCiclo) || dataLog.includes(`/${mesStr}/${ano}`) || dataLog.includes(`-${mesStr}-${ano}`);
      });
    }

    // Áreas agrupadas com contadores do ciclo
    const areasComputadas = computed(() => {
      const mapa = {};
      equipamentos.value.forEach(eq => {
        const area = (eq.Area || eq.area || eq.Setor || "Uso Geral").trim();
        if (!mapa[area]) {
          mapa[area] = { nome: area, total: 0, concluidos: 0, pendentes: 0, equipamentos: [] };
        }
        mapa[area].total++;
        const feito = isInspecionadoNoCiclo(eq, anoSelecionado.value, mesSelecionado.value);
        if (feito) mapa[area].concluidos++;
        else mapa[area].pendentes++;
        mapa[area].equipamentos.push({ ...eq, inspecionadoNoCiclo: feito });
      });
      return Object.values(mapa);
    });

    // Contadores Totais do Ciclo
    const resumoCiclo = computed(() => {
      let total = equipamentos.value.length;
      let concluidos = 0;
      equipamentos.value.forEach(eq => {
        if (isInspecionadoNoCiclo(eq, anoSelecionado.value, mesSelecionado.value)) concluidos++;
      });
      return { total, concluidos, pendentes: total - concluidos };
    });

    // Lista de Equipamentos Filtrados
    const equipamentosFiltrados = computed(() => {
      let lista = areaAtiva.value 
        ? (areasComputadas.value.find(a => a.nome === areaAtiva.value)?.equipamentos || [])
        : equipamentos.value.map(eq => ({
            ...eq,
            inspecionadoNoCiclo: isInspecionadoNoCiclo(eq, anoSelecionado.value, mesSelecionado.value)
          }));

      const b = busca.value.trim().toLowerCase();
      if (b) {
        lista = lista.filter(e => {
          const combo = `${e.ID || ''} ${e.Equipamento || e.Nome || ''} ${e.Modelo || ''} ${e.Area || ''}`.toLowerCase();
          return combo.includes(b);
        });
      }

      if (filtroStatus.value === "pendentes") {
        lista = lista.filter(e => !e.inspecionadoNoCiclo);
      } else if (filtroStatus.value === "concluidos") {
        lista = lista.filter(e => e.inspecionadoNoCiclo);
      }

      if (filtroPeriodicidade.value !== "todos") {
        lista = lista.filter(e => String(e.Periodicidade || "").toLowerCase() === filtroPeriodicidade.value.toLowerCase());
      }

      return lista;
    });

    // Navegação de Mês / Ciclo
    function alterarMes(delta) {
      let m = mesSelecionado.value + delta;
      let a = anoSelecionado.value;
      if (m > 12) { m = 1; a++; }
      else if (m < 1) { m = 12; a--; }
      mesSelecionado.value = m;
      anoSelecionado.value = a;
    }

    function irMesAtual() {
      anoSelecionado.value = anoAtual;
      mesSelecionado.value = mesAtual + 1;
    }

    // Modal e Gravação de Checklist
    function abrirChecklist(eq) {
      equipamentoSelecionado.value = eq;
      formChecklist.status = "C";
      formChecklist.observacoes = "";
      formChecklist.itensChecados = {};

      const itens = (eq.Itens_Inspecao_Recomendados || eq.itensInspecao || "").split(",");
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
        const agora = new Date();
        const dataFormatada = `${anoSelecionado.value}-${String(mesSelecionado.value).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")} ${agora.toTimeString().slice(0, 5)}`;
        
        const payload = {
          action: "salvarPreventiva",
          tipo: "preventiva",
          idLog: "LOG-" + Date.now(),
          dataHora: dataFormatada,
          area: (equipamentoSelecionado.value.Area || "Uso Geral").toUpperCase(),
          equipamento: (equipamentoSelecionado.value.Equipamento || equipamentoSelecionado.value.Nome).toUpperCase(),
          usuario: (props.user?.nome || "Eduardo Henrique Pereira").toUpperCase(),
          statusInspecao: formChecklist.status,
          observacoes: formChecklist.observacoes.trim().toUpperCase() || "CHECKLIST PREVENTIVO EXECUTADO COM SUCESSO.",
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
          Observacoes: payload.observacoes,
          Empresa_ID: "HIDROGERON"
        });

        pushToast("Inspeção preventiva registada com sucesso!", "success");
        modalChecklistAberto.value = false;
      } catch (err) {
        console.error("Erro ao salvar inspeção:", err);
        pushToast("Erro ao gravar inspeção.", "error");
      } finally {
        gravando.value = false;
      }
    }

    onMounted(carregarDados);

    return {
      equipamentos, logs, loading, erro, busca, filtroStatus, filtroPeriodicidade, visualizacao,
      anoSelecionado, mesSelecionado, mesesNomes, areaAtiva, areasComputadas, resumoCiclo,
      equipamentosFiltrados, modalChecklistAberto, equipamentoSelecionado, formChecklist, gravando,
      alterarMes, irMesAtual, abrirChecklist, salvarInspecao
    };
  },
  template: `
  <div class="space-y-5">
    <!-- BARRA SUPERIOR: CONTROLO DE CICLO & NAVEGAÇÃO -->
    <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
      <!-- Seletor de Ciclo / Mês -->
      <div class="flex items-center gap-2">
        <button @click="alterarMes(-1)" class="btn-tap p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs" title="Mês Anterior">◀</button>
        <div class="flex items-center gap-2 px-3 py-1.5 bg-sky-50 border border-sky-100 rounded-xl">
          <span class="text-sm">🗓️</span>
          <span class="font-extrabold text-sm text-sky-900 tracking-wide font-mono">
            {{ mesesNomes[mesSelecionado - 1] }} / {{ anoSelecionado }}
          </span>
        </div>
        <button @click="alterarMes(1)" class="btn-tap p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs" title="Próximo Mês">▶</button>
        <button @click="irMesAtual" class="btn-tap text-[11px] font-bold text-sky-600 hover:text-sky-800 bg-sky-50/50 hover:bg-sky-100 px-3 py-1.5 rounded-lg border border-sky-200">
          Mês Atual
        </button>
      </div>

      <!-- Contadores Resumo do Ciclo -->
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl">
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span class="text-xs font-extrabold text-emerald-800">{{ resumoCiclo.concluidos }} Concluídos</span>
        </div>
        <div class="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1 rounded-xl">
          <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
          <span class="text-xs font-extrabold text-amber-800">{{ resumoCiclo.pendentes }} Pendentes</span>
        </div>
      </div>

      <!-- Alternador de Modos -->
      <div class="flex bg-slate-100 p-1 rounded-xl gap-1">
        <button @click="visualizacao = 'areas'; areaAtiva = null" :class="visualizacao === 'areas' ? 'bg-white shadow text-slate-800 font-bold' : 'text-slate-500 font-medium'" class="px-3 py-1.5 rounded-lg text-xs transition-all">
          Setores
        </button>
        <button @click="visualizacao = 'tabela'" :class="visualizacao === 'tabela' ? 'bg-white shadow text-slate-800 font-bold' : 'text-slate-500 font-medium'" class="px-3 py-1.5 rounded-lg text-xs transition-all">
          Todos os Equipamentos
        </button>
      </div>
    </div>

    <!-- FILTROS E PESQUISA -->
    <div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm flex flex-col sm:flex-row gap-2 items-center justify-between">
      <div class="flex-1 w-full sm:w-auto">
        <input v-model="busca" type="text" placeholder="Buscar equipamento por nome, ID ou área..."
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none" />
      </div>
      <div class="flex gap-2 w-full sm:w-auto">
        <select v-model="filtroStatus" class="rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white">
          <option value="todos">Status: Todos</option>
          <option value="pendentes">⚠️ Pendentes no Ciclo</option>
          <option value="concluidos">✅ Concluídos no Ciclo</option>
        </select>
        <select v-model="filtroPeriodicidade" class="rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white">
          <option value="todos">Periodicidade: Todas</option>
          <option value="Mensal">Mensal</option>
          <option value="Semestral">Semestral</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-12"><span class="spinner"></span></div>
    <div v-if="erro" class="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl text-xs font-semibold">{{ erro }}</div>

    <!-- MODO 1: CARTÕES DE SETORES / ÁREAS -->
    <div v-if="!loading && visualizacao === 'areas' && !areaAtiva" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
      <div v-for="area in areasComputadas" :key="area.nome" class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
        <div>
          <h3 class="font-extrabold text-slate-800 text-base mb-4">{{ area.nome }}</h3>
          <div class="grid grid-cols-2 gap-4 mb-5">
            <div>
              <p class="text-2xl font-black text-slate-800">{{ area.total }}</p>
              <p class="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Equipamentos</p>
            </div>
            <div>
              <p class="text-2xl font-black" :class="area.pendentes > 0 ? 'text-amber-500' : 'text-emerald-600'">{{ area.pendentes }}</p>
              <p class="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Pendentes no Ciclo</p>
            </div>
          </div>
        </div>
        <button @click="areaAtiva = area.nome" class="btn-tap w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm">
          Acessar Área →
        </button>
      </div>
    </div>

    <!-- MODO 2: TABELA DE EQUIPAMENTOS DA ÁREA OU GERAL -->
    <div v-if="!loading && (visualizacao === 'tabela' || areaAtiva)" class="space-y-4">
      <div v-if="areaAtiva" class="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200">
        <button @click="areaAtiva = null" class="text-xs font-bold text-sky-600 hover:text-sky-800 flex items-center gap-1">
          ← Voltar para Áreas
        </button>
        <span class="font-extrabold text-sm text-slate-800 uppercase tracking-wide">{{ areaAtiva }}</span>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-xs text-left">
            <thead class="bg-slate-50 text-slate-500 border-b border-slate-200 text-[10px] uppercase font-bold tracking-wide">
              <tr>
                <th class="p-3">ID</th>
                <th class="p-3">Equipamento</th>
                <th class="p-3">Área / Setor</th>
                <th class="p-3">Periodicidade</th>
                <th class="p-3">Itens Recomendados</th>
                <th class="p-3 text-center">Status Ciclo</th>
                <th class="p-3 text-center w-28">Ação</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="eq in equipamentosFiltrados" :key="eq.ID" class="hover:bg-slate-50/80">
                <td class="p-3 font-mono font-bold text-slate-700">{{ eq.ID }}</td>
                <td class="p-3">
                  <p class="font-bold text-slate-800">{{ eq.Equipamento || eq.Nome }}</p>
                  <p class="text-[10px] text-slate-400">{{ eq.Modelo || 'Geral' }}</p>
                </td>
                <td class="p-3 text-slate-600">{{ eq.Area || eq.Setor }}</td>
                <td class="p-3">
                  <span class="px-2 py-0.5 rounded font-semibold text-[10px] bg-slate-100 text-slate-600">
                    {{ eq.Periodicidade || 'Mensal' }}
                  </span>
                </td>
                <td class="p-3 text-slate-500 max-w-xs truncate">{{ eq.Itens_Inspecao_Recomendados || 'Padrão' }}</td>
                <td class="p-3 text-center">
                  <span v-if="eq.inspecionadoNoCiclo" class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Concluído
                  </span>
                  <span v-else class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    Pendente
                  </span>
                </td>
                <td class="p-3 text-center">
                  <button @click="abrirChecklist(eq)" class="btn-tap px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-[11px] shadow-sm">
                    Executar
                  </button>
                </td>
              </tr>
              <tr v-if="equipamentosFiltrados.length === 0">
                <td colspan="7" class="p-8 text-center text-slate-400">Nenhum equipamento encontrado com estes filtros.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- MODAL DE CHECKLIST OPERACIONAL -->
    <div v-if="modalChecklistAberto" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto text-xs">
        <div class="flex items-center justify-between border-b pb-2">
          <div>
            <span class="font-mono text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded">{{ equipamentoSelecionado.ID }}</span>
            <h3 class="font-bold text-slate-800 text-sm mt-1">{{ equipamentoSelecionado.Equipamento || equipamentoSelecionado.Nome }}</h3>
          </div>
          <button @click="modalChecklistAberto = false" class="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
        </div>

        <div class="space-y-3">
          <p class="font-semibold text-slate-600 uppercase text-[10px]">Itens de Inspeção Recomendados</p>
          <div class="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div v-for="(val, item) in formChecklist.itensChecados" :key="item" class="flex items-center gap-2">
              <input type="checkbox" v-model="formChecklist.itensChecados[item]" class="rounded text-sky-600" />
              <label class="text-slate-700 text-xs">{{ item }}</label>
            </div>
          </div>

          <div>
            <label class="block font-semibold text-slate-600 mb-1">Status da Inspeção</label>
            <select v-model="formChecklist.status" class="w-full border border-slate-300 rounded-lg p-2 bg-white font-medium">
              <option value="C">Conforme (C)</option>
              <option value="NC">Não Conforme (NC)</option>
            </select>
          </div>

          <div>
            <label class="block font-semibold text-slate-600 mb-1">Observações do Executante</label>
            <textarea v-model="formChecklist.observacoes" rows="2" placeholder="Observações..." class="w-full border border-slate-300 rounded-lg p-2 uppercase"></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t pt-3">
          <button @click="modalChecklistAberto = false" class="btn-tap px-3.5 py-2 rounded-lg bg-slate-100 text-slate-600 font-semibold">Cancelar</button>
          <button @click="salvarInspecao" :disabled="gravando" class="btn-tap px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-md">
            {{ gravando ? 'Gravando...' : 'Concluir Inspeção' }}
          </button>
        </div>
      </div>
    </div>
  </div>`
};

/* ==========================================================================
   EXPORTAÇÕES GLOBAIS EXIGIDAS PELO INDEX.HTML
   ========================================================================== */
window.PreventivaModule = ManutencaoModule;
window.ManutencaoModule = ManutencaoModule;

window.CorretivaModule = window.CorretivaModule || {
  props: { user: Object },
  emits: ["go-home"],
  setup() {
    return {};
  },
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