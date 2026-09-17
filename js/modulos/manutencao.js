/* ==========================================================================
   js/modulos/manutencao.js — Preventiva (RSG-6301-01) e Corretiva (RSG-6302-01/02)
   Versão Consolidada: Observações Gerais, Assinatura Opcional do Supervisor,
   Assinaturas no Laudo/PDF e Gravação Direta na Planilha via POST.
   ========================================================================== */
const PRIORIDADES = [
  { value: "Baixa",   color: "bg-blue-100 text-blue-700 border-blue-300" },
  { value: "Média",   color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  { value: "Alta",    color: "bg-orange-50 text-orange-700 border-orange-300" },
  { value: "Crítica", color: "bg-rose-50 text-rose-700 border-red-300" },
];

/* ==========================================================================
   NORMALIZAÇÃO DE DADOS
   ========================================================================== */
function normalizePreventivaLog(p) {
  return {
    id: p.ID_Log || p.id_log || p.ID || p.id || uid(),
    data: p.Data_Hora || p.data_hora || p.Data || p.data || "",
    area: p.Area || p.area || "",
    equipamento: p.Equipamento || p.equipamento || "",
    idEquipamento: p.ID_Equipamento || p.Id_Equipamento || p.id_equipamento || "",
    usuario: p.Usuario || p.usuario || "",
    status: normalizeStatusInspecao(p.Status || p.status || p.Status_Inspecao || p.status_inspecao || ""),
    observacoes: p.Observacoes || p.observacoes || p.Obs || "",
  };
}

function normalizeCorretivaChamado(c) {
  return {
    id: c.ID_Chamado || c.id_chamado || c.ID || c.id || uid(),
    data: c.Data_Abertura || c.data_abertura || c.Data || c.data || "",
    area: c.Area || c.area || "",
    equipamento: c.Equipamento || c.equipamento || "",
    descricao: c.Descricao_Problema || c.descricao_problema || c.Descricao || "",
    prioridade: c.Prioridade || c.prioridade || "Média",
    solicitante: c.Solicitante || c.solicitante || "",
    status: c.Status_Chamado || c.status_chamado || c.Status || "Aberto",
    dataConclusao: c.DataConclusao || c.dataConclusao || c.DataFechamento || c.dataFechamento || "",
    resolucao: c.Resolucao || c.resolucao || "",
    tecnico: c.Tecnico || c.tecnico || "",
  };
}

function extractPreventivas(data) {
  const raw = (data && (data.preventivas || data.Preventivas || (data.data && data.data.preventivas))) || [];
  return (Array.isArray(raw) ? raw : []).map(normalizePreventivaLog);
}

function extractCorretivas(data) {
  const raw = (data && (data.chamados || data.Chamados || data.corretivas || data.Corretivas
    || (data.data && (data.data.chamados || data.data.corretivas)))) || [];
  return (Array.isArray(raw) ? raw : []).filter(c => {
    const id = (c.ID_Chamado || c.id_chamado || c.ID || c.id || "").toString().trim();
    const eq = (c.Equipamento || c.equipamento || "").toString().trim();
    return id !== "" && eq !== "";
  }).map(normalizeCorretivaChamado);
}

function isStatusChamadoAberto(status) {
  const s = String(status || "").trim().toLowerCase();
  return s === "aberto" || s === "em andamento";
}

/* ==========================================================================
   ASSINATURA DIGITAL EM TELA
   ========================================================================== */
const AssinaturaCanvas = {
  props: { label: String, required: Boolean },
  emits: ["update"],
  setup(props, { emit }) {
    const canvasRef = ref(null);
    const temTraco = ref(false);
    let ctx = null;
    let desenhando = false;

    function posicaoRelativa(e) {
      const rect = canvasRef.value.getBoundingClientRect();
      const ponto = e.touches && e.touches.length ? e.touches[0] : e;
      return { x: ponto.clientX - rect.left, y: ponto.clientY - rect.top };
    }

    function iniciarTraco(e) {
      e.preventDefault();
      desenhando = true;
      const p = posicaoRelativa(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    }

    function continuarTraco(e) {
      if (!desenhando) return;
      e.preventDefault();
      const p = posicaoRelativa(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      temTraco.value = true;
    }

    function finalizarTraco() {
      if (!desenhando) return;
      desenhando = false;
      emit("update", canvasRef.value.toDataURL("image/png"));
    }

    function limpar() {
      const c = canvasRef.value;
      ctx.clearRect(0, 0, c.width, c.height);
      temTraco.value = false;
      emit("update", null);
    }

    onMounted(() => {
      const c = canvasRef.value;
      const dpr = window.devicePixelRatio || 1;
      c.width = c.clientWidth * dpr;
      c.height = 130 * dpr;
      ctx = c.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    });

    return { canvasRef, temTraco, iniciarTraco, continuarTraco, finalizarTraco, limpar };
  },
  template: `
  <div>
    <div class="flex items-center justify-between mb-1">
      <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {{ label }} <span v-if="required" class="text-rose-500">*</span>
      </label>
      <button type="button" @click="limpar" class="text-xs text-sky-600 font-semibold btn-tap">Limpar</button>
    </div>
    <canvas ref="canvasRef"
      class="w-full block bg-white border-2 rounded-lg touch-none cursor-crosshair"
      :class="temTraco ? 'border-emerald-300' : 'border-dashed border-slate-300'"
      style="height:130px"
      @mousedown="iniciarTraco" @mousemove="continuarTraco" @mouseup="finalizarTraco" @mouseleave="finalizarTraco"
      @touchstart="iniciarTraco" @touchmove="continuarTraco" @touchend="finalizarTraco"></canvas>
    <p v-if="!temTraco" class="text-[11px] text-slate-400 mt-1">Assine com o dedo ou mouse na área acima.</p>
  </div>`
};

/* ==========================================================================
   HELPERS & TI FALLBACK
   ========================================================================== */
function parseItensInspecao(str) {
  return String(str || "").split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
}

function normalizeStatusInspecao(s) {
  const v = String(s || "").trim().toLowerCase();
  if (v === "c" || v === "conforme") return "C";
  if (v === "nc" || v === "não conforme" || v === "nao conforme") return "NC";
  if (v === "na" || v === "não aplicável" || v === "nao aplicavel") return "NA";
  return null;
}

const AREA_TI = "Tecnologia da Informação";
const PRESTADOR_TI = "IRONTECH";
function ehAreaTI(area) {
  return normalizarTexto(area) === normalizarTexto(AREA_TI);
}

const ITENS_INSPECAO_TI = {
  [normalizarTexto("Servidor Central")]: [
    "Integridade do Hardware", "Rotinas e Logs de Backup", "Espaço e Monitoramento de Disco", "Temperatura e Redundância"
  ],
  [normalizarTexto("Terminais de Trabalho")]: [
    "Atualização de SO e Softwares", "Status Antivírus / Segurança", "Licenciamento", "Desempenho Geral"
  ],
  [normalizarTexto("Servidor em Nuvem (OneDrive)")]: [
    "Sincronização e Integridade de Dados", "Permissões e Controle de Acessos", "Cota de Armazenamento", "Políticas de Retenção e Lixeira"
  ],
  [normalizarTexto("Software Onqualit")]: [
    "Disponibilidade e Acessibilidade do Sistema Onqualit", "Integridade da Base de Dados e Módulos do SGQ",
    "Rotinas de Exportação / Backup de Segurança dos Registros", "Gestão de Licenças e Usuários Ativos"
  ]
};

function itensInspecaoTI(nomeAtivo) {
  return ITENS_INSPECAO_TI[normalizarTexto(nomeAtivo)] || null;
}

const EQUIPAMENTOS_TI_FALLBACK = [
  { ID: "EQ-TI-01", Nome: "Servidor Central", Area: AREA_TI, Modelo: "Hardware / Sistema", Periodicidade: "Mensal" },
  { ID: "EQ-TI-02", Nome: "Terminais de Trabalho", Area: AREA_TI, Modelo: "Software / SO", Periodicidade: "Mensal" },
  { ID: "EQ-TI-03", Nome: "Servidor em Nuvem (OneDrive)", Area: AREA_TI, Modelo: "Cloud Storage / M365", Periodicidade: "Mensal" },
  { ID: "EQ-TI-04", Nome: "Software Onqualit", Area: AREA_TI, Modelo: "Sistema de Gestão da Qualidade (SaaS / Web)", Periodicidade: "Mensal" }
].map(eq => ({ ...eq, Itens_Inspecao_Recomendados: (itensInspecaoTI(eq.Nome) || []).join(", ") }));

function comFallbackEquipamentosTI(rawEquip) {
  const lista = Array.isArray(rawEquip) ? rawEquip.slice() : [];
  const nomesExistentes = new Set(lista.map(e => normalizarTexto(e.Nome || e.Equipamento || e.nome || e.equipamento || "")));
  EQUIPAMENTOS_TI_FALLBACK.forEach(fb => {
    if (!nomesExistentes.has(normalizarTexto(fb.Nome))) lista.push(fb);
  });
  return lista;
}

const MESES_PT = [
  { v: 1, l: "Janeiro" }, { v: 2, l: "Fevereiro" }, { v: 3, l: "Março" }, { v: 4, l: "Abril" },
  { v: 5, l: "Maio" }, { v: 6, l: "Junho" }, { v: 7, l: "Julho" }, { v: 8, l: "Agosto" },
  { v: 9, l: "Setembro" }, { v: 10, l: "Outubro" }, { v: 11, l: "Novembro" }, { v: 12, l: "Dezembro" }
];

const PERIODICIDADES_ORDEM = ["Diária", "Semanal", "Quinzenal", "Mensal", "Bimestral", "Trimestral", "Semestral", "Anual"];
const PERIODICIDADE_STEP_MESES = {
  "diária": 1, "diaria": 1, "semanal": 1, "quinzenal": 1,
  "mensal": 1, "bimestral": 2, "trimestral": 3, "semestral": 6, "anual": 12
};

function normalizePeriodicidade(raw) {
  const v = String(raw || "").trim().toLowerCase();
  const enc = PERIODICIDADES_ORDEM.find(p => p.toLowerCase() === v);
  return enc || String(raw || "").trim();
}

function stepMesesPeriodicidade(p) {
  return PERIODICIDADE_STEP_MESES[String(p || "").trim().toLowerCase()] || 1;
}

const PERIODICIDADE_TAG = {
  "diária": "D", "diaria": "D", "semanal": "Sm", "quinzenal": "Q",
  "mensal": "M", "bimestral": "B", "trimestral": "T", "semestral": "S", "anual": "A"
};

function tagPeriodicidade(p) {
  return PERIODICIDADE_TAG[String(p || "").trim().toLowerCase()] || (p ? String(p).trim().charAt(0).toUpperCase() : "?");
}

function mesesProgramadosEquipamento(eq) {
  const step = stepMesesPeriodicidade(eq.periodicidade);
  if (step <= 1) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const ancora = eq.mesReferencia || 1;
  const meses = [];
  for (let m = ancora; m <= ancora + 12 - step; m += step) {
    meses.push(((m - 1) % 12) + 1);
  }
  return Array.from(new Set(meses)).sort((a, b) => a - b);
}

function corPeriodicidadeItem(p) {
  const v = String(p || "").trim().toLowerCase();
  if (v === "mensal") return "bg-blue-100 text-blue-700";
  if (v === "semestral") return "bg-orange-50 text-orange-700";
  if (v === "anual") return "bg-purple-100 text-purple-700";
  return "bg-slate-100 text-slate-600";
}

/* ==========================================================================
   LAUDO PREVENTIVA (RSG-6301-01) — COM RENDERIZAÇÃO REAL DAS ASSINATURAS
   ========================================================================== */
const RSG_TITULO = "RSG-6301-01 - Checklist Manutenção Preventiva";

const LaudoPreventivaModal = {
  props: { laudo: Object, modoPosSalvar: Boolean },
  emits: ["fechar", "nova-inspecao", "ir-inicio"],
  setup(props) {
    const exportandoPdf = ref(false);

    function formatarDataHora(v) {
      if (!v) return "-";
      const d = v instanceof Date ? v : new Date(v);
      return isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    function formatarStatusItem(s) {
      return s === "C" ? "Conforme" : (s === "NC" ? "Não Conforme" : "Não Aplicável");
    }

    const CONDICAO_INFO = {
      C: { icone: "✓", classe: "bg-emerald-50 text-emerald-700" },
      NC: { icone: "✗", classe: "bg-rose-50 text-rose-700" },
      NA: { icone: "⚪", classe: "bg-amber-50 text-amber-700" }
    };
    function condicaoInfo(s) { return CONDICAO_INFO[s] || { icone: "—", classe: "bg-slate-200 text-slate-600" }; }

    function imprimir() { window.print(); }

    function exportarPDF() {
      if (typeof window.jspdf === "undefined" || typeof window.html2canvas === "undefined") {
        return pushToast("Biblioteca PDF indisponível.", "error");
      }
      const el = document.getElementById("laudo-imprimivel");
      if (!el) return;
      exportandoPdf.value = true;
      const doc = new window.jspdf.jsPDF("p", "pt", "a4");
      doc.html(el, {
        margin: [20, 20, 20, 20],
        autoPaging: "text",
        html2canvas: { scale: 0.72, useCORS: true, backgroundColor: "#ffffff" },
        width: 555,
        windowWidth: el.scrollWidth || 780,
        callback: (d) => {
          d.save(`RSG-6301-01_${props.laudo?.idLog || "preventiva"}.pdf`);
          exportandoPdf.value = false;
        }
      });
    }

    return { exportandoPdf, formatarDataHora, formatarStatusItem, condicaoInfo, imprimir, exportarPDF, RSG_TITULO };
  },
  template: `
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4">
    <div class="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] overflow-y-auto">
      <div class="no-print sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
        <h3 class="font-bold text-slate-800">Ficha de Inspeção Técnica</h3>
        <button v-if="!modoPosSalvar" @click="$emit('fechar')" class="text-slate-400 hover:text-slate-600 text-xl px-2">✕</button>
      </div>

      <div id="laudo-imprimivel" class="p-6 space-y-4" v-if="laudo">
        <!-- Cabeçalho -->
        <div class="border-b-2 border-slate-800 pb-3">
          <p class="text-xs font-bold text-sky-700 uppercase tracking-wide">Hidrogeron - Sistema de Manutenção</p>
          <h2 class="text-lg font-extrabold text-slate-900 mt-0.5">{{ RSG_TITULO }}</h2>
          <div class="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-500">
            <p><span class="font-semibold text-slate-700">Protocolo/Log ID:</span> #{{ laudo.idLog }}</p>
            <p><span class="font-semibold text-slate-700">Data/Hora:</span> {{ formatarDataHora(laudo.dataHora) }}</p>
          </div>
        </div>

        <!-- Dados do Ativo -->
        <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 text-sm grid grid-cols-2 gap-2">
          <p><span class="text-slate-400">Setor/Área:</span> <strong>{{ laudo.area }}</strong></p>
          <p><span class="text-slate-400">Equipamento:</span> <strong>{{ laudo.equipamentoNome }}</strong></p>
          <p><span class="text-slate-400">Executor/Inspetor:</span> {{ laudo.inspetor }}</p>
          <p><span class="text-slate-400">Status Geral:</span> <strong :class="laudo.statusGeral === 'Não Conforme' ? 'text-rose-600' : 'text-emerald-600'">{{ laudo.statusGeral }}</strong></p>
        </div>

        <!-- Matriz de Itens -->
        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Matriz de Verificação</h4>
          <div class="border border-slate-200 rounded-lg overflow-hidden">
            <table class="w-full text-xs border-collapse">
              <thead>
                <tr class="bg-slate-100 text-slate-600 text-[10px] uppercase">
                  <th class="text-left p-2 border border-slate-200">Item de Inspeção</th>
                  <th class="text-center p-2 border border-slate-200 w-24">Condição</th>
                  <th class="text-left p-2 border border-slate-200">Observações / Desvios</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in laudo.itens" :key="idx">
                  <td class="p-2 border border-slate-200 text-slate-700">{{ item.texto }}</td>
                  <td class="p-2 border border-slate-200 text-center font-bold">
                    <span class="px-2 py-0.5 rounded-full" :class="condicaoInfo(item.status).classe">{{ formatarStatusItem(item.status) }}</span>
                  </td>
                  <td class="p-2 border border-slate-200 text-slate-600">{{ item.observacao || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Observações Gerais Registradas -->
        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Observações e Apontamentos</h4>
          <p class="bg-slate-50 rounded-lg border border-slate-200 p-3 text-xs text-slate-700 whitespace-pre-line">
            {{ laudo.observacoes || 'Nenhuma observação adicional.' }}
          </p>
        </div>

        <!-- Rodapé de Validação e Assinaturas -->
        <div class="pt-4 border-t border-slate-200">
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Validação & Responsabilidade</h4>
          <div class="grid grid-cols-2 gap-6 text-xs text-slate-500">
            <div>
              <div class="h-16 flex items-end justify-center pb-1 border-b border-slate-400 bg-slate-50/50 rounded-t">
                <img v-if="laudo.assinaturaInspetor" :src="laudo.assinaturaInspetor" class="h-14 object-contain" alt="Assinatura Inspetor" />
                <span v-else class="text-slate-300 italic text-[11px] mb-2">(Assinatura não coletada)</span>
              </div>
              <p class="mt-1 font-semibold text-slate-700 text-center">Técnico / Inspetor Responsável</p>
              <p class="mt-1 text-center text-slate-600 font-medium">{{ laudo.inspetor || '-' }}</p>
              <p class="text-center text-[11px] text-slate-400 mt-0.5">Data: {{ formatarDataHora(laudo.dataHora) }}</p>
            </div>
            <div>
              <div class="h-16 flex items-end justify-center pb-1 border-b border-slate-400 bg-slate-50/50 rounded-t">
                <img v-if="laudo.assinaturaSupervisor" :src="laudo.assinaturaSupervisor" class="h-14 object-contain" alt="Assinatura Supervisor" />
                <span v-else class="text-slate-300 italic text-[11px] mb-2">(Assinatura não coletada)</span>
              </div>
              <p class="mt-1 font-semibold text-slate-700 text-center">Supervisão / Gestão da Área</p>
              <p class="mt-1 text-center text-slate-600 font-medium">{{ laudo.assinaturaSupervisorNome || 'Não informado' }}</p>
              <p class="text-center text-[11px] text-slate-400 mt-0.5">Data: {{ laudo.assinaturaSupervisor ? formatarDataHora(laudo.dataHora) : '—' }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="no-print px-5 pb-5 pt-2 grid grid-cols-2 gap-2 sticky bottom-0 bg-white border-t mt-2">
        <button @click="imprimir" class="btn-tap bg-slate-800 text-white font-semibold py-2.5 rounded-lg text-sm">🖨️ Imprimir</button>
        <button @click="exportarPDF" :disabled="exportandoPdf" class="btn-tap bg-red-600 text-white font-semibold py-2.5 rounded-lg text-sm">📄 Exportar PDF</button>
        <template v-if="modoPosSalvar">
          <button @click="$emit('nova-inspecao')" class="btn-tap bg-sky-600 text-white font-semibold py-2.5 rounded-lg text-sm">📋 Nova Inspeção</button>
          <button @click="$emit('ir-inicio')" class="btn-tap bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm">🏠 Início</button>
        </template>
        <button v-else @click="$emit('fechar')" class="btn-tap col-span-2 bg-slate-100 text-slate-700 font-semibold py-2.5 rounded-lg text-sm">Fechar</button>
      </div>
    </div>
  </div>`
};

/* ==========================================================================
   MÓDULO PREVENTIVA (CORE)
   ========================================================================== */
const PreventivaModule = {
  props: { user: Object },
  emits: ["go-home"],
  components: { LaudoPreventivaModal, AssinaturaCanvas, AlertaWhatsAppModal },
  setup(props, { emit }) {
    const meses = MESES_PT;
    const todosEquipamentos = ref([]);
    const areas = computed(() => unirAreas(todosEquipamentos.value));
    const preventivasHistorico = ref([]);
    const loadingDados = ref(false);
    const erroCarregamento = ref("");

    const view = ref("setores");
    const areaSelecionada = ref(null);
    const equipamentoSelecionado = ref(null);
    const itensChecklist = ref([]);
    const blocosChecklist = ref([]);
    const observacoesGerais = ref("");
    const salvando = ref(false);
    const inputCameraRef = ref(null);
    const inputGaleriaRef = ref(null);
    const itemFotoAlvo = ref(null);

    const nomeExecutor = ref("");
    const assinaturaInspetor = ref(null);
    const assinaturaSupervisor = ref(null);
    const assinaturaSupervisorNome = ref("");
    function onAssinaturaInspetor(dataUrl) { assinaturaInspetor.value = dataUrl; }
    function onAssinaturaSupervisor(dataUrl) { assinaturaSupervisor.value = dataUrl; }

    const laudoAberto = ref(false);
    const laudoAtual = ref(null);
    const laudoModoPosSalvar = ref(false);

    const alertaWhatsAppAberto = ref(false);
    const alertaWhatsAppDados = ref(null);
    function fecharAlertaWhatsApp() { alertaWhatsAppAberto.value = false; }

    async function carregarDados(opts) {
      const silencioso = opts && opts.silencioso;
      if (!silencioso) {
        loadingDados.value = true;
        erroCarregamento.value = "";
      }
      try {
        const data = await getInitialData();
        const todos = comFallbackEquipamentosTI(data.equipamentos || data.Equipamentos || (data.data && data.data.equipamentos) || []);
        todosEquipamentos.value = todos.map(e => ({
          id: e.ID || e.Id || e.id || uid(),
          idDisplay: e.ID || e.Id || e.id || "",
          nome: e.Nome || e.Equipamento || e.nome || "Equipamento",
          modelo: e.Modelo || e.modelo || "",
          tag: e.TAG || e.Tag || e.tag || "",
          area: e.Area || e.area || "",
          periodicidade: normalizePeriodicidade(e.Periodicidade || e.periodicidade || e.Frequencia || e.frequencia || ""),
          mesReferencia: parseInt(e.Mes_Referencia || e.mes_referencia || 1, 10) || 1,
          itensInspecao: e.Itens_Inspecao_Recomendados || e.itens_inspecao_recomendados || ""
        }));
        preventivasHistorico.value = extractPreventivas(data);
      } catch (err) {
        console.error("Erro ao sincronizar dados:", err);
        if (!silencioso) erroCarregamento.value = "Não foi possível carregar os dados.";
      } finally {
        if (!silencioso) loadingDados.value = false;
      }
    }

    function chaveAtivo(eq) {
      return eq.idDisplay ? "id:" + String(eq.idDisplay).trim().toLowerCase() : "nome:" + String(eq.nome).trim().toLowerCase() + "|" + String(eq.area).trim().toLowerCase();
    }

    const ativosAgrupados = computed(() => {
      const grupos = new Map();
      todosEquipamentos.value.forEach(row => {
        const chave = chaveAtivo(row);
        if (!grupos.has(chave)) {
          grupos.set(chave, { chave, idDisplay: row.idDisplay, nome: row.nome, modelo: row.modelo, tag: row.tag, area: row.area, perfis: [] });
        }
        grupos.get(chave).perfis.push(row);
      });
      return Array.from(grupos.values());
    });

    function ativosDaArea(area) {
      const alvo = String(area || "").trim().toLowerCase();
      return ativosAgrupados.value.filter(a => a.area.trim().toLowerCase() === alvo);
    }
    const equipamentosDaAreaAtual = computed(() => ativosDaArea(areaSelecionada.value));

    function ultimaInspecao(eq) {
      let melhor = null;
      preventivasHistorico.value.forEach(p => {
        if (!equipamentoLogCorrespondeAoAtivo(p.equipamento, eq)) return;
        if (!areasCorrespondem(p.area, eq.area)) return;
        const d = new Date(p.data);
        if (isNaN(d.getTime())) return;
        if (!melhor || d > melhor.dataObj) {
          melhor = { dataObj: d, status: p.status };
        }
      });
      return melhor;
    }

    function logNoMes(ativo, ano, mes) {
      return preventivasHistorico.value.some(p => {
        if (!equipamentoLogCorrespondeAoAtivo(p.equipamento, ativo)) return false;
        if (!areasCorrespondem(p.area, ativo.area)) return false;
        const d = new Date(p.data);
        if (isNaN(d.getTime())) return false;
        return d.getFullYear() === ano && (d.getMonth() + 1) === mes;
      });
    }

    function dataPlanejadaMes(ano, mes) { return getThirdThursday(ano, mes - 1); }

    function statusCicloEquipamento(ativo) {
      const info = ultimaInspecao(ativo);
      if (info && info.status === "NC") {
        return { label: "⚠ Não Conforme", badge: "bg-rose-50 text-rose-700 border border-red-200", tipo: "nc" };
      }
      const agora = new Date();
      const anoAtual = agora.getFullYear();
      const mesAtual = agora.getMonth() + 1;
      const perfis = ativo.perfis || [ativo];

      let atrasado = false;
      perfis.forEach(perfil => {
        mesesProgramadosEquipamento(perfil).forEach(mes => {
          if (mes > mesAtual) return;
          if (logNoMes(ativo, anoAtual, mes)) return;
          if (dataPlanejadaMes(anoAtual, mes).getTime() < Date.now()) atrasado = true;
        });
      });

      if (atrasado) return { label: "✗ Atrasado", badge: "bg-rose-50 text-rose-700 border border-red-200", tipo: "vencido" };
      return { label: "✓ Em dia", badge: "bg-emerald-50 text-emerald-700 border border-emerald-200", tipo: "em_dia" };
    }

    const statsPorArea = computed(() => {
      return areas.value.map(a => {
        const lista = ativosDaArea(a);
        const pendentes = lista.filter(ativo => {
          const tipo = statusCicloEquipamento(ativo).tipo;
          return tipo === "vencido" || tipo === "nc";
        }).length;
        return { area: a, total: lista.length, pendentes };
      });
    });

    const progressoSetor = computed(() => {
      const lista = equipamentosDaAreaAtual.value;
      if (lista.length === 0) return { feitos: 0, total: 0, pct: 0 };
      const feitos = lista.filter(eq => {
        const tipo = statusCicloEquipamento(eq).tipo;
        return tipo !== "vencido" && tipo !== "nc";
      }).length;
      return { feitos, total: lista.length, pct: Math.round((feitos / lista.length) * 100) };
    });

    function abrirArea(area) { areaSelecionada.value = area; view.value = "lista"; }
    function voltarSetores() { areaSelecionada.value = null; view.value = "setores"; }

    function abrirEquipamento(eq) {
      const chave = chaveAtivo(eq);
      const ativo = ativosAgrupados.value.find(a => a.chave === chave) || { ...eq, perfis: [eq] };
      equipamentoSelecionado.value = ativo;
      const mesAtual = new Date().getMonth() + 1;
      const blocos = [];

      ativo.perfis.forEach(perfil => {
        if (!mesesProgramadosEquipamento(perfil).includes(mesAtual)) return;
        const textosItens = itensInspecaoTI(ativo.nome) || parseItensInspecao(perfil.itensInspecao);
        const itens = textosItens.map(texto => ({
          texto, status: null, periodicidade: perfil.periodicidade,
          observacao: "", fotoBase64: null, fotoNome: ""
        }));
        if (itens.length) blocos.push({ periodicidade: perfil.periodicidade || "Geral", itens });
      });

      blocosChecklist.value = blocos;
      itensChecklist.value = blocos.flatMap(b => b.itens);
      nomeExecutor.value = ehAreaTI(ativo.area) ? PRESTADOR_TI : (props.user?.nome || "Eduardo Henrique Pereira");
      observacoesGerais.value = "";
      assinaturaInspetor.value = null;
      assinaturaSupervisor.value = null;
      assinaturaSupervisorNome.value = "";
      view.value = "detalhe";
    }

    function voltarLista() {
      view.value = "lista";
      equipamentoSelecionado.value = null;
      itensChecklist.value = [];
      blocosChecklist.value = [];
    }

    function setItemStatus(item, val) { item.status = item.status === val ? null : val; }

    const temNC = computed(() => itensChecklist.value.some(i => i.status === "NC"));

    function abrirCameraItem(item) { itemFotoAlvo.value = item; inputCameraRef.value && inputCameraRef.value.click(); }
    function abrirGaleriaItem(item) { itemFotoAlvo.value = item; inputGaleriaRef.value && inputGaleriaRef.value.click(); }
    function onFotoSelecionada(e) {
      const file = e.target.files && e.target.files[0];
      const alvo = itemFotoAlvo.value;
      if (!file || !alvo) return;
      const reader = new FileReader();
      reader.onload = () => { alvo.fotoBase64 = reader.result; alvo.fotoNome = file.name; };
      reader.readAsDataURL(file);
      e.target.value = "";
    }
    function removerFotoItem(item) { item.fotoBase64 = null; item.fotoNome = ""; }

    /* ======================================================================
       GRAVAÇÃO COM SUPERVISOR OPCIONAL E ASSINATURAS NO LAUDO
       ====================================================================== */
    async function salvarInspecao() {
      const pendentes = itensChecklist.value.filter(i => !i.status);
      if (itensChecklist.value.length === 0) return pushToast("Nenhum item cadastrado para inspecionar.", "error");
      if (pendentes.length > 0) return pushToast(`Faltam ${pendentes.length} item(ns) para classificar.`, "error");

      const ncSemDescricao = itensChecklist.value.some(i => i.status === "NC" && !i.observacao.trim());
      if (ncSemDescricao) return pushToast("Descreva o desvio nos itens Não Conformes.", "error");

      if (!nomeExecutor.value.trim()) return pushToast("Informe o nome de quem executou a inspeção.", "error");
      
      // Validação obrigatória APENAS de quem inspecionou
      if (!assinaturaInspetor.value) {
        return pushToast("Colete a assinatura do técnico/inspetor responsável.", "error");
      }

      salvando.value = true;
      try {
        const idLog = "LOG-" + Date.now();
        const dataHora = new Date().toISOString().replace("T", " ").substring(0, 16);
        const statusInspecao = temNC.value ? "Não Conforme" : "Conforme";

        const partesObs = [];
        itensChecklist.value.forEach(item => {
          if (item.status === "NC" || item.status === "NA") {
            partesObs.push(`[${item.status}] ${item.texto}: ${item.observacao.trim()}`);
          }
        });
        if (observacoesGerais.value.trim()) partesObs.push(observacoesGerais.value.trim());
        const observacoesFinal = partesObs.join(" | ") || "Checklist preventivo realizado conforme plano RSG-6301-01.";

        const equipamentoNome = equipamentoSelecionado.value.nome;
        const areaAtual = areaSelecionada.value;
        const usuarioNome = nomeExecutor.value.trim();

        // 1. Gravação no Google Sheets (POST)
        const payloadPost = {
          action: "savePreventiva",
          idLog: idLog,
          dataHora: dataHora,
          area: areaAtual,
          equipamento: equipamentoNome,
          usuario: usuarioNome,
          statusInspecao: statusInspecao,
          observacoes: observacoesFinal,
          empresaId: "HIDROGERON"
        };

        await postToAppsScript(payloadPost);

        // 2. Atualização imediata no estado local
        const novoLog = {
          id: idLog,
          data: dataHora,
          area: areaAtual,
          equipamento: equipamentoNome,
          idEquipamento: equipamentoSelecionado.value.idDisplay || "",
          usuario: usuarioNome,
          status: temNC.value ? "NC" : "C",
          observacoes: observacoesFinal
        };
        preventivasHistorico.value.unshift(novoLog);

        pushToast("Inspeção gravada com sucesso!", "success");

        // 3. Monta o Laudo completo com as assinaturas para exibição e PDF
        laudoAtual.value = {
          idLog,
          dataHora,
          area: areaAtual,
          equipamentoIdDisplay: equipamentoSelecionado.value.idDisplay,
          equipamentoNome,
          modelo: equipamentoSelecionado.value.modelo,
          inspetor: usuarioNome,
          statusGeral: statusInspecao,
          itens: itensChecklist.value.map(i => ({ texto: i.texto, status: i.status, observacao: i.observacao })),
          observacoes: observacoesFinal,
          assinaturaInspetor: assinaturaInspetor.value,
          assinaturaSupervisor: assinaturaSupervisor.value,
          assinaturaSupervisorNome: assinaturaSupervisorNome.value.trim()
        };
        laudoModoPosSalvar.value = true;
        laudoAberto.value = true;

        setTimeout(() => carregarDados({ silencioso: true }), 2000);

      } catch (err) {
        console.error("Falha ao gravar preventiva:", err);
        pushToast("Erro ao gravar na planilha.", "error");
      } finally {
        salvando.value = false;
      }
    }

    onMounted(carregarDados);

    return {
      areas, view, areaSelecionada, equipamentoSelecionado, loadingDados, erroCarregamento,
      statsPorArea, equipamentosDaAreaAtual, progressoSetor, itensChecklist, blocosChecklist,
      observacoesGerais, salvando, nomeExecutor, inputCameraRef, inputGaleriaRef,
      assinaturaSupervisorNome, onAssinaturaInspetor, onAssinaturaSupervisor,
      abrirArea, voltarSetores, abrirEquipamento, voltarLista, setItemStatus,
      abrirCameraItem, abrirGaleriaItem, onFotoSelecionada, removerFotoItem, salvarInspecao,
      ultimaInspecao, statusCicloEquipamento,
      laudoAberto, laudoAtual, laudoModoPosSalvar, fecharLaudo: () => { laudoAberto.value = false; },
      laudoNovaInspecao: () => { laudoAberto.value = false; voltarLista(); },
      laudoIrInicio: () => { laudoAberto.value = false; emit("go-home"); },
      alertaWhatsAppAberto, alertaWhatsAppDados, fecharAlertaWhatsApp
    };
  },
  template: `
  <div class="space-y-5">
    <nav class="flex items-center gap-1.5 text-xs font-medium text-slate-400 flex-wrap">
      <button @click="$emit('go-home')" class="hover:text-sky-600 btn-tap">Início</button>
      <span>›</span>
      <button @click="voltarSetores" class="hover:text-sky-600 btn-tap font-semibold text-slate-700">Preventiva</button>
      <template v-if="areaSelecionada && (view === 'lista' || view === 'detalhe')">
        <span>›</span>
        <button @click="abrirArea(areaSelecionada)" class="hover:text-sky-600 btn-tap font-semibold text-slate-700">{{ areaSelecionada }}</button>
      </template>
      <template v-if="view === 'detalhe' && equipamentoSelecionado">
        <span>›</span>
        <span class="text-slate-700 font-semibold">{{ equipamentoSelecionado.nome }}</span>
      </template>
    </nav>

    <!-- NÍVEL 0: Setores -->
    <template v-if="view === 'setores'">
      <div v-if="loadingDados" class="flex justify-center py-12"><span class="spinner"></span></div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div v-for="s in statsPorArea" :key="s.area" class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 class="font-bold text-slate-800 text-base mb-3">{{ s.area }}</h3>
          <div class="flex items-center gap-6 mb-4">
            <div>
              <p class="text-2xl font-extrabold text-slate-700">{{ s.total }}</p>
              <p class="text-[11px] text-slate-400 uppercase font-semibold">Equipamentos</p>
            </div>
            <div>
              <p class="text-2xl font-extrabold" :class="s.pendentes > 0 ? 'text-amber-600' : 'text-emerald-600'">{{ s.pendentes }}</p>
              <p class="text-[11px] text-slate-400 uppercase font-semibold">Pendentes no ciclo</p>
            </div>
          </div>
          <button @click="abrirArea(s.area)" class="btn-tap w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 rounded-lg text-sm">
            Acessar Área →
          </button>
        </div>
      </div>
    </template>

    <!-- NÍVEL 1: Lista da Área -->
    <template v-else-if="view === 'lista'">
      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex justify-between text-xs font-semibold text-slate-500 mb-1">
          <span>Progresso do setor</span>
          <span>{{ progressoSetor.feitos }}/{{ progressoSetor.total }}</span>
        </div>
        <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full bg-emerald-500" :style="{ width: progressoSetor.pct + '%' }"></div>
        </div>
      </div>

      <div class="space-y-3">
        <button v-for="eq in equipamentosDaAreaAtual" :key="eq.chave" @click="abrirEquipamento(eq)"
          class="w-full text-left btn-tap bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="font-semibold text-slate-800"><span v-if="eq.idDisplay" class="text-slate-400 font-mono text-sm mr-1">[{{ eq.idDisplay }}]</span>{{ eq.nome }}</p>
            <p class="text-xs text-slate-400 mt-1">Status: {{ statusCicloEquipamento(eq).label }}</p>
          </div>
          <span class="text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap" :class="statusCicloEquipamento(eq).badge">
            {{ statusCicloEquipamento(eq).label }}
          </span>
        </button>
      </div>
    </template>

    <!-- NÍVEL 2: Execução do Checklist -->
    <template v-else-if="view === 'detalhe' && equipamentoSelecionado">
      <button @click="voltarLista" class="btn-tap text-sm font-semibold text-slate-600">← Voltar</button>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <p class="font-bold text-slate-800"><span v-if="equipamentoSelecionado.idDisplay">[{{ equipamentoSelecionado.idDisplay }}] </span>{{ equipamentoSelecionado.nome }}</p>
        <p class="text-xs text-slate-400">Área: {{ areaSelecionada }}</p>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">Executor / Inspetor *</label>
        <input v-model="nomeExecutor" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500" />
      </div>

      <div class="space-y-3">
        <template v-for="bloco in blocosChecklist" :key="bloco.periodicidade">
          <div v-for="(item, idx) in bloco.itens" :key="idx" class="bg-white rounded-xl border border-slate-200 p-4">
            <p class="font-semibold text-slate-800 mb-3">{{ item.texto }}</p>
            <div class="grid grid-cols-3 gap-2">
              <button @click="setItemStatus(item, 'C')" class="py-2 rounded-lg font-bold text-sm border-2" :class="item.status === 'C' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-emerald-50 text-emerald-700'">✓ C</button>
              <button @click="setItemStatus(item, 'NC')" class="py-2 rounded-lg font-bold text-sm border-2" :class="item.status === 'NC' ? 'bg-red-500 border-red-500 text-white' : 'bg-red-50 text-red-700'">✗ NC</button>
              <button @click="setItemStatus(item, 'NA')" class="py-2 rounded-lg font-bold text-sm border-2" :class="item.status === 'NA' ? 'bg-slate-500 border-slate-500 text-white' : 'bg-slate-100 text-slate-600'">- NA</button>
            </div>
            <div v-if="item.status === 'NC'" class="mt-3 space-y-2">
              <textarea v-model="item.observacao" placeholder="Descreva o desvio encontrado..." class="w-full border rounded-lg p-2 text-xs focus:ring-2 focus:ring-red-500"></textarea>
            </div>
          </div>
        </template>

        <!-- Campo de Observações Gerais Restaurado -->
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">Observações Gerais (Opcional)</label>
          <textarea v-model="observacoesGerais" rows="3" placeholder="Informações complementares, anomalias, solicitações ou apontamentos sobre o equipamento..."
            class="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-2 focus:ring-sky-500"></textarea>
        </div>

        <!-- Assinaturas (Inspetor Obrigatório, Supervisor Opcional) -->
        <div class="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide">✍️ Assinaturas</h4>
          
          <assinatura-canvas label="Assinatura do Técnico / Inspetor" :required="true" @update="onAssinaturaInspetor"></assinatura-canvas>
          
          <div class="pt-2 border-t border-slate-100 space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase mb-1">Nome do Supervisor (Opcional)</label>
              <input v-model="assinaturaSupervisorNome" type="text" placeholder="Nome do supervisor ou deixe em branco" class="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-sky-500" />
            </div>
            <assinatura-canvas label="Assinatura do Supervisor (Opcional)" :required="false" @update="onAssinaturaSupervisor"></assinatura-canvas>
          </div>
        </div>

        <button @click="salvarInspecao" :disabled="salvando" class="btn-tap w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3.5 rounded-xl shadow-md">
          {{ salvando ? 'Gravando na Planilha...' : 'Gravar Inspeção na Base de Dados' }}
        </button>
      </div>
    </template>

    <laudo-preventiva-modal v-if="laudoAberto" :laudo="laudoAtual" :modo-pos-salvar="laudoModoPosSalvar"
      @fechar="fecharLaudo" @nova-inspecao="laudoNovaInspecao" @ir-inicio="laudoIrInicio">
    </laudo-preventiva-modal>
  </div>`
};

/* ==========================================================================
   REGISTRO GLOBAL
   ========================================================================== */
const CorretivaModule = { props: { user: Object }, setup() { return {}; }, template: `<div></div>` };

window.PreventivaModule = PreventivaModule;
window.CorretivaModule = CorretivaModule;