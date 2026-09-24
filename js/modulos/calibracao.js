/* ==========================================================================
   js/modulos/calibracao.js — Módulo de Calibração & Medição (RSG-7601-02)
   100% Fiel à Planilha Cadastro de Equipamentos - Manutenção Hidrogeron
   ========================================================================== */

// Helpers Globais (Cross-Module)
window.calcularVencimentoChecagem = function(dataChecagem, periodicidade) {
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
};

window.statusInstrumentoCalibracao = function(dataVenc, statusManual) {
  var sm = String(statusManual || "").toLowerCase();
  if (sm.indexOf("calibra") !== -1) return "Em Calibração";
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
};

window.extrairIdCalibracaoDoHash = function() {
  var hash = window.location.hash || "";
  var match = hash.match(/calibracao\/([^\/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
};

var calcularVencimentoChecagem = window.calcularVencimentoChecagem;
var statusInstrumentoCalibracao = window.statusInstrumentoCalibracao;
var extrairIdCalibracaoDoHash = window.extrairIdCalibracaoDoHash;

/* ==========================================================================
   NORMALIZAÇÃO DE DADOS — MAPEAMENTO COMPLETO DA PLANILHA
   ========================================================================== */
function normalizeCalibracao(c) {
  var tag = (c.TAG || c.tag || c.Tag || c.Codigo || c.codigo || c.ID_Instrumento || "").toString().trim();
  var id = (c.ID_Instrumento || c.id_instrumento || c.ID || c.id || tag || uid()).toString().trim();
  var instNome = c.Instrumento || c.instrumento || c.Equipamento || c.equipamento || c.Nome || c.Descricao || "Instrumento";
  var modelo = c.Marca_Modelo || c.marca_modelo || c.Modelo || c.modelo || "";
  var capacidade = c.Capacidade || c.capacidade || "";
  var criterio = c.Criterio_Aceitacao || c.criterio_aceitacao || c.Criterio || "";
  var numSerie = c.Numero_Serie || c.numero_serie || c.Serie || "";
  var certRbc = c.Certificado_RBC || c.certificado_rbc || c.Certificado || c.Numero_Certificado || "";
  var laboratorio = c.Laboratorio || c.laboratorio || c.Fornecedor || c.fornecedor || c.Orgao_Calibrador || "";
  var setor = c.Setor || c.setor || "Geral";
  var operador = c.Operador_Responsavel || c.operador_responsavel || c.Operador || c.responsavel || c.Responsavel || "";
  
  var dtCal = c.Data_Calibracao || c.data_calibracao || c.Data_Ultima_Calibracao || "";
  var vencCal = c.Vencimento_Calibracao || c.vencimento_calibracao || c.Data_Proxima_Calibracao || "";
  var dtChec = c.Data_Checagem || c.data_checagem || "";
  var vencChec = c.Vencimento_Checagem || c.vencimento_checagem || "";
  var status = c.Status || c.status || "No Prazo";
  var obs = c.Observacoes || c.observacoes || "";

  return {
    id: id,
    tag: tag || id,
    instrumento: instNome,
    modelo: modelo,
    capacidade: capacidade,
    criterioAceitacao: criterio,
    numeroSerie: numSerie,
    certificadoRbc: certRbc,
    laboratorio: laboratorio,
    setor: setor,
    operador: operador,
    dataCalibracao: dtCal ? String(dtCal).slice(0, 10) : "",
    vencimentoCalibracao: vencCal ? String(vencCal).slice(0, 10) : "",
    dataChecagem: dtChec ? String(dtChec).slice(0, 10) : "",
    vencimentoChecagem: vencChec ? String(vencChec).slice(0, 10) : "",
    status: status,
    observacoes: obs
  };
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
          <span class="text-xs font-mono font-bold text-sky-700 bg-sky-100 px-2.5 py-0.5 rounded-full">{{ instrumento.tag }}</span>
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
            <p class="text-slate-400 font-semibold uppercase text-[10px]">Marca / Modelo</p>
            <p class="font-bold text-slate-700 mt-0.5">{{ instrumento.modelo || '—' }}</p>
          </div>
          <div>
            <p class="text-slate-400 font-semibold uppercase text-[10px]">Status</p>
            <span class="inline-block mt-0.5 px-2 py-0.5 rounded-full font-bold border" :class="badgeClasse(instrumento.statusCalculado)">
              {{ instrumento.statusCalculado }}
            </span>
          </div>
          <div>
            <p class="text-slate-400 font-semibold uppercase text-[10px]">Data Calibração</p>
            <p class="font-bold text-slate-700 mt-0.5">{{ formatarData(instrumento.dataCalibracao) }}</p>
          </div>
          <div>
            <p class="text-slate-400 font-semibold uppercase text-[10px]">Vencimento Calibração</p>
            <p class="font-bold text-slate-700 mt-0.5">{{ formatarData(instrumento.vencimentoCalibracao) }}</p>
          </div>
          <div>
            <p class="text-slate-400 font-semibold uppercase text-[10px]">Operador Responsável</p>
            <p class="font-bold text-slate-700 mt-0.5">{{ instrumento.operador || '—' }}</p>
          </div>
        </div>

        <div class="border border-slate-200 p-3 rounded-xl space-y-2">
          <p class="font-bold text-slate-700 uppercase tracking-wide text-[10px]">Especificações & Metrologia</p>
          <div class="grid grid-cols-2 gap-2 text-slate-600">
            <p><strong>Capacidade:</strong> {{ instrumento.capacidade || '—' }}</p>
            <p><strong>Critério Aceitação:</strong> {{ instrumento.criterioAceitacao || '—' }}</p>
            <p><strong>Nº de Série:</strong> {{ instrumento.numeroSerie || '—' }}</p>
            <p><strong>Certificado RBC:</strong> {{ instrumento.certificadoRbc || '—' }}</p>
            <p><strong>Laboratório / Fornecedor:</strong> {{ instrumento.laboratorio || '—' }}</p>
            <p><strong>Última Checagem:</strong> {{ formatarData(instrumento.dataChecagem) }}</p>
            <p class="col-span-2"><strong>Vencimento Checagem:</strong> {{ formatarData(instrumento.vencimentoChecagem) }}</p>
          </div>
        </div>

        <div v-if="instrumento.observacoes" class="border border-slate-200 p-3 rounded-xl">
          <p class="font-bold text-slate-700 uppercase tracking-wide text-[10px] mb-1">Observações</p>
          <p class="text-slate-600">{{ instrumento.observacoes }}</p>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
          <button @click="$emit('ver-laudo')" class="btn-tap flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-lg text-xs">
            📄 Laudo
          </button>
          <button @click="$emit('gerar-qr')" class="btn-tap flex items-center justify-center gap-1 bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 font-semibold py-2.5 rounded-lg text-xs">
            🏷️ Etiqueta
          </button>
          <button @click="$emit('registrar-checagem')" class="btn-tap flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg text-xs">
            ✅ Checagem
          </button>
          <button @click="$emit('editar')" class="btn-tap flex items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg text-xs">
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
      <h3 class="font-bold text-slate-800 text-sm">Etiqueta Metrológica com QR Code</h3>
      <div id="etiqueta-print" class="border-2 border-dashed border-slate-300 p-4 rounded-xl flex flex-col items-center space-y-2 bg-slate-50">
        <img :src="qrUrl" class="w-32 h-32 rounded-lg border border-slate-200 shadow-sm" alt="QR Code" />
        <p class="font-extrabold text-base text-slate-800 font-mono tracking-wider">{{ instrumento.tag }}</p>
        <p class="font-semibold text-xs text-slate-700">{{ instrumento.instrumento }}</p>
        <p class="text-[10px] text-slate-500">Setor: {{ instrumento.setor }}</p>
        <div class="text-[10px] text-slate-400 border-t border-slate-200 pt-1 w-full flex justify-between">
          <span>Venc: {{ instrumento.vencimentoCalibracao || '—' }}</span>
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
   COMPONENTE PRINCIPAL: CALIBRAÇÃO & MEDIÇÃO
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

    const modalFichaAberto = ref(false);
    const modalQRAberto = ref(false);
    const modalCadastroAberto = ref(false);
    const instrumentoSelecionado = ref(null);
    const salvando = ref(false);
    const editando = ref(false);

    function getNomeOperadorAtivo() {
      return (
        props.user?.nome ||
        props.user?.name ||
        props.user?.email ||
        window.userLogado?.nome ||
        "EDUARDO"
      );
    }

    const form = reactive({
      id: "",
      tag: "",
      instrumento: "",
      modelo: "",
      capacidade: "",
      criterioAceitacao: "",
      numeroSerie: "",
      certificadoRbc: "",
      laboratorio: "",
      setor: "ELÉTRICA",
      operador: "",
      dataCalibracao: "",
      vencimentoCalibracao: "",
      dataChecagem: "",
      vencimentoChecagem: "",
      status: "No Prazo",
      observacoes: ""
    });

    async function carregar(force = false) {
      loading.value = true;
      erro.value = "";
      try {
        const rawData = await getInitialData(force);
        const base = (rawData && rawData.data) ? rawData.data : rawData;
        const listaBruta = base.calibracoes || base.Calibracoes || base.calibracoes_controle || base.Calibracoes_Controle || [];
        
        instrumentos.value = listaBruta.map(function(item) {
          const norm = normalizeCalibracao(item);
          norm.statusCalculado = statusInstrumentoCalibracao(norm.vencimentoCalibracao, norm.status);
          return norm;
        });

        const sSet = new Set();
        instrumentos.value.forEach(i => { if (i.setor) sSet.add(i.setor); });
        const setoresBase = base.setores || [];
        if (Array.isArray(setoresBase)) {
          setoresBase.forEach(s => sSet.add(s.Nome || s.nome || s));
        }
        setoresDisponiveis.value = Array.from(sSet).filter(Boolean);

      } catch (e) {
        console.error("Erro ao carregar calibração:", e);
        erro.value = "Não foi possível carregar os registros de Calibração & Medição.";
      } finally {
        loading.value = false;
      }
    }

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

    const instrumentosFiltrados = computed(() => {
      const b = busca.value.trim().toLowerCase();
      return instrumentos.value.filter(i => {
        if (filtroSetor.value !== "todos" && i.setor !== filtroSetor.value) return false;
        if (filtroStatus.value !== "todos" && i.statusCalculado !== filtroStatus.value) return false;
        if (b) {
          const combo = `${i.tag} ${i.instrumento} ${i.modelo} ${i.capacidade} ${i.certificadoRbc} ${i.laboratorio} ${i.setor} ${i.operador}`.toLowerCase();
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
        id: "CAL-" + Date.now(),
        tag: "",
        instrumento: "",
        modelo: "",
        capacidade: "",
        criterioAceitacao: "±6%",
        numeroSerie: "",
        certificadoRbc: "",
        laboratorio: "",
        setor: setoresDisponiveis.value[0] || "ELÉTRICA",
        operador: getNomeOperadorAtivo(),
        dataCalibracao: new Date().toISOString().slice(0, 10),
        vencimentoCalibracao: "",
        dataChecagem: "",
        vencimentoChecagem: "",
        status: "No Prazo",
        observacoes: ""
      });
      modalCadastroAberto.value = true;
    }

    function abrirEditar(inst) {
      editando.value = true;
      Object.assign(form, {
        id: inst.id || inst.tag,
        tag: inst.tag,
        instrumento: inst.instrumento,
        modelo: inst.modelo,
        capacidade: inst.capacidade,
        criterioAceitacao: inst.criterioAceitacao,
        numeroSerie: inst.numeroSerie,
        certificadoRbc: inst.certificadoRbc,
        laboratorio: inst.laboratorio,
        setor: inst.setor,
        operador: inst.operador || getNomeOperadorAtivo(),
        dataCalibracao: inst.dataCalibracao ? String(inst.dataCalibracao).slice(0, 10) : "",
        vencimentoCalibracao: inst.vencimentoCalibracao ? String(inst.vencimentoCalibracao).slice(0, 10) : "",
        dataChecagem: inst.dataChecagem ? String(inst.dataChecagem).slice(0, 10) : "",
        vencimentoChecagem: inst.vencimentoChecagem ? String(inst.vencimentoChecagem).slice(0, 10) : "",
        status: inst.status,
        observacoes: inst.observacoes
      });
      modalFichaAberto.value = false;
      modalCadastroAberto.value = true;
    }

    async function salvarInstrumento() {
      if (!form.instrumento.trim()) return pushToast("Informe o nome do instrumento.", "error");
      if (!form.tag.trim()) return pushToast("Informe a TAG do instrumento.", "error");

      salvando.value = true;
      try {
        const payload = {
          action: "saveCadastro",
          tipo: "calibracao_instrumento",
          id: form.id || form.tag.trim(),
          tag: form.tag.trim(),
          TAG: form.tag.trim(),
          Instrumento: form.instrumento.trim(),
          instrumento: form.instrumento.trim(),
          Marca_Modelo: form.modelo.trim(),
          modelo: form.modelo.trim(),
          Capacidade: form.capacidade.trim(),
          capacidade: form.capacidade.trim(),
          Criterio_Aceitacao: form.criterioAceitacao.trim(),
          criterioAceitacao: form.criterioAceitacao.trim(),
          Numero_Serie: form.numeroSerie.trim(),
          numeroSerie: form.numeroSerie.trim(),
          Certificado_RBC: form.certificadoRbc.trim(),
          certificado: form.certificadoRbc.trim(),
          Laboratorio: form.laboratorio.trim(),
          laboratorio: form.laboratorio.trim(),
          Setor: form.setor,
          setor: form.setor,
          Operador_Responsavel: form.operador.trim(),
          operador: form.operador.trim(),
          responsavel: form.operador.trim(),
          Data_Calibracao: form.dataCalibracao,
          dataUltimaCalibracao: form.dataCalibracao,
          Vencimento_Calibracao: form.vencimentoCalibracao,
          dataProximaCalibracao: form.vencimentoCalibracao,
          Data_Checagem: form.dataChecagem,
          Vencimento_Checagem: form.vencimentoChecagem,
          Status: form.status,
          status: form.status,
          Observacoes: form.observacoes.trim(),
          observacoes: form.observacoes.trim(),
          empresaId: "HIDROGERON"
        };

        const res = await postToAppsScript(payload);
        console.log("Resposta da gravação:", res);

        // Atualização Reativa no Estado Local
        const tagAlvo = form.tag.trim().toUpperCase();
        const indexExistente = instrumentos.value.findIndex(i => String(i.tag || i.id).toUpperCase() === tagAlvo);
        
        const itemAtualizado = {
          id: form.id || form.tag.trim(),
          tag: form.tag.trim(),
          instrumento: form.instrumento.trim(),
          modelo: form.modelo.trim(),
          capacidade: form.capacidade.trim(),
          criterioAceitacao: form.criterioAceitacao.trim(),
          numeroSerie: form.numeroSerie.trim(),
          certificadoRbc: form.certificadoRbc.trim(),
          laboratorio: form.laboratorio.trim(),
          setor: form.setor,
          operador: form.operador.trim(),
          dataCalibracao: form.dataCalibracao,
          vencimentoCalibracao: form.vencimentoCalibracao,
          dataChecagem: form.dataChecagem,
          vencimentoChecagem: form.vencimentoChecagem,
          status: form.status,
          observacoes: form.observacoes.trim(),
          statusCalculado: statusInstrumentoCalibracao(form.vencimentoCalibracao, form.status)
        };

        if (indexExistente !== -1) {
          instrumentos.value[indexExistente] = itemAtualizado;
        } else {
          instrumentos.value.unshift(itemAtualizado);
        }

        pushToast("Instrumento gravado com sucesso!", "success");
        modalCadastroAberto.value = false;
        
      } catch (e) {
        console.error("Erro ao salvar:", e);
        pushToast("Erro ao gravar instrumento.", "error");
      } finally {
        salvando.value = false;
      }
    }

    async function registrarChecagem180d(inst) {
      const resp = confirm(`Registrar checagem de 180 dias para o instrumento ${inst.tag}?`);
      if (!resp) return;
      
      const hoje = new Date().toISOString().slice(0, 10);
      const novoVenc = calcularVencimentoChecagem(hoje, "Semestral");

      try {
        await postToAppsScript({
          action: "saveCadastro",
          tipo: "checagem_180d",
          id: inst.id || inst.tag,
          tag: inst.tag,
          TAG: inst.tag,
          dataChecagem: hoje,
          Data_Checagem: hoje,
          vencimentoChecagem: novoVenc,
          Vencimento_Checagem: novoVenc,
          usuario: getNomeOperadorAtivo(),
          empresaId: "HIDROGERON"
        });

        inst.dataChecagem = hoje;
        inst.vencimentoChecagem = novoVenc;
        pushToast(`Checagem do instrumento ${inst.tag} registrada!`, "success");
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
      formatarData, badgeStatusClasse
    };
  },
  template: `
  <div class="space-y-5">
    <!-- Contadores Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
        <span class="w-3.5 h-3.5 rounded-full bg-emerald-500"></span>
        <div>
          <p class="text-xl font-extrabold text-slate-800">{{ contadores.noPrazo }}</p>
          <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">No Prazo (> 45d)</p>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
        <span class="w-3.5 h-3.5 rounded-full bg-amber-400"></span>
        <div>
          <p class="text-xl font-extrabold text-slate-800">{{ contadores.atencao }}</p>
          <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Atenção (≤ 45d)</p>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
        <span class="w-3.5 h-3.5 rounded-full bg-rose-500"></span>
        <div>
          <p class="text-xl font-extrabold text-slate-800">{{ contadores.vencidos }}</p>
          <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Vencidos</p>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
        <span class="w-3.5 h-3.5 rounded-full bg-sky-500"></span>
        <div>
          <p class="text-xl font-extrabold text-slate-800">{{ contadores.emCalibracao }}</p>
          <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Em Calibração</p>
        </div>
      </div>
    </div>

    <!-- Barra de Filtros e Busca -->
    <div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm flex flex-col sm:flex-row gap-2 items-center justify-between">
      <div class="flex-1 w-full sm:w-auto">
        <input v-model="busca" type="text" placeholder="Buscar por TAG, instrumento, modelo, setor ou operador..."
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

    <div v-if="erro" class="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 text-xs font-semibold">
      {{ erro }}
    </div>

    <div v-if="loading" class="flex justify-center py-12"><span class="spinner"></span></div>

    <!-- Tabela de Instrumentos Fiel à Planilha -->
    <div v-else class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-xs text-left">
          <thead class="bg-slate-50 text-slate-500 border-b border-slate-200 text-[10px] uppercase font-bold tracking-wide">
            <tr>
              <th class="p-3">TAG</th>
              <th class="p-3">Instrumento / Modelo</th>
              <th class="p-3">Capacidade / Critério</th>
              <th class="p-3">Setor</th>
              <th class="p-3">Operador</th>
              <th class="p-3">Data Calibração</th>
              <th class="p-3">Vencimento</th>
              <th class="p-3">Status</th>
              <th class="p-3 text-center w-28">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="inst in instrumentosFiltrados" :key="inst.id || inst.tag" class="hover:bg-slate-50/80 transition-colors">
              <td class="p-3">
                <span class="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded">{{ inst.tag }}</span>
              </td>
              <td class="p-3">
                <p class="font-bold text-slate-800 text-xs">{{ inst.instrumento }}</p>
                <p class="text-[10px] text-slate-400 mt-0.5">
                  {{ inst.modelo || 'Sem modelo' }} <span v-if="inst.certificadoRbc">· RBC: {{ inst.certificadoRbc }}</span>
                </p>
              </td>
              <td class="p-3">
                <p class="text-slate-700 font-medium">{{ inst.capacidade || '—' }}</p>
                <p class="text-[10px] text-slate-400">{{ inst.criterioAceitacao || '—' }}</p>
              </td>
              <td class="p-3 text-slate-600 font-medium">{{ inst.setor }}</td>
              <td class="p-3 text-slate-700 font-semibold">{{ inst.operador || '—' }}</td>
              <td class="p-3 text-slate-500">{{ formatarData(inst.dataCalibracao) }}</td>
              <td class="p-3 font-semibold text-slate-700">{{ formatarData(inst.vencimentoCalibracao) }}</td>
              <td class="p-3">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap inline-block" :class="badgeStatusClasse(inst.statusCalculado)">
                  {{ inst.statusCalculado }}
                </span>
              </td>
              <td class="p-3 text-center">
                <div class="flex items-center justify-center gap-1.5">
                  <button @click="abrirFicha(inst)" class="btn-tap p-1.5 text-slate-600 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors" title="Visualizar Ficha Técnica / Laudo">
                    👁️
                  </button>
                  <button @click="abrirQR(inst)" class="btn-tap p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Gerar Etiqueta com QR Code">
                    🏷️
                  </button>
                  <button @click="abrirEditar(inst)" class="btn-tap p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Editar Instrumento">
                    ✏️
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="instrumentosFiltrados.length === 0">
              <td colspan="9" class="p-8 text-center text-slate-400 font-medium">
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

    <!-- Modal Cadastro & Edição -->
    <div v-if="modalCadastroAberto" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div class="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b pb-3">
          <h3 class="font-bold text-slate-800 text-sm">{{ editando ? 'Editar Instrumento' : 'Novo Instrumento de Medição' }}</h3>
          <button @click="modalCadastroAberto = false" class="text-slate-400 hover:text-slate-600 text-xl font-bold px-1">✕</button>
        </div>

        <div class="space-y-3 text-xs">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">TAG / Código *</label>
              <input v-model="form.tag" type="text" placeholder="Ex: CAL-001" class="w-full border border-slate-300 rounded-lg p-2 font-mono uppercase" />
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Instrumento *</label>
              <input v-model="form.instrumento" type="text" placeholder="Ex: ALICATE AMPERÍMETRO" class="w-full border border-slate-300 rounded-lg p-2 uppercase" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Marca / Modelo</label>
              <input v-model="form.modelo" type="text" placeholder="Ex: MINIPA/ET-3810C" class="w-full border border-slate-300 rounded-lg p-2 uppercase" />
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Capacidade</label>
              <input v-model="form.capacidade" type="text" placeholder="Ex: 1.000 V / 1.000 A" class="w-full border border-slate-300 rounded-lg p-2" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Critério de Aceitação</label>
              <input v-model="form.criterioAceitacao" type="text" placeholder="Ex: ±6%" class="w-full border border-slate-300 rounded-lg p-2" />
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Número de Série</label>
              <input v-model="form.numeroSerie" type="text" placeholder="Ex: 4638894" class="w-full border border-slate-300 rounded-lg p-2" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Certificado RBC</label>
              <input v-model="form.certificadoRbc" type="text" placeholder="Ex: 0305A25" class="w-full border border-slate-300 rounded-lg p-2" />
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Laboratório / Fornecedor</label>
              <input v-model="form.laboratorio" type="text" placeholder="Ex: RBC / MSMI - MEDICAO" class="w-full border border-slate-300 rounded-lg p-2" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Setor</label>
              <select v-model="form.setor" class="w-full border border-slate-300 rounded-lg p-2 bg-white uppercase">
                <option v-for="s in setoresDisponiveis" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Operador Responsável</label>
              <input v-model="form.operador" type="text" placeholder="Ex: CARLOS / EDUARDO" class="w-full border border-slate-300 rounded-lg p-2 uppercase" />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Data Calibração</label>
              <input v-model="form.dataCalibracao" type="date" class="w-full border border-slate-300 rounded-lg p-2 bg-white" />
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Vencimento Calibração</label>
              <input v-model="form.vencimentoCalibracao" type="date" class="w-full border border-slate-300 rounded-lg p-2 bg-white" />
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Status</label>
              <select v-model="form.status" class="w-full border border-slate-300 rounded-lg p-2 bg-white">
                <option value="No Prazo">No Prazo</option>
                <option value="Em Calibração">Em Calibração</option>
                <option value="Vencido">Vencido</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Data da Checagem</label>
              <input v-model="form.dataChecagem" type="date" class="w-full border border-slate-300 rounded-lg p-2 bg-white" />
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Vencimento da Checagem</label>
              <input v-model="form.vencimentoChecagem" type="date" class="w-full border border-slate-300 rounded-lg p-2 bg-white" />
            </div>
          </div>

          <div>
            <label class="block font-semibold text-slate-600 mb-1">Observações</label>
            <textarea v-model="form.observacoes" rows="2" class="w-full border border-slate-300 rounded-lg p-2"></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t pt-3">
          <button @click="modalCadastroAberto = false" class="btn-tap px-3.5 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold">Cancelar</button>
          <button @click="salvarInstrumento" :disabled="salvando" class="btn-tap px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs shadow-md">
            {{ salvando ? 'Gravando...' : 'Gravar Instrumento' }}
          </button>
        </div>
      </div>
    </div>
  </div>`
};

window.CalibracaoModule = CalibracaoModule;