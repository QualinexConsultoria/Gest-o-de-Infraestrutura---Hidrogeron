/* ==========================================================================
   js/modulos/calibracao.js — Módulo de Calibração & Medição (RSG-7601-02)
   Gestão completa de Instrumentos de Medição, Checagem Intermediária 180d,
   Certificados, Ficha Técnica, Etiqueta com QR Code e Emissão de Laudos.
   ========================================================================== */

// Helper global à prova de falhas: calcula vencimento (180 dias padrão ou conforme periodicidade)
function calcularVencimentoChecagem(dataChecagem, periodicidade) {
  if (!dataChecagem) return "";
  var d = new Date(dataChecagem);
  if (isNaN(d.getTime())) return "";
  
  var p = String(periodicidade || "").trim().toLowerCase();
  var dias = 180;
  if (p === "mensal") dias = 30;
  else if (p === "bimestral") dias = 60;
  else if (p === "trimestral") dias = 90;
  else if (p === "semestral") dias = 180;
  else if (p === "anual") dias = 365;

  var venc = new Date(d.getTime() + (dias * 24 * 60 * 60 * 1000));
  return venc.toISOString().slice(0, 10);
}
window.calcularVencimentoChecagem = calcularVencimentoChecagem;

/* ==========================================================================
   NORMALIZAÇÃO DE INSTRUMENTOS (Aba Calibracoes_Controle)
   ========================================================================== */
function normalizeCalibracao(c) {
  var tag = (c.TAG || c.tag || c.Tag || c.Codigo || c.codigo || "").toString().trim();
  var id = (c.ID_Instrumento || c.id_instrumento || c.ID || c.id || tag || uid()).toString().trim();
  var instNome = c.Instrumento || c.instrumento || c.Nome || c.nome || c.Descricao || "Instrumento";
  var periodicidade = c.Periodicidade || c.periodicidade || "Semestral";
  var ultimaCal = c.Data_Ultima_Calibracao || c.dataUltimaCalibracao || c.Ultima_Calibracao || c.data || "";
  var proxCal = c.Data_Proxima_Calibracao || c.dataProximaCalibracao || c.Vencimento || "";

  if (!proxCal && ultimaCal) {
    proxCal = calcularVencimentoChecagem(ultimaCal, periodicidade);
  }

  return {
    id: id,
    tag: tag || id,
    instrumento: instNome,
    modelo: c.Modelo || c.modelo || c.Fabricante || "",
    setor: c.Setor || c.setor || c.Area || c.area || "Uso Geral",
    periodicidade: periodicidade,
    dataUltimaCalibracao: ultimaCal,
    dataProximaCalibracao: proxCal,
    certificado: c.Numero_Certificado || c.numeroCertificado || c.Certificado || c.certificado || "",
    laboratorio: c.Laboratorio || c.laboratorio || c.Fornecedor || c.fornecedor || "",
    criterioAceitacao: c.Criterio_Aceitacao || c.criterioAceitacao || "± 0,02 mm",
    incerteza: c.Incertesa || c.incerteza || "U = 0,005 mm",
    status: c.Status || c.status || "No Prazo",
    observacoes: c.Observacoes || c.observacoes || "",
    historicoChecagens: c.historicoChecagens || []
  };
}

function calcularStatusInstrumento(dataVenc, statusManual) {
  var sm = String(statusManual || "").toLowerCase();
  if (sm === "em calibração" || sm === "em calibracao") return "Em Calibração";
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

/* ==========================================================================
   MODAL DE FICHA TÉCNICA E LAUDO (RSG-7601-02)
   ========================================================================== */
const FichaInstrumentoModal = {
  props: { instrumento: Object },
  emits: ["fechar", "editar", "registrar-checagem", "gerar-qr", "ver-laudo"],
  setup(props) {
    function formatarData(d) {
      if (!d) return "—";
      var dt = new Date(d);
      return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("pt-BR");
    }

    function badgeClasse(st) {
      if (st === "No Prazo") return "bg-emerald-50 text-emerald-700 border-emerald-200";
      if (st === "Atenção (< 45d)") return "bg-amber-50 text-amber-700 border-amber-200";
      if (st === "Vencido") return "bg-rose-50 text-rose-700 border-rose-200";
      return "bg-sky-50 text-sky-700 border-sky-200";
    }

    return { formatarData, badgeClasse };
  },
  template: `
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="$emit('fechar')">
    <div class="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
      <div class="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div>
          <span class="text-xs font-mono font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">{{ instrumento.tag }}</span>
          <h3 class="font-extrabold text-slate-800 text-base mt-1">{{ instrumento.instrumento }}</h3>
        </div>
        <button @click="$emit('fechar')" class="text-slate-400 hover:text-slate-600 text-xl font-bold px-2">✕</button>
      </div>

      <div class="p-5 space-y-4 overflow-y-auto text-xs">
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div>
            <p class="text-slate-400 font-semibold uppercase text-[10px]">Setor / Local</p>
            <p class="font-bold text-slate-700 mt-0.5">{{ instrumento.setor }}</p>
          </div>
          <div>
            <p class="text-slate-400 font-semibold uppercase text-[10px]">Modelo / Fabricante</p>
            <p class="font-bold text-slate-700 mt-0.5">{{ instrumento.modelo || '—' }}</p>
          </div>
          <div>
            <p class="text-slate-400 font-semibold uppercase text-[10px]">Status</p>
            <span class="inline-block mt-0.5 px-2 py-0.5 rounded-full font-bold border" :class="badgeClasse(instrumento.statusCalculado)">
              {{ instrumento.statusCalculado }}
            </span>
          </div>
          <div>
            <p class="text-slate-400 font-semibold uppercase text-[10px]">Última Calibração</p>
            <p class="font-bold text-slate-700 mt-0.5">{{ formatarData(instrumento.dataUltimaCalibracao) }}</p>
          </div>
          <div>
            <p class="text-slate-400 font-semibold uppercase text-[10px]">Próximo Vencimento</p>
            <p class="font-bold text-slate-700 mt-0.5">{{ formatarData(instrumento.dataProximaCalibracao) }}</p>
          </div>
          <div>
            <p class="text-slate-400 font-semibold uppercase text-[10px]">Periodicidade</p>
            <p class="font-bold text-slate-700 mt-0.5">{{ instrumento.periodicidade }}</p>
          </div>
        </div>

        <div class="border border-slate-200 p-3 rounded-xl space-y-2">
          <p class="font-bold text-slate-700 uppercase tracking-wide text-[10px]">Parâmetros Metrológicos</p>
          <div class="grid grid-cols-2 gap-2 text-slate-600">
            <p><strong>Nº Certificado:</strong> {{ instrumento.certificado || '—' }}</p>
            <p><strong>Laboratório:</strong> {{ instrumento.laboratorio || '—' }}</p>
            <p><strong>Critério Aceitação:</strong> {{ instrumento.criterioAceitacao }}</p>
            <p><strong>Incerteza:</strong> {{ instrumento.incerteza }}</p>
          </div>
        </div>

        <div v-if="instrumento.observacoes" class="border border-slate-200 p-3 rounded-xl">
          <p class="font-bold text-slate-700 uppercase tracking-wide text-[10px] mb-1">Observações</p>
          <p class="text-slate-600">{{ instrumento.observacoes }}</p>
        </div>

        <!-- Botões de Ação na Ficha -->
        <div class="grid grid-cols-2 gap-2 pt-2">
          <button @click="$emit('ver-laudo')" class="btn-tap flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-lg text-xs">
            📄 Visualizar Laudo
          </button>
          <button @click="$emit('gerar-qr')" class="btn-tap flex items-center justify-center gap-1.5 bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 font-semibold py-2.5 rounded-lg text-xs">
            🏷️ Etiqueta & QR
          </button>
          <button @click="$emit('registrar-checagem')" class="btn-tap flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg text-xs">
            ✅ Checagem 180d
          </button>
          <button @click="$emit('editar')" class="btn-tap flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg text-xs">
            ✏️ Editar
          </button>
        </div>
      </div>
    </div>
  </div>`
};

/* ==========================================================================
   MODAL DE ETIQUETA QR CODE
   ========================================================================== */
const EtiquetaQRModal = {
  props: { instrumento: Object },
  emits: ["fechar"],
  setup(props) {
    const qrUrl = computed(() => {
      const code = encodeURIComponent(props.instrumento.tag || props.instrumento.id);
      return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${code}`;
    });
    function imprimir() { window.print(); }
    return { qrUrl, imprimir };
  },
  template: `
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="$emit('fechar')">
    <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 text-center space-y-4">
      <h3 class="font-bold text-slate-800 text-sm">Etiqueta Metrológica de Identificação</h3>
      <div id="etiqueta-print" class="border-2 border-dashed border-slate-300 p-4 rounded-xl flex flex-col items-center space-y-2 bg-slate-50">
        <img :src="qrUrl" class="w-32 h-32 rounded-lg border border-slate-200 shadow-sm" alt="QR Code" />
        <p class="font-extrabold text-base text-slate-800 font-mono tracking-wider">{{ instrumento.tag }}</p>
        <p class="font-semibold text-xs text-slate-700">{{ instrumento.instrumento }}</p>
        <p class="text-[10px] text-slate-500">Setor: {{ instrumento.setor }}</p>
        <div class="text-[10px] text-slate-400 border-t border-slate-200 pt-1 w-full flex justify-between">
          <span>Venc: {{ instrumento.dataProximaCalibracao || '—' }}</span>
          <span>Hidrogeron</span>
        </div>
      </div>
      <div class="flex gap-2">
        <button @click="imprimir" class="btn-tap flex-1 bg-slate-800 text-white py-2 rounded-lg font-bold text-xs">🖨️ Imprimir</button>
        <button @click="$emit('fechar')" class="btn-tap flex-1 bg-slate-100 text-slate-700 py-2 rounded-lg font-semibold text-xs">Fechar</button>
      </div>
    </div>
  </div>`
};

/* ==========================================================================
   MÓDULO PRINCIPAL: CALIBRAÇÃO & MEDIÇÃO
   ========================================================================== */
const CalibracaoModule = {
  props: { user: Object },
  emits: ["go-home"],
  components: { FichaInstrumentoModal, EtiquetaQRModal },
  setup(props) {
    const instrumentos = ref([]);
    const loading = ref(true);
    const erro = ref("");
    const busca = ref("");
    const filtroSetor = ref("todos");
    const filtroStatus = ref("todos");
    const setoresDisponiveis = ref([]);

    // Modais e Estados
    const modalFichaAberto = ref(false);
    const modalQRAberto = ref(false);
    const modalCadastroAberto = ref(false);
    const instrumentoSelecionado = ref(null);
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
      criterioAceitacao: "± 0,02 mm",
      incerteza: "U = 0,005 mm",
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

        // Monta lista de setores a partir dos dados da planilha
        const sSet = new Set();
        instrumentos.value.forEach(i => { if (i.setor) sSet.add(i.setor); });
        if (data.setores && Array.isArray(data.setores)) {
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

    // Contadores Cards Superiores
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

    function abrirFicha(inst) {
      instrumentoSelecionado.value = inst;
      modalFichaAberto.value = true;
    }

    function abrirQR(inst) {
      instrumentoSelecionado.value = inst;
      modalQRAberto.value = true;
    }

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
        criterioAceitacao: "± 0,02 mm",
        incerteza: "U = 0,005 mm",
        status: "No Prazo",
        observacoes: ""
      });
      atualizarProximoVencimento();
      modalCadastroAberto.value = true;
    }

    function abrirEditar(inst) {
      editando.value = true;
      Object.assign(form, {
        id: inst.id,
        tag: inst.tag,
        instrumento: inst.instrumento,
        modelo: inst.modelo,
        setor: inst.setor,
        periodicidade: inst.periodicidade,
        dataUltimaCalibracao: inst.dataUltimaCalibracao ? inst.dataUltimaCalibracao.slice(0, 10) : "",
        dataProximaCalibracao: inst.dataProximaCalibracao ? inst.dataProximaCalibracao.slice(0, 10) : "",
        certificado: inst.certificado,
        laboratorio: inst.laboratorio,
        criterioAceitacao: inst.criterioAceitacao,
        incerteza: inst.incerteza,
        status: inst.status,
        observacoes: inst.observacoes
      });
      modalFichaAberto.value = false;
      modalCadastroAberto.value = true;
    }

    function atualizarProximoVencimento() {
      if (form.dataUltimaCalibracao && form.periodicidade) {
        form.dataProximaCalibracao = calcularVencimentoChecagem(form.dataUltimaCalibracao, form.periodicidade);
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
          criterioAceitacao: form.criterioAceitacao,
          incerteza: form.incerteza,
          status: form.status,
          observacoes: form.observacoes.trim(),
          empresaId: "HIDROGERON"
        };

        await postToAppsScript(payload);
        pushToast("Instrumento gravado na base de dados!", "success");
        modalCadastroAberto.value = false;
        await carregar();
      } catch (e) {
        console.error(e);
        pushToast("Erro ao gravar instrumento.", "error");
      } finally {
        salvando.value = false;
      }
    }

    async function registrarChecagem180d(inst) {
      const resp = confirm(`Registrar checagem intermediária de 180 dias para o instrumento ${inst.tag}?`);
      if (!resp) return;
      
      const hoje = new Date().toISOString().slice(0, 10);
      const novoVenc = calcularVencimentoChecagem(hoje, inst.periodicidade);

      try {
        await postToAppsScript({
          action: "saveCadastro",
          tipo: "checagem_180d",
          id: inst.id,
          dataChecagem: hoje,
          dataProximaCalibracao: novoVenc,
          usuario: props.user?.nome || "Responsável Metrologia",
          empresaId: "HIDROGERON"
        });

        inst.dataUltimaCalibracao = hoje;
        inst.dataProximaCalibracao = novoVenc;
        inst.statusCalculado = "No Prazo";
        pushToast(`Checagem do instrumento ${inst.tag} registrada com sucesso!`, "success");
        modalFichaAberto.value = false;
      } catch (e) {
        console.error(e);
        pushToast("Erro ao registrar checagem.", "error");
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
      contadores, instrumentosFiltrados, modalFichaAberto, modalQRAberto, modalCadastroAberto,
      instrumentoSelecionado, salvando, editando, form,
      abrirFicha, abrirQR, abrirNovo, abrirEditar, salvarInstrumento, registrarChecagem180d,
      atualizarProximoVencimento, formatarData, badgeStatusClasse
    };
  },
  template: `
  <div class="space-y-5">
    <!-- Contadores Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
        <span class="w-3.5 h-3.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200"></span>
        <div>
          <p class="text-xl font-extrabold text-slate-800">{{ contadores.noPrazo }}</p>
          <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">No Prazo (> 45d)</p>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
        <span class="w-3.5 h-3.5 rounded-full bg-amber-400 shadow-sm shadow-amber-200"></span>
        <div>
          <p class="text-xl font-extrabold text-slate-800">{{ contadores.atencao }}</p>
          <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Atenção (≤ 45d)</p>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
        <span class="w-3.5 h-3.5 rounded-full bg-rose-500 shadow-sm shadow-rose-200"></span>
        <div>
          <p class="text-xl font-extrabold text-slate-800">{{ contadores.vencidos }}</p>
          <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Vencidos</p>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
        <span class="w-3.5 h-3.5 rounded-full bg-sky-500 shadow-sm shadow-sky-200"></span>
        <div>
          <p class="text-xl font-extrabold text-slate-800">{{ contadores.emCalibracao }}</p>
          <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Em Calibração</p>
        </div>
      </div>
    </div>

    <!-- Barra de Filtros e Busca -->
    <div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm flex flex-col sm:flex-row gap-2 items-center justify-between">
      <div class="flex-1 w-full sm:w-auto">
        <input v-model="busca" type="text" placeholder="Buscar por TAG, instrumento, modelo ou certificado..."
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
        <button @click="abrirNovo" class="btn-tap bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg whitespace-nowrap shadow-sm">
          + Novo Cadastro
        </button>
      </div>
    </div>

    <!-- Mensagem de Erro (se houver) -->
    <div v-if="erro" class="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 text-xs font-semibold">
      {{ erro }}
    </div>

    <!-- Spinner de Loading -->
    <div v-if="loading" class="flex justify-center py-12"><span class="spinner"></span></div>

    <!-- Tabela de Instrumentos (Design Rico) -->
    <div v-else class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-xs text-left">
          <thead class="bg-slate-50 text-slate-500 border-b border-slate-200 text-[10px] uppercase font-bold tracking-wide">
            <tr>
              <th class="p-3">TAG / ID</th>
              <th class="p-3">Instrumento / Modelo</th>
              <th class="p-3">Setor</th>
              <th class="p-3">Última Calibração</th>
              <th class="p-3">Vencimento</th>
              <th class="p-3">Status</th>
              <th class="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="inst in instrumentosFiltrados" :key="inst.id" class="hover:bg-slate-50/80 transition-colors">
              <td class="p-3">
                <span class="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded">{{ inst.tag }}</span>
              </td>
              <td class="p-3">
                <p class="font-bold text-slate-800 text-xs">{{ inst.instrumento }}</p>
                <p class="text-[10px] text-slate-400 mt-0.5">{{ inst.modelo || 'Sem modelo' }} · Cert: {{ inst.certificado || '—' }}</p>
              </td>
              <td class="p-3 text-slate-600 font-medium">{{ inst.setor }}</td>
              <td class="p-3 text-slate-500">{{ formatarData(inst.dataUltimaCalibracao) }}</td>
              <td class="p-3 font-semibold text-slate-700">{{ formatarData(inst.dataProximaCalibracao) }}</td>
              <td class="p-3">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap inline-block" :class="badgeStatusClasse(inst.statusCalculado)">
                  {{ inst.statusCalculado }}
                </span>
              </td>
              <td class="p-3 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <button @click="abrirFicha(inst)" class="btn-tap px-2.5 py-1 text-xs font-semibold text-sky-600 bg-sky-50 hover:bg-sky-100 rounded-md">
                    Ficha
                  </button>
                  <button @click="abrirQR(inst)" class="btn-tap px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-md" title="Gerar Etiqueta QR">
                    🏷️
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="instrumentosFiltrados.length === 0">
              <td colspan="7" class="p-8 text-center text-slate-400 font-medium">
                Nenhum instrumento de medição encontrado com os filtros atuais.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modais Integrados -->
    <ficha-instrumento-modal v-if="modalFichaAberto" :instrumento="instrumentoSelecionado"
      @fechar="modalFichaAberto = false"
      @editar="abrirEditar(instrumentoSelecionado)"
      @gerar-qr="abrirQR(instrumentoSelecionado)"
      @registrar-checagem="registrarChecagem180d(instrumentoSelecionado)"
      @ver-laudo="abrirFicha(instrumentoSelecionado)">
    </ficha-instrumento-modal>

    <etiqueta-q-r-modal v-if="modalQRAberto" :instrumento="instrumentoSelecionado" @fechar="modalQRAberto = false"></etiqueta-q-r-modal>

    <!-- MODAL: Cadastro & Edição de Instrumento -->
    <div v-if="modalCadastroAberto" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div class="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b pb-3">
          <h3 class="font-bold text-slate-800 text-sm">
            {{ editando ? 'Editar Instrumento' : 'Novo Instrumento de Medição' }}
          </h3>
          <button @click="modalCadastroAberto = false" class="text-slate-400 hover:text-slate-600 text-xl font-bold px-1">✕</button>
        </div>

        <div class="space-y-3 text-xs">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">TAG / Código *</label>
              <input v-model="form.tag" type="text" placeholder="Ex: PAQ-01" class="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-sky-500 font-mono" />
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Instrumento *</label>
              <input v-model="form.instrumento" type="text" placeholder="Ex: Paquímetro Digital" class="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-sky-500" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Modelo / Faixa</label>
              <input v-model="form.modelo" type="text" placeholder="Ex: 0-150mm Mitutoyo" class="w-full border border-slate-300 rounded-lg p-2" />
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Setor / Área</label>
              <select v-model="form.setor" class="w-full border border-slate-300 rounded-lg p-2 bg-white">
                <option v-for="s in setoresDisponiveis" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Periodicidade</label>
              <select v-model="form.periodicidade" @change="atualizarProximoVencimento" class="w-full border border-slate-300 rounded-lg p-2 bg-white">
                <option value="Mensal">Mensal (30 dias)</option>
                <option value="Bimestral">Bimestral (60 dias)</option>
                <option value="Trimestral">Trimestral (90 dias)</option>
                <option value="Semestral">Semestral (180 dias)</option>
                <option value="Anual">Anual (365 dias)</option>
              </select>
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Data da Última Calibração</label>
              <input v-model="form.dataUltimaCalibracao" @change="atualizarProximoVencimento" type="date" class="w-full border border-slate-300 rounded-lg p-2 bg-white" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Data de Vencimento</label>
              <input v-model="form.dataProximaCalibracao" type="date" class="w-full border border-slate-300 rounded-lg p-2 bg-white" />
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Nº Certificado</label>
              <input v-model="form.certificado" type="text" placeholder="Ex: CERT-2026-99" class="w-full border border-slate-300 rounded-lg p-2" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Critério Aceitação</label>
              <input v-model="form.criterioAceitacao" type="text" placeholder="Ex: ± 0,02 mm" class="w-full border border-slate-300 rounded-lg p-2" />
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Incerteza Expandida</label>
              <input v-model="form.incerteza" type="text" placeholder="Ex: U = 0,005 mm" class="w-full border border-slate-300 rounded-lg p-2" />
            </div>
          </div>

          <div>
            <label class="block font-semibold text-slate-600 mb-1">Laboratório / Fornecedor</label>
            <input v-model="form.laboratorio" type="text" placeholder="Ex: Laboratório RBC Metrologia" class="w-full border border-slate-300 rounded-lg p-2" />
          </div>

          <div>
            <label class="block font-semibold text-slate-600 mb-1">Observações</label>
            <textarea v-model="form.observacoes" rows="2" class="w-full border border-slate-300 rounded-lg p-2"></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t pt-3">
          <button @click="modalCadastroAberto = false" class="btn-tap px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold">Cancelar</button>
          <button @click="salvarInstrumento" :disabled="salvando" class="btn-tap px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-md">
            {{ salvando ? 'Gravando...' : 'Gravar Instrumento' }}
          </button>
        </div>
      </div>
    </div>
  </div>`
};

window.CalibracaoModule = CalibracaoModule;