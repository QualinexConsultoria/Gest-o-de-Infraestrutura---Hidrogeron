/* ==========================================================================
   js/modulos/calibracao.js — Módulo de Calibração & Medição (RSG-6303-01)
   Gestão de Instrumentos, Calibrações Periódicas, Prazos e Status
   ========================================================================== */

// Helper global para cálculo de vencimento (180 dias ou periodicidade)
window.calcularVencimentoChecagem = function(dataChecagem, periodicidade) {
  if (!dataChecagem) return "";
  var d = new Date(dataChecagem);
  if (isNaN(d.getTime())) return "";
  
  var p = String(periodicidade || "").trim().toLowerCase();
  var dias = 180; // default semestral
  if (p === "mensal") dias = 30;
  else if (p === "bimestral") dias = 60;
  else if (p === "trimestral") dias = 90;
  else if (p === "semestral") dias = 180;
  else if (p === "anual") dias = 365;

  var venc = new Date(d.getTime() + (dias * 24 * 60 * 60 * 1000));
  return venc.toISOString().slice(0, 10);
};

function normalizeCalibracao(c) {
  var dataUltima = c.Data_Ultima_Calibracao || c.dataUltimaCalibracao || c.Ultima_Calibracao || c.data || "";
  var periodicidade = c.Periodicidade || c.periodicidade || "Semestral";
  var dataVenc = c.Data_Proxima_Calibracao || c.dataProximaCalibracao || c.Vencimento || "";
  
  if (!dataVenc && dataUltima) {
    dataVenc = window.calcularVencimentoChecagem(dataUltima, periodicidade);
  }

  return {
    id: c.ID_Instrumento || c.id_instrumento || c.ID || c.id || uid(),
    tag: c.TAG || c.tag || c.Tag || "",
    instrumento: c.Instrumento || c.instrumento || c.Nome || c.nome || "Instrumento",
    modelo: c.Modelo || c.modelo || "",
    setor: c.Setor || c.setor || c.Area || c.area || "Uso Geral",
    periodicidade: periodicidade,
    dataUltimaCalibracao: dataUltima,
    dataProximaCalibracao: dataVenc,
    certificado: c.Numero_Certificado || c.numeroCertificado || c.Certificado || c.certificado || "",
    laboratorio: c.Laboratorio || c.laboratorio || c.Fornecedor || c.fornecedor || "",
    status: c.Status || c.status || "No Prazo",
    observacoes: c.Observacoes || c.observacoes || ""
  };
}

function calcularStatusInstrumento(dataVenc, statusAtual) {
  if (String(statusAtual || "").toLowerCase() === "em calibração" || String(statusAtual || "").toLowerCase() === "em calibracao") {
    return "Em Calibração";
  }
  if (!dataVenc) return "No Prazo";
  
  var dVenc = new Date(dataVenc);
  if (isNaN(dVenc.getTime())) return "No Prazo";
  
  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  dVenc.setHours(0, 0, 0, 0);
  
  var diffDias = Math.ceil((dVenc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDias < 0) return "Vencido";
  if (diffDias <= 45) return "Atenção (< 45d)";
  return "No Prazo";
}

const CalibracaoModule = {
  props: { user: Object },
  emits: ["go-home"],
  setup(props) {
    const instrumentos = ref([]);
    const loading = ref(true);
    const erro = ref("");
    const busca = ref("");
    const filtroSetor = ref("todos");
    const filtroStatus = ref("todos");
    const setoresDisponiveis = ref([]);

    // Modal de Cadastro/Edição
    const modalAberto = ref(false);
    const salvando = ref(false);
    const editando = ref(false);
    const form = reactive({
      id: "",
      tag: "",
      instrumento: "",
      modelo: "",
      setor: "Uso Geral",
      periodicidade: "Semestral",
      dataUltimaCalibracao: "",
      dataProximaCalibracao: "",
      certificado: "",
      laboratorio: "",
      status: "No Prazo",
      observacoes: ""
    });

    async function carregar() {
      loading.value = true;
      erro.value = "";
      try {
        const data = await getInitialData();
        const listaBruta = data.calibracoes || data.Calibracoes || data.calibracoes_controle || [];
        
        instrumentos.value = listaBruta.map(function(item) {
          const norm = normalizeCalibracao(item);
          norm.statusCalculado = calcularStatusInstrumento(norm.dataProximaCalibracao, norm.status);
          return norm;
        });

        // Atualiza setores para os filtros
        const sSet = new Set();
        instrumentos.value.forEach(i => { if (i.setor) sSet.add(i.setor); });
        if (data.setores) {
          data.setores.forEach(s => sSet.add(s.Nome || s.nome || s));
        }
        setoresDisponiveis.value = Array.from(sSet).filter(Boolean);

      } catch (e) {
        console.error("Erro ao carregar calibração:", e);
        erro.value = "Não foi possível carregar os registros de Calibração & Medição.";
      } finally {
        loading.value = false;
      }
    }

    // Contadores de Topo
    const contadores = computed(() => {
      let noPrazo = 0, atencao = 0, vencidos = 0, emCalibracao = 0;
      instrumentos.value.forEach(i => {
        const st = i.statusCalculado;
        if (st === "No Prazo") noPrazo++;
        else if (st === "Atenção (< 45d)") atencao++;
        else if (st === "Vencido") vencidos++;
        else if (st === "Em Calibração") emCalibracao++;
      });
      return { noPrazo, atencao, vencidos, emCalibracao };
    });

    // Lista Filtrada
    const instrumentosFiltrados = computed(() => {
      const b = busca.value.trim().toLowerCase();
      return instrumentos.value.filter(i => {
        if (filtroSetor.value !== "todos" && i.setor !== filtroSetor.value) return false;
        if (filtroStatus.value !== "todos" && i.statusCalculado !== filtroStatus.value) return false;
        if (b) {
          const combo = `${i.tag} ${i.instrumento} ${i.modelo} ${i.certificado}`.toLowerCase();
          if (!combo.includes(b)) return false;
        }
        return true;
      });
    });

    function abrirNovo() {
      editando.value = false;
      Object.assign(form, {
        id: "INST-" + Date.now(),
        tag: "",
        instrumento: "",
        modelo: "",
        setor: setoresDisponiveis.value[0] || "Uso Geral",
        periodicidade: "Semestral",
        dataUltimaCalibracao: new Date().toISOString().slice(0, 10),
        dataProximaCalibracao: "",
        certificado: "",
        laboratorio: "",
        status: "No Prazo",
        observacoes: ""
      });
      atualizarProximoVencimento();
      modalAberto.value = true;
    }

    function abrirEditar(item) {
      editando.value = true;
      Object.assign(form, {
        id: item.id,
        tag: item.tag,
        instrumento: item.instrumento,
        modelo: item.modelo,
        setor: item.setor,
        periodicidade: item.periodicidade,
        dataUltimaCalibracao: item.dataUltimaCalibracao ? item.dataUltimaCalibracao.slice(0, 10) : "",
        dataProximaCalibracao: item.dataProximaCalibracao ? item.dataProximaCalibracao.slice(0, 10) : "",
        certificado: item.certificado,
        laboratorio: item.laboratorio,
        status: item.status,
        observacoes: item.observacoes
      });
      modalAberto.value = true;
    }

    function atualizarProximoVencimento() {
      if (form.dataUltimaCalibracao && form.periodicidade) {
        form.dataProximaCalibracao = window.calcularVencimentoChecagem(form.dataUltimaCalibracao, form.periodicidade);
      }
    }

    async function salvarInstrumento() {
      if (!form.instrumento.trim()) return pushToast("Informe o nome do instrumento.", "error");
      if (!form.tag.trim()) return pushToast("Informe a TAG do instrumento.", "error");

      salvando.value = true;
      try {
        const payload = {
          action: "saveCadastro",
          tipo: "calibracao_instrumento",
          id: form.id,
          tag: form.tag.trim(),
          instrumento: form.instrumento.trim(),
          modelo: form.modelo.trim(),
          setor: form.setor,
          periodicidade: form.periodicidade,
          dataUltimaCalibracao: form.dataUltimaCalibracao,
          dataProximaCalibracao: form.dataProximaCalibracao,
          certificado: form.certificado.trim(),
          laboratorio: form.laboratorio.trim(),
          status: form.status,
          observacoes: form.observacoes.trim(),
          empresaId: "HIDROGERON"
        };

        await postToAppsScript(payload);
        pushToast("Instrumento salvo com sucesso!", "success");
        modalAberto.value = false;
        await carregar();
      } catch (e) {
        console.error(e);
        pushToast("Erro ao gravar instrumento.", "error");
      } finally {
        salvando.value = false;
      }
    }

    function formatarData(dt) {
      if (!dt) return "—";
      var d = new Date(dt);
      return isNaN(d.getTime()) ? dt : d.toLocaleDateString("pt-BR");
    }

    function badgeStatusClasse(st) {
      if (st === "No Prazo") return "bg-emerald-50 text-emerald-700 border-emerald-200";
      if (st === "Atenção (< 45d)") return "bg-amber-50 text-amber-700 border-amber-200";
      if (st === "Vencido") return "bg-rose-50 text-rose-700 border-rose-200";
      return "bg-sky-50 text-sky-700 border-sky-200";
    }

    onMounted(carregar);

    return {
      instrumentos, loading, erro, busca, filtroSetor, filtroStatus, setoresDisponiveis,
      contadores, instrumentosFiltrados, modalAberto, salvando, editando, form,
      abrirNovo, abrirEditar, salvarInstrumento, atualizarProximoVencimento, formatarData, badgeStatusClasse
    };
  },
  template: `
  <div class="space-y-5">
    <!-- Contadores Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
        <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
        <div>
          <p class="text-xl font-extrabold text-slate-800">{{ contadores.noPrazo }}</p>
          <p class="text-[11px] font-semibold text-slate-400 uppercase">No Prazo (> 45d)</p>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
        <span class="w-3 h-3 rounded-full bg-amber-400"></span>
        <div>
          <p class="text-xl font-extrabold text-slate-800">{{ contadores.atencao }}</p>
          <p class="text-[11px] font-semibold text-slate-400 uppercase">Atenção (≤ 45d)</p>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
        <span class="w-3 h-3 rounded-full bg-rose-500"></span>
        <div>
          <p class="text-xl font-extrabold text-slate-800">{{ contadores.vencidos }}</p>
          <p class="text-[11px] font-semibold text-slate-400 uppercase">Vencidos</p>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
        <span class="w-3 h-3 rounded-full bg-sky-500"></span>
        <div>
          <p class="text-xl font-extrabold text-slate-800">{{ contadores.emCalibracao }}</p>
          <p class="text-[11px] font-semibold text-slate-400 uppercase">Em Calibração</p>
        </div>
      </div>
    </div>

    <!-- Barra de Ações & Filtros -->
    <div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm flex flex-col sm:flex-row gap-2 items-center justify-between">
      <div class="flex-1 w-full sm:w-auto">
        <input v-model="busca" type="text" placeholder="Buscar TAG, instrumento ou certificado..."
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none" />
      </div>
      <div class="flex gap-2 w-full sm:w-auto">
        <select v-model="filtroSetor" class="rounded-lg border border-slate-300 px-2 py-2 text-xs bg-white">
          <option value="todos">Setor: Todos</option>
          <option v-for="s in setoresDisponiveis" :key="s" :value="s">{{ s }}</option>
        </select>
        <select v-model="filtroStatus" class="rounded-lg border border-slate-300 px-2 py-2 text-xs bg-white">
          <option value="todos">Status: Todos</option>
          <option value="No Prazo">No Prazo</option>
          <option value="Atenção (< 45d)">Atenção (≤ 45d)</option>
          <option value="Vencido">Vencido</option>
          <option value="Em Calibração">Em Calibração</option>
        </select>
        <button @click="abrirNovo" class="btn-tap bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-3 py-2 rounded-lg whitespace-nowrap">
          + Novo Cadastro
        </button>
      </div>
    </div>

    <!-- Estado de Erro -->
    <div v-if="erro" class="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 text-xs font-semibold">
      {{ erro }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12"><span class="spinner"></span></div>

    <!-- Lista / Tabela de Instrumentos -->
    <div v-else class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-xs text-left">
          <thead class="bg-slate-50 text-slate-500 border-b border-slate-200 text-[10px] uppercase">
            <tr>
              <th class="p-3">TAG / ID</th>
              <th class="p-3">Instrumento</th>
              <th class="p-3">Setor</th>
              <th class="p-3">Última Calibração</th>
              <th class="p-3">Vencimento</th>
              <th class="p-3">Status</th>
              <th class="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="inst in instrumentosFiltrados" :key="inst.id" class="hover:bg-slate-50 transition-colors">
              <td class="p-3 font-mono font-bold text-slate-700">{{ inst.tag || inst.id }}</td>
              <td class="p-3">
                <p class="font-bold text-slate-800">{{ inst.instrumento }}</p>
                <p class="text-[10px] text-slate-400">{{ inst.modelo || 'Sem modelo' }} · Cert: {{ inst.certificado || '—' }}</p>
              </td>
              <td class="p-3 text-slate-600">{{ inst.setor }}</td>
              <td class="p-3 text-slate-500">{{ formatarData(inst.dataUltimaCalibracao) }}</td>
              <td class="p-3 font-medium text-slate-700">{{ formatarData(inst.dataProximaCalibracao) }}</td>
              <td class="p-3">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border" :class="badgeStatusClasse(inst.statusCalculado)">
                  {{ inst.statusCalculado }}
                </span>
              </td>
              <td class="p-3 text-right">
                <button @click="abrirEditar(inst)" class="btn-tap text-xs font-semibold text-sky-600 hover:underline">
                  Editar
                </button>
              </td>
            </tr>
            <tr v-if="instrumentosFiltrados.length === 0">
              <td colspan="7" class="p-8 text-center text-slate-400">
                Nenhum instrumento de medição encontrado.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- MODAL: Novo / Editar Instrumento -->
    <div v-if="modalAberto" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div class="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b pb-3">
          <h3 class="font-bold text-slate-800 text-sm">
            {{ editando ? 'Editar Instrumento' : 'Novo Instrumento de Medição' }}
          </h3>
          <button @click="modalAberto = false" class="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        <div class="space-y-3 text-xs">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">TAG / Código *</label>
              <input v-model="form.tag" type="text" placeholder="Ex: PAQ-01" class="w-full border rounded-lg p-2 focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Instrumento *</label>
              <input v-model="form.instrumento" type="text" placeholder="Ex: Paquímetro Digital" class="w-full border rounded-lg p-2 focus:ring-2 focus:ring-sky-500" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Modelo / Faixa</label>
              <input v-model="form.modelo" type="text" placeholder="Ex: 0-150mm Mitutoyo" class="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Setor / Área</label>
              <select v-model="form.setor" class="w-full border rounded-lg p-2">
                <option v-for="s in setoresDisponiveis" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Periodicidade</label>
              <select v-model="form.periodicidade" @change="atualizarProximoVencimento" class="w-full border rounded-lg p-2">
                <option value="Mensal">Mensal (30 dias)</option>
                <option value="Bimestral">Bimestral (60 dias)</option>
                <option value="Trimestral">Trimestral (90 dias)</option>
                <option value="Semestral">Semestral (180 dias)</option>
                <option value="Anual">Anual (365 dias)</option>
              </select>
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Data da Última Calibração</label>
              <input v-model="form.dataUltimaCalibracao" @change="atualizarProximoVencimento" type="date" class="w-full border rounded-lg p-2" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Data de Vencimento</label>
              <input v-model="form.dataProximaCalibracao" type="date" class="w-full border rounded-lg p-2" />
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Nº do Certificado</label>
              <input v-model="form.certificado" type="text" placeholder="Ex: CERT-2026-99" class="w-full border rounded-lg p-2" />
            </div>
          </div>

          <div>
            <label class="block font-semibold text-slate-600 mb-1">Laboratório / Fornecedor</label>
            <input v-model="form.laboratorio" type="text" placeholder="Ex: Laboratório RBC Metrologia" class="w-full border rounded-lg p-2" />
          </div>

          <div>
            <label class="block font-semibold text-slate-600 mb-1">Observações</label>
            <textarea v-model="form.observacoes" rows="2" class="w-full border rounded-lg p-2"></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t pt-3">
          <button @click="modalAberto = false" class="btn-tap px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold">Cancelar</button>
          <button @click="salvarInstrumento" :disabled="salvando" class="btn-tap px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs">
            {{ salvando ? 'Salvando...' : 'Gravar Instrumento' }}
          </button>
        </div>
      </div>
    </div>
  </div>`
};

window.CalibracaoModule = CalibracaoModule;