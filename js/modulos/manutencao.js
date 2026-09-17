/* ==========================================================================
   js/modulos/manutencao.js — Preventiva (RSG-6301-01) e Corretiva (RSG-6302-01/02)
   Normalização de logs/chamados, helpers de periodicidade e de checklist de
   TI, assinatura digital em tela, seletor multi-mês, alerta de WhatsApp, e
   os componentes Vue de Preventiva e Corretiva (incluindo Kanban/calendário
   e as Ordens de Serviço impressas). Depende de js/api.js e do núcleo
   compartilhado do index.html.
   ========================================================================== */
const PRIORIDADES = [
  { value: "Baixa",   color: "bg-blue-100 text-blue-700 border-blue-300" },
  { value: "Média",   color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  { value: "Alta",    color: "bg-orange-50 text-orange-700 border-orange-300" },
  { value: "Crítica", color: "bg-rose-50 text-rose-700 border-red-300" },
];

/* ==========================================================================
   NORMALIZAÇÃO DOS DADOS DA PLANILHA (aceita variações de nome de coluna)
   ========================================================================== */
function normalizePreventivaLog(p) {
  return {
    id: p.ID_Log || p.id_log || p.ID || p.id || uid(),
    data: p.Data_Hora || p.data_hora || p.Data || p.data || "",
    area: p.Area || p.area || "",
    equipamento: p.Equipamento || p.equipamento || "",
    idEquipamento: p.ID_Equipamento || p.Id_Equipamento || p.id_equipamento || "",
    usuario: p.Usuario || p.usuario || "",
    status: normalizeStatusInspecao(p.Status_Inspecao || p.status_inspecao || p.Status || p.status || ""),
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
    dataConclusao: c.DataConclusao || c.dataConclusao || c.DataFechamento || c.dataFechamento || c.DataResolucao || c.dataResolucao || "",
    resolucao: c.Resolucao || c.resolucao || c.Resolução || c.resolução || "",
    tecnico: c.Tecnico || c.tecnico || c.Técnico || c.técnico || "",
  };
}

function extractPreventivas(data) {
  const raw = (data && (data.preventivas || data.Preventivas || (data.data && data.data.preventivas))) || [];
  return (Array.isArray(raw) ? raw : []).map(normalizePreventivaLog);
}

function chamadoCorretivaValido(c) {
  const id = (c.ID_Chamado || c.id_chamado || c.ID || c.id || "").toString().trim();
  const eq = (c.Equipamento || c.equipamento || "").toString().trim();
  const prob = (c.Descricao_Problema || c.descricao_problema || c.Descricao || c.descricao || "").toString().trim();
  return id !== "" && (eq !== "" || prob !== "");
}

function extractCorretivas(data) {
  const raw = (data && (data.chamados || data.Chamados || data.corretivas || data.Corretivas
    || (data.data && (data.data.chamados || data.data.corretivas)))) || [];
  return (Array.isArray(raw) ? raw : []).filter(chamadoCorretivaValido).map(normalizeCorretivaChamado);
}

function isStatusChamadoAberto(status) {
  const s = String(status || "").trim().toLowerCase();
  return s === "aberto" || s === "em andamento";
}

/* ==========================================================================
   ASSINATURA DIGITAL EM TELA (canvas sensível a toque/mouse)
   ========================================================================== */
const AssinaturaCanvas = {
  props: { label: String },
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
      c.height = 150 * dpr;
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
      <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide">{{ label }} *</label>
      <button type="button" @click="limpar" class="text-xs text-sky-600 font-semibold btn-tap">Limpar</button>
    </div>
    <canvas ref="canvasRef"
      class="w-full block bg-white border-2 rounded-lg touch-none cursor-crosshair"
      :class="temTraco ? 'border-emerald-300' : 'border-dashed border-slate-300'"
      style="height:150px"
      @mousedown="iniciarTraco" @mousemove="continuarTraco" @mouseup="finalizarTraco" @mouseleave="finalizarTraco"
      @touchstart="iniciarTraco" @touchmove="continuarTraco" @touchend="finalizarTraco"></canvas>
    <p v-if="!temTraco" class="text-[11px] text-slate-400 mt-1">Assine com o dedo ou o mouse na área acima.</p>
  </div>`
};

/* ==========================================================================
   HELPERS DE INSPEÇÃO & EQUIPAMENTOS
   ========================================================================== */
function parseItensInspecao(str) {
  return String(str || "")
    .split(/[,;\n]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function normalizeStatusInspecao(s) {
  const v = String(s || "").trim().toLowerCase();
  if (v === "c" || v === "conforme") return "C";
  if (v === "nc" || v === "não conforme" || v === "nao conforme") return "NC";
  if (v === "na" || v === "não aplicável" || v === "nao aplicavel" || v === "não aplicavel") return "NA";
  return null;
}

const AREA_TI = "Tecnologia da Informação";
const PRESTADOR_TI = "IRONTECH";
function ehAreaTI(area) {
  return normalizarTexto(area) === normalizarTexto(AREA_TI);
}

const ITENS_INSPECAO_TI = {
  [normalizarTexto("Servidor Central")]: [
    "Integridade do Hardware", "Rotinas e Logs de Backup", "Espaço e Monitoramento de Disco", "Temperatura e Redundância",
  ],
  [normalizarTexto("Terminais de Trabalho")]: [
    "Atualização de SO e Softwares", "Status Antivírus / Segurança", "Licenciamento", "Desempenho Geral",
  ],
  [normalizarTexto("Servidor em Nuvem (OneDrive)")]: [
    "Sincronização e Integridade de Dados", "Permissões e Controle de Acessos", "Cota de Armazenamento", "Políticas de Retenção e Lixeira",
  ],
  [normalizarTexto("Software Onqualit")]: [
    "Disponibilidade e Acessibilidade do Sistema Onqualit", "Integridade da Base de Dados e Módulos do SGQ",
    "Rotinas de Exportação / Backup de Segurança dos Registros", "Gestão de Licenças e Usuários Ativos",
  ],
};

function itensInspecaoTI(nomeAtivo) {
  return ITENS_INSPECAO_TI[normalizarTexto(nomeAtivo)] || null;
}

const EQUIPAMENTOS_TI_FALLBACK = [
  { ID: "EQ-TI-01", Nome: "Servidor Central", Area: AREA_TI, Modelo: "Hardware / Sistema", Periodicidade: "Mensal" },
  { ID: "EQ-TI-02", Nome: "Terminais de Trabalho", Area: AREA_TI, Modelo: "Software / SO", Periodicidade: "Mensal" },
  { ID: "EQ-TI-03", Nome: "Servidor em Nuvem (OneDrive)", Area: AREA_TI, Modelo: "Cloud Storage / M365", Periodicidade: "Mensal" },
  { ID: "EQ-TI-04", Nome: "Software Onqualit", Area: AREA_TI, Modelo: "Sistema de Gestão da Qualidade (SaaS / Web)", Periodicidade: "Mensal" },
].map(eq => ({ ...eq, Itens_Inspecao_Recomendados: (itensInspecaoTI(eq.Nome) || []).join(", ") }));

function comFallbackEquipamentosTI(rawEquip) {
  const lista = Array.isArray(rawEquip) ? rawEquip.slice() : [];
  const nomesExistentes = new Set(
    lista.map(e => normalizarTexto(e.Nome || e.Equipamento || e.nome || e.equipamento || ""))
  );
  EQUIPAMENTOS_TI_FALLBACK.forEach(fallback => {
    if (!nomesExistentes.has(normalizarTexto(fallback.Nome))) lista.push(fallback);
  });
  return lista;
}

const MESES_PT = [
  { v: 1, l: "Janeiro" }, { v: 2, l: "Fevereiro" }, { v: 3, l: "Março" }, { v: 4, l: "Abril" },
  { v: 5, l: "Maio" }, { v: 6, l: "Junho" }, { v: 7, l: "Julho" }, { v: 8, l: "Agosto" },
  { v: 9, l: "Setembro" }, { v: 10, l: "Outubro" }, { v: 11, l: "Novembro" }, { v: 12, l: "Dezembro" },
];
const HISTORICO_POR_PAGINA = 20;

const PERIODICIDADES_ORDEM = ["Diária", "Semanal", "Quinzenal", "Mensal", "Bimestral", "Trimestral", "Semestral", "Anual"];
const PERIODICIDADE_STEP_MESES = {
  "diária": 1, "diaria": 1, "semanal": 1, "quinzenal": 1,
  "mensal": 1, "bimestral": 2, "trimestral": 3, "semestral": 6, "anual": 12,
};

function normalizePeriodicidade(raw) {
  const v = String(raw || "").trim().toLowerCase();
  const encontrada = PERIODICIDADES_ORDEM.find(p => p.toLowerCase() === v);
  return encontrada || String(raw || "").trim();
}

function stepMesesPeriodicidade(p) {
  const v = String(p || "").trim().toLowerCase();
  return PERIODICIDADE_STEP_MESES[v] || 1;
}

const PERIODICIDADE_TAG = {
  "diária": "D", "diaria": "D", "semanal": "Sm", "quinzenal": "Q",
  "mensal": "M", "bimestral": "B", "trimestral": "T", "semestral": "S", "anual": "A",
};

function tagPeriodicidade(p) {
  const v = String(p || "").trim().toLowerCase();
  return PERIODICIDADE_TAG[v] || (p ? String(p).trim().charAt(0).toUpperCase() : "?");
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
   FICHA DE INSPEÇÃO TÉCNICA / LAUDO OPERACIONAL (RSG-6301-01)
   ========================================================================== */
const RSG_CODIGO = "RSG-6301-01";
const RSG_TITULO = "RSG-6301-01 - Checklist Manutenção Preventiva";

const LaudoPreventivaModal = {
  props: { laudo: Object, modoPosSalvar: Boolean },
  emits: ["fechar", "nova-inspecao", "ir-inicio"],
  setup(props, { emit }) {
    const exportandoPdf = ref(false);

    function formatarDataHora(v) {
      if (!v) return "-";
      const d = v instanceof Date ? v : new Date(v);
      if (isNaN(d.getTime())) return String(v);
      return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    function formatarStatusItem(status) {
      if (status === "C") return "Conforme";
      if (status === "NC") return "Não Conforme";
      if (status === "NA") return "Não Aplicável";
      return "—";
    }

    const CONDICAO_INFO = {
      C: { icone: "✓", classe: "bg-emerald-50 text-emerald-700" },
      NC: { icone: "✗", classe: "bg-rose-50 text-rose-700" },
      NA: { icone: "⚪", classe: "bg-amber-50 text-amber-700" },
    };
    function condicaoInfo(status) {
      return CONDICAO_INFO[status] || { icone: "—", classe: "bg-slate-200 text-slate-600" };
    }

    const nomeArquivo = computed(() => {
      const l = props.laudo || {};
      const dataParte = String(l.dataHora || "").split(" ")[0] || new Date().toISOString().slice(0, 10);
      const idParte = sanitizarNomeArquivo(l.equipamentoIdDisplay || l.equipamentoNome || "equipamento");
      return `${RSG_CODIGO}_${idParte}_${dataParte}.pdf`;
    });

    const laudoEhPrestadorExterno = computed(() => {
      const l = props.laudo || {};
      return ehAreaTI(l.area) || normalizarTexto(l.inspetor) === normalizarTexto(PRESTADOR_TI);
    });

    function imprimir() { window.print(); }

    function exportarPDF() {
      if (typeof window.jspdf === "undefined" || typeof window.html2canvas === "undefined") {
        pushToast("Biblioteca de exportação (PDF) não carregou. Verifique sua conexão.", "error");
        return;
      }
      const elemento = document.getElementById("laudo-imprimivel");
      if (!elemento) return;
      exportandoPdf.value = true;
      try {
        const doc = new window.jspdf.jsPDF("p", "pt", "a4");
        doc.html(elemento, {
          margin: [24, 24, 24, 24],
          autoPaging: "text",
          html2canvas: { scale: 0.72, useCORS: true, backgroundColor: "#ffffff" },
          width: 547,
          windowWidth: elemento.scrollWidth || 780,
          callback: (docFinal) => {
            docFinal.save(nomeArquivo.value);
            exportandoPdf.value = false;
          },
        });
      } catch (err) {
        console.error(err);
        pushToast("Erro ao gerar o PDF do laudo.", "error");
        exportandoPdf.value = false;
      }
    }

    return { exportandoPdf, formatarDataHora, formatarStatusItem, condicaoInfo, nomeArquivo, laudoEhPrestadorExterno, imprimir, exportarPDF, RSG_CODIGO, RSG_TITULO };
  },
  template: `
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4">
    <div class="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] overflow-y-auto">
      <div class="no-print sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
        <h3 class="font-bold text-slate-800">Ficha de Inspeção Técnica</h3>
        <button v-if="!modoPosSalvar" @click="$emit('fechar')" class="btn-tap text-slate-400 hover:text-slate-600 text-xl leading-none px-2">✕</button>
      </div>

      <div id="laudo-imprimivel" class="p-5 space-y-4" v-if="laudo">
        <div class="border-b-2 border-slate-800 pb-3">
          <p class="text-xs font-bold text-sky-700 uppercase tracking-wide">Hidrogeron - Sistema de Manutenção</p>
          <h2 class="text-lg font-extrabold text-slate-900 mt-0.5">{{ RSG_TITULO }}</h2>
          <div class="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-500">
            <p><span class="font-semibold text-slate-700">Protocolo/Log ID:</span> #{{ laudo.idLog }}</p>
            <p><span class="font-semibold text-slate-700">Data/Hora Execução:</span> {{ formatarDataHora(laudo.dataHora) }}</p>
          </div>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Dados do Ativo</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <p><span class="text-slate-400">Setor/Área:</span> <span class="font-medium text-slate-800">{{ laudo.area || '-' }}</span></p>
            <p><span class="text-slate-400">ID Equipamento:</span> <span class="font-medium text-slate-800">{{ laudo.equipamentoIdDisplay || '-' }}</span></p>
            <p class="col-span-2"><span class="text-slate-400">Equipamento:</span> <span class="font-medium text-slate-800">{{ laudo.equipamentoNome || '-' }}</span></p>
            <p><span class="text-slate-400">Modelo:</span> <span class="font-medium text-slate-800">{{ laudo.modelo || '-' }}</span></p>
            <p><span class="text-slate-400">Periodicidade:</span> <span class="font-medium text-slate-800">{{ laudo.periodicidade || '-' }}</span></p>
          </div>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Responsabilidade Técnica</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm"><span class="text-slate-400">Inspetor/Técnico:</span> <span class="font-medium text-slate-800">{{ laudo.inspetor || '-' }}</span></p>
              <span class="text-xs font-bold px-3 py-1 rounded-full"
                :class="laudo.statusGeral === 'Não Conforme' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'">
                {{ (laudo.statusGeral || 'Conforme').toUpperCase() }}
              </span>
            </div>
            <p v-if="laudoEhPrestadorExterno" class="text-xs font-bold text-indigo-700 bg-indigo-100 rounded-full px-3 py-1 inline-block">
              🖥️ Prestador de Serviço: IRONTECH (Externo)
            </p>
          </div>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Matriz de Inspeção</h4>
          <div class="border border-slate-200 rounded-lg overflow-hidden overflow-x-auto">
            <table class="w-full text-sm border-collapse laudo-matriz">
              <thead>
                <tr class="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wide">
                  <th class="text-left font-bold px-2 py-1.5 w-8 border border-slate-200">#</th>
                  <th class="text-left font-bold px-2 py-1.5 border border-slate-200">Ponto de Inspeção / Item</th>
                  <th class="text-left font-bold px-2 py-1.5 border border-slate-200">Periodicidade</th>
                  <th class="text-left font-bold px-2 py-1.5 border border-slate-200 whitespace-nowrap">Condição</th>
                  <th class="text-left font-bold px-2 py-1.5 border border-slate-200">Observação</th>
                  <th class="text-left font-bold px-2 py-1.5 border border-slate-200 whitespace-nowrap">Evidência</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in laudo.itens" :key="idx" :class="idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'">
                  <td class="px-2 py-2 align-top text-slate-400 border border-slate-200">{{ idx + 1 }}</td>
                  <td class="px-2 py-2 align-top text-slate-700 border border-slate-200">{{ item.texto }}</td>
                  <td class="px-2 py-2 align-top text-slate-500 border border-slate-200">{{ item.periodicidade || '—' }}</td>
                  <td class="px-2 py-2 align-top whitespace-nowrap border border-slate-200">
                    <span class="text-xs font-bold px-2 py-0.5 rounded-full" :class="condicaoInfo(item.status).classe">
                      {{ condicaoInfo(item.status).icone }} {{ formatarStatusItem(item.status) }}
                    </span>
                  </td>
                  <td class="px-2 py-2 align-top text-slate-600 border border-slate-200">{{ item.observacao || '-' }}</td>
                  <td class="px-2 py-2 align-top border border-slate-200">
                    <img v-if="item.fotoBase64" :src="item.fotoBase64" class="w-16 h-16 object-cover rounded border border-slate-200" alt="Evidência" />
                    <span v-else class="text-slate-300">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Observações Gerais</h4>
          <p class="bg-slate-50 rounded-lg border border-slate-200 p-3 text-sm text-slate-700 whitespace-pre-line">
            {{ laudo.observacoes || 'Nenhuma observação registrada.' }}
          </p>
        </div>

        <div class="pt-4">
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Validação</h4>
          <div class="grid grid-cols-2 gap-6 text-xs text-slate-500">
            <div>
              <img v-if="laudo.assinaturaInspetor" :src="laudo.assinaturaInspetor" class="h-14 object-contain border-b border-slate-400" />
              <div v-else class="border-b border-slate-400 h-10"></div>
              <p class="mt-1 font-semibold text-slate-700">Técnico Responsável</p>
              <p class="mt-2">Nome: {{ laudo.inspetor || '-' }}</p>
            </div>
            <div>
              <img v-if="laudo.assinaturaSupervisor" :src="laudo.assinaturaSupervisor" class="h-14 object-contain border-b border-slate-400" />
              <div v-else class="border-b border-slate-400 h-10"></div>
              <p class="mt-1 font-semibold text-slate-700">Supervisão/Gestão</p>
              <p class="mt-2">Nome: {{ laudo.assinaturaSupervisorNome || '-' }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="no-print px-5 pb-5 pt-2 grid grid-cols-2 gap-2 sticky bottom-0 bg-white border-t border-slate-200 mt-2">
        <button @click="imprimir" class="btn-tap flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-lg text-sm">
          🖨️ Imprimir
        </button>
        <button @click="exportarPDF" :disabled="exportandoPdf"
          class="btn-tap flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm">
          <span v-if="exportandoPdf" class="spinner"></span>
          <span>{{ exportandoPdf ? "Gerando..." : "📄 Exportar PDF" }}</span>
        </button>
        <template v-if="modoPosSalvar">
          <button @click="$emit('nova-inspecao')" class="btn-tap flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 rounded-lg text-sm">
            📋 Nova Inspeção
          </button>
          <button @click="$emit('ir-inicio')" class="btn-tap flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg text-sm">
            🏠 Início
          </button>
        </template>
        <button v-else @click="$emit('fechar')" class="btn-tap col-span-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg text-sm">
          Fechar
        </button>
      </div>
    </div>
  </div>`
};

/* ==========================================================================
   MÓDULO PREVENTIVA
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

    const filtroAno = ref("todos");
    const filtroMes = ref("todos");
    const filtroArea = ref("todas");
    const filtroBusca = ref("");
    const filtroStatus = ref("todos");
    const filtroPeriodicidade = ref("todas");
    const paginaHistorico = ref(1);

    const ANO_ATUAL = new Date().getFullYear();
    const calendarioArea = ref("todas");
    const calendarioAno = ref(ANO_ATUAL);
    function calendarioAnoAnterior() { calendarioAno.value -= 1; }
    function calendarioAnoProximo() { calendarioAno.value += 1; }

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
          periodicidade: normalizePeriodicidade(
            e.Periodicidade || e.periodicidade || e.Frequencia || e.frequencia || e.Frequência || e.frequência || ""
          ),
          mesReferencia: parseInt(e.Mes_Referencia || e.mes_referencia || e.MesReferencia || e.mesReferencia, 10) || 1,
          itensInspecao: e.Itens_Inspecao_Recomendados || e.itens_inspecao_recomendados
            || e.ItensInspecaoRecomendados || e.itensInspecaoRecomendados || "",
        }));
        preventivasHistorico.value = extractPreventivas(data);
      } catch (err) {
        console.error(err);
        if (!silencioso) erroCarregamento.value = "Não foi possível carregar os dados da Preventiva.";
      } finally {
        if (!silencioso) loadingDados.value = false;
      }
    }

    function ativosDaArea(area) {
      const alvo = String(area || "").trim().toLowerCase();
      return ativosAgrupados.value.filter(a => a.area.trim().toLowerCase() === alvo);
    }
    const equipamentosDaAreaAtual = computed(() => ativosDaArea(areaSelecionada.value));

    const filtroPeriodicidadeLista = ref("todas");
    const periodicidadesDaArea = computed(() => {
      const presentes = new Set();
      equipamentosDaAreaAtual.value.forEach(ativo => ativo.perfis.forEach(p => { if (p.periodicidade) presentes.add(p.periodicidade); }));
      const ordenadas = PERIODICIDADES_ORDEM.filter(p => presentes.has(p));
      const extras = Array.from(presentes).filter(p => !PERIODICIDADES_ORDEM.includes(p));
      return ordenadas.concat(extras);
    });
    const equipamentosFiltradosLista = computed(() => {
      if (filtroPeriodicidadeLista.value === "todas") return equipamentosDaAreaAtual.value;
      return equipamentosDaAreaAtual.value.filter(ativo => ativo.perfis.some(p => p.periodicidade === filtroPeriodicidadeLista.value));
    });
    watch(areaSelecionada, () => { filtroPeriodicidadeLista.value = "todas"; });

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
        if (!areasCorrespondem(p.area, ativo && ativo.area)) return false;
        const d = new Date(p.data);
        if (isNaN(d.getTime())) return false;
        return d.getFullYear() === ano && d.getMonth() + 1 === mes;
      });
    }

    function chaveAtivo(eq) {
      return eq.idDisplay
        ? "id:" + String(eq.idDisplay).trim().toLowerCase()
        : "nome:" + String(eq.nome).trim().toLowerCase() + "|" + String(eq.area).trim().toLowerCase();
    }
    const ativosAgrupados = computed(() => {
      const grupos = new Map();
      todosEquipamentos.value.forEach(row => {
        const chave = chaveAtivo(row);
        if (!grupos.has(chave)) {
          grupos.set(chave, {
            chave, idDisplay: row.idDisplay, nome: row.nome, modelo: row.modelo,
            tag: row.tag, area: row.area, perfis: [],
          });
        }
        grupos.get(chave).perfis.push(row);
      });
      return Array.from(grupos.values());
    });

    function ativoDoEquipamento(eq) {
      const chave = chaveAtivo(eq);
      return ativosAgrupados.value.find(a => a.chave === chave) || { ...eq, perfis: [eq] };
    }

    function ativoPorNomeArea(nome, area, idEquipamento) {
      const idAlvo = normalizarTexto(idEquipamento);
      if (idAlvo) {
        const porId = ativosAgrupados.value.find(a => normalizarTexto(a.idDisplay) === idAlvo);
        if (porId) return porId;
      }
      const nomeAlvo = normalizarTexto(nome);
      const areaAlvo = normalizarTexto(area);
      return ativosAgrupados.value.find(a =>
        normalizarTexto(a.nome) === nomeAlvo && (!areaAlvo || normalizarTexto(a.area) === areaAlvo)
      );
    }

    function montarItensLaudoHistorico(ativo, statusGeral, observacoes) {
      const vistos = new Set();
      const itens = [];
      (ativo && ativo.perfis || []).forEach(perfil => {
        const textosPerfil = (ativo && itensInspecaoTI(ativo.nome)) || parseItensInspecao(perfil.itensInspecao);
        textosPerfil.forEach(texto => {
          const chave = texto.trim().toLowerCase();
          if (vistos.has(chave)) return;
          vistos.add(chave);
          itens.push({
            texto, periodicidade: perfil.periodicidade, status: "C",
            observacao: "Conforme padrão operacional", fotoBase64: null,
          });
        });
      });
      if (itens.length === 0) {
        itens.push({
          texto: "Inspeção Operacional e Integridade Estrutural",
          periodicidade: "Mensal", status: "C",
          observacao: "Conforme padrão operacional", fotoBase64: null,
        });
      }
      if (statusGeral === "NC") {
        const obsAlvo = String(observacoes || "").trim().toLowerCase();
        let algumApontado = false;
        itens.forEach(item => {
          if (obsAlvo && obsAlvo.includes(item.texto.trim().toLowerCase())) {
            item.status = "NC";
            item.observacao = observacoes || "Não conformidade registrada no log.";
            algumApontado = true;
          }
        });
        if (!algumApontado) {
          itens.forEach(item => {
            item.status = "NC";
            item.observacao = observacoes || "Não conformidade registrada no log.";
          });
        }
      }
      return itens;
    }

    function formatarStatusLabel(status) {
      if (status === "C") return "Conforme";
      if (status === "NC") return "Não Conforme";
      if (status === "NA") return "Não Aplicável";
      return "—";
    }

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

    function dataLimiteMesAtual(ativo) {
      const agora = new Date();
      const mesAtual = agora.getMonth() + 1;
      const perfis = ativo.perfis || [ativo];
      const programado = perfis.some(p => mesesProgramadosEquipamento(p).includes(mesAtual));
      return programado ? dataPlanejadaMes(agora.getFullYear(), mesAtual) : null;
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
      const total = lista.length;
      if (total === 0) return { feitos: 0, total: 0, pct: 0 };
      const feitos = lista.filter(eq => {
        const tipo = statusCicloEquipamento(eq).tipo;
        return tipo !== "vencido" && tipo !== "nc";
      }).length;
      return { feitos, total, pct: Math.round((feitos / total) * 100) };
    });

    function formatarData(d) {
      if (!d) return "-";
      const dt = d instanceof Date ? d : new Date(d);
      if (isNaN(dt.getTime())) return String(d);
      return dt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    }

    function tituloBloco(periodicidade) {
      if (String(periodicidade || "").trim().toLowerCase() === "mensal") return "Rotina Mensal";
      return periodicidade ? "Revisão " + periodicidade : "Rotina Geral";
    }

    function abrirArea(area) { areaSelecionada.value = area; view.value = "lista"; }
    function voltarSetores() { areaSelecionada.value = null; view.value = "setores"; }
    function abrirHistorico() { view.value = "historico"; }
    function abrirCalendario() { view.value = "calendario"; }

    const ativosCalendario = computed(() => {
      if (calendarioArea.value === "todas") return ativosAgrupados.value;
      const alvo = calendarioArea.value.trim().toLowerCase();
      return ativosAgrupados.value.filter(a => a.area.trim().toLowerCase() === alvo);
    });

    function dataPlanejadaMes(ano, mes) { return getThirdThursday(ano, mes - 1); }

    function statusCelula(ativo, mes, ano) {
      if (logNoMes(ativo, ano, mes)) return "concluido";
      return dataPlanejadaMes(ano, mes).getTime() < Date.now() ? "atrasado" : "programado";
    }

    const CORES_CELULA = {
      concluido: "bg-emerald-500 text-white",
      atrasado: "bg-red-500 text-white",
      programado: "bg-sky-50 text-sky-700",
    };

    function perfisNaCelula(ativo, mes) {
      return ativo.perfis.filter(p => mesesProgramadosEquipamento(p).includes(mes));
    }

    function linhasCalendarioParaExportar() {
      return ativosCalendario.value.map(ativo => {
        const linha = { "ID": ativo.idDisplay || "", "Equipamento": ativo.nome, "Setor": ativo.area };
        meses.forEach(m => {
          const perfis = perfisNaCelula(ativo, m.v);
          if (perfis.length === 0) { linha[m.l] = ""; return; }
          const st = statusCelula(ativo, m.v, calendarioAno.value);
          const statusTxt = { concluido: "OK", atrasado: "ATRASADO", programado: "PROGRAMADO" }[st];
          const dataPlanejada = formatarDataCurta(dataPlanejadaMes(calendarioAno.value, m.v));
          linha[m.l] = perfis.map(p => tagPeriodicidade(p.periodicidade)).join("/") + " (" + statusTxt + " - " + dataPlanejada + ")";
        });
        return linha;
      });
    }

    function exportarCalendarioExcel() {
      if (typeof XLSX === "undefined") return pushToast("Biblioteca Excel não carregada.", "error");
      const ws = XLSX.utils.json_to_sheet(linhasCalendarioParaExportar());
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Calendário " + calendarioAno.value);
      XLSX.writeFile(wb, `calendario-preventivas-${calendarioAno.value}.xlsx`);
    }

    function exportarCalendarioPDF() {
      if (typeof window.jspdf === "undefined") return pushToast("Biblioteca PDF não carregada.", "error");
      const doc = new window.jspdf.jsPDF({ orientation: "landscape" });
      doc.setFontSize(13);
      doc.text(`Calendário Mestre de Preventivas — ${calendarioAno.value}`, 14, 15);
      const linhas = linhasCalendarioParaExportar();
      doc.autoTable({
        startY: 20,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [15, 23, 42] },
        head: [["ID", "Equipamento", "Setor", ...meses.map(m => m.l.slice(0, 3))]],
        body: linhas.map(l => [l.ID, l.Equipamento, l.Setor, ...meses.map(m => l[m.l])]),
      });
      doc.save(`calendario-preventivas-${calendarioAno.value}.pdf`);
    }

    function abrirEquipamento(eq) {
      const ativo = ativoDoEquipamento(eq);
      equipamentoSelecionado.value = ativo;
      const mesAtual = new Date().getMonth() + 1;
      const blocos = [];
      ativo.perfis.forEach(perfil => {
        if (!mesesProgramadosEquipamento(perfil).includes(mesAtual)) return;
        const textosItens = itensInspecaoTI(ativo.nome) || parseItensInspecao(perfil.itensInspecao);
        const itens = textosItens.map(texto => ({
          texto, status: null, periodicidade: perfil.periodicidade,
          observacao: "", fotoBase64: null, fotoNome: "",
        }));
        if (itens.length) blocos.push({ periodicidade: perfil.periodicidade || "Geral", itens });
      });
      blocosChecklist.value = blocos;
      itensChecklist.value = blocos.flatMap(b => b.itens);

      nomeExecutor.value = ehAreaTI(ativo.area) ? PRESTADOR_TI : (props.user.nome || "");
      observacoesGerais.value = "";
      itemFotoAlvo.value = null;
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
      nomeExecutor.value = "";
      observacoesGerais.value = "";
      itemFotoAlvo.value = null;
      assinaturaInspetor.value = null;
      assinaturaSupervisor.value = null;
      assinaturaSupervisorNome.value = "";
    }

    function setItemStatus(item, value) {
      item.status = item.status === value ? null : value;
    }

    const ativoSelecionadoEhTI = computed(() => !!equipamentoSelecionado.value && ehAreaTI(equipamentoSelecionado.value.area));

    function fecharLaudo() {
      laudoAberto.value = false;
      laudoAtual.value = null;
    }
    function laudoNovaInspecao() { fecharLaudo(); voltarLista(); }
    function laudoIrInicio() { fecharLaudo(); emit("go-home"); }

    function abrirLaudoHistorico(h) {
      const ativo = ativoPorNomeArea(h.equipamento, h.area, h.idEquipamento);
      laudoAtual.value = {
        idLog: h.id,
        dataHora: h.data,
        area: h.area,
        equipamentoIdDisplay: ativo ? ativo.idDisplay : "",
        equipamentoNome: h.equipamento,
        modelo: ativo ? ativo.modelo : "",
        periodicidade: ativo ? (ativo.perfis || []).map(p => p.periodicidade).filter(Boolean).join(" + ") : "",
        inspetor: h.usuario,
        statusGeral: formatarStatusLabel(h.status),
        itens: montarItensLaudoHistorico(ativo, h.status, h.observacoes),
        observacoes: h.observacoes,
      };
      laudoModoPosSalvar.value = false;
      laudoAberto.value = true;
    }

    const temNC = computed(() => itensChecklist.value.some(i => i.status === "NC"));

    const progresso = computed(() => {
      if (itensChecklist.value.length === 0) return 0;
      const preenchidos = itensChecklist.value.filter(i => i.status).length;
      return Math.round((preenchidos / itensChecklist.value.length) * 100);
    });

    function abrirCameraItem(item) {
      itemFotoAlvo.value = item;
      inputCameraRef.value && inputCameraRef.value.click();
    }
    function abrirGaleriaItem(item) {
      itemFotoAlvo.value = item;
      inputGaleriaRef.value && inputGaleriaRef.value.click();
    }
    function onFotoSelecionada(e) {
      const file = e.target.files && e.target.files[0];
      const alvo = itemFotoAlvo.value;
      if (!file || !alvo) { e.target.value = ""; return; }
      const reader = new FileReader();
      reader.onload = () => {
        alvo.fotoBase64 = reader.result;
        alvo.fotoNome = file.name;
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    }
    function removerFotoItem(item) {
      item.fotoBase64 = null;
      item.fotoNome = "";
    }

    /* ======================================================================
       GRAVAÇÃO SEGURA VIA POST (Apps Script) E ATUALIZAÇÃO IMEDIATA
       ====================================================================== */
    async function salvarInspecao() {
      const pendentes = itensChecklist.value.filter(i => !i.status);
      if (itensChecklist.value.length === 0) {
        return pushToast("Este equipamento não possui itens cadastrados.", "error");
      }
      if (pendentes.length > 0) {
        return pushToast(`Classifique todos os itens (${pendentes.length} pendente(s)).`, "error");
      }
      const ncSemDescricao = itensChecklist.value.some(i => i.status === "NC" && !i.observacao.trim());
      if (ncSemDescricao) {
        return pushToast("Descreva o desvio em cada item Não Conforme.", "error");
      }
      const ncSemFoto = itensChecklist.value.some(i => i.status === "NC" && !i.fotoBase64);
      if (ncSemFoto) {
        return pushToast("Anexe foto em cada item Não Conforme.", "error");
      }
      const naSemJustificativa = itensChecklist.value.some(i => i.status === "NA" && !i.observacao.trim());
      if (naSemJustificativa) {
        return pushToast("Justifique cada item Não Aplicável.", "error");
      }
      if (!nomeExecutor.value.trim()) {
        return pushToast("Informe o nome do Executor/Inspetor.", "error");
      }
      if (!assinaturaInspetor.value) {
        return pushToast("Colete a assinatura do Técnico Responsável.", "error");
      }
      if (!assinaturaSupervisor.value || !assinaturaSupervisorNome.value.trim()) {
        return pushToast("Colete a assinatura e nome do Supervisor.", "error");
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
        const observacoesFinal = partesObs.join(" | ");

        const equipamentoNome = equipamentoSelecionado.value.nome;
        const idEquipamento = equipamentoSelecionado.value.idDisplay || "";
        const areaAtual = areaSelecionada.value;
        const usuarioNome = nomeExecutor.value.trim() || props.user.nome;

        // GRAVAÇÃO PRINCIPAL VIA POST (sem corte de URL)
        await postToAppsScript({
          action: "savePreventiva",
          idLog: idLog,
          dataHora: dataHora,
          area: areaAtual,
          equipamento: equipamentoNome,
          idEquipamento: idEquipamento,
          usuario: usuarioNome,
          statusInspecao: statusInspecao,
          observacoes: observacoesFinal
        });

        // Envio best-effort de fotos e assinaturas
        itensChecklist.value.forEach(item => {
          if (item.status === "NC" && item.fotoBase64) {
            postToAppsScript({
              action: "attachPreventivaEvidencia",
              idLog, itemTexto: item.texto,
              fotoBase64: item.fotoBase64, fotoNome: item.fotoNome,
            }).catch(e => console.error("Foto:", e));
          }
        });

        postToAppsScript({
          action: "attachPreventivaAssinaturas",
          idLog,
          assinaturaInspetorBase64: assinaturaInspetor.value,
          assinaturaSupervisorBase64: assinaturaSupervisor.value,
          assinaturaSupervisorNome: assinaturaSupervisorNome.value.trim(),
        }).catch(e => console.error("Assinaturas:", e));

        // ATUALIZAÇÃO IMEDIATA DO HISTÓRICO EM MEMÓRIA
        const novoRegistro = {
          id: idLog,
          data: dataHora,
          area: areaAtual,
          equipamento: equipamentoNome,
          idEquipamento: idEquipamento,
          usuario: usuarioNome,
          status: temNC.value ? "NC" : "C",
          observacoes: observacoesFinal,
        };
        preventivasHistorico.value.unshift(novoRegistro);

        pushToast("Inspeção gravada com sucesso!", "success");

        // Abre o laudo para impressão/PDF
        laudoAtual.value = {
          idLog, dataHora, area: areaAtual,
          equipamentoIdDisplay: idEquipamento,
          equipamentoNome, modelo: equipamentoSelecionado.value.modelo,
          periodicidade: blocosChecklist.value.map(b => b.periodicidade).filter(Boolean).join(" + "),
          inspetor: usuarioNome, statusGeral: statusInspecao,
          itens: itensChecklist.value.map(i => ({
            texto: i.texto, status: i.status, periodicidade: i.periodicidade,
            observacao: i.observacao, fotoBase64: i.fotoBase64,
          })),
          observacoes: observacoesFinal,
          assinaturaInspetor: assinaturaInspetor.value,
          assinaturaSupervisor: assinaturaSupervisor.value,
          assinaturaSupervisorNome: assinaturaSupervisorNome.value.trim(),
        };
        laudoModoPosSalvar.value = true;
        laudoAberto.value = true;

        if (temNC.value) {
          alertaWhatsAppDados.value = {
            tipo: "nc", id: idLog, equipamento: equipamentoNome,
            area: areaAtual, descricao: partesObs.join(" | ") || "Itens NC.",
            inspetor: usuarioNome,
          };
          alertaWhatsAppAberto.value = true;
        }

        // Sincronização em segundo plano após 2s garantindo integridade
        setTimeout(() => carregarDados({ silencioso: true }), 2000);
      } catch (err) {
        console.error(err);
        pushToast("Erro ao gravar inspeção no banco de dados.", "error");
      } finally {
        salvando.value = false;
      }
    }

    // Histórico de Inspeções
    const anosDisponiveis = computed(() => {
      const anos = new Set();
      preventivasHistorico.value.forEach(p => {
        const d = new Date(p.data);
        if (!isNaN(d.getTime())) anos.add(d.getFullYear());
      });
      return Array.from(anos).sort((a, b) => b - a);
    });

    function periodicidadeDoEquipamento(nomeEquip, area) {
      const nomeAlvo = normalizarTexto(nomeEquip);
      const areaAlvo = normalizarTexto(area);
      const eq = todosEquipamentos.value.find(e =>
        normalizarTexto(e.nome) === nomeAlvo && (!areaAlvo || normalizarTexto(e.area) === areaAlvo)
      );
      return eq ? eq.periodicidade : "";
    }

    const historicoFiltrado = computed(() => {
      const termo = filtroBusca.value.trim().toLowerCase();
      return preventivasHistorico.value.filter(p => {
        const d = new Date(p.data);
        if (filtroAno.value !== "todos") {
          if (isNaN(d.getTime()) || d.getFullYear() !== Number(filtroAno.value)) return false;
        }
        if (filtroMes.value !== "todos") {
          if (isNaN(d.getTime()) || (d.getMonth() + 1) !== Number(filtroMes.value)) return false;
        }
        if (filtroArea.value !== "todas") {
          if (String(p.area || "").trim().toLowerCase() !== filtroArea.value.trim().toLowerCase()) return false;
        }
        if (filtroStatus.value !== "todos" && p.status !== filtroStatus.value) return false;
        if (filtroPeriodicidade.value !== "todas") {
          if (periodicidadeDoEquipamento(p.equipamento, p.area) !== filtroPeriodicidade.value) return false;
        }
        if (termo) {
          const alvo = `${p.equipamento || ""} ${p.id || ""}`.toLowerCase();
          if (!alvo.includes(termo)) return false;
        }
        return true;
      }).sort((a, b) => new Date(b.data) - new Date(a.data));
    });

    const historicoPaginado = computed(() => historicoFiltrado.value.slice(0, paginaHistorico.value * HISTORICO_POR_PAGINA));

    watch([filtroAno, filtroMes, filtroArea, filtroBusca, filtroStatus, filtroPeriodicidade], () => {
      paginaHistorico.value = 1;
    });

    function limparFiltrosHistorico() {
      filtroAno.value = "todos";
      filtroMes.value = "todos";
      filtroArea.value = "todas";
      filtroBusca.value = "";
      filtroStatus.value = "todos";
      filtroPeriodicidade.value = "todas";
      paginaHistorico.value = 1;
    }

    function carregarMaisHistorico() { paginaHistorico.value += 1; }

    const souAdmin = computed(() => isAdmin(props.user));
    const excluirAlvo = ref(null);
    const excluindo = ref(false);
    const editarAlvo = ref(null);
    const editando = ref(false);

    function pedirExclusaoLog(h) { excluirAlvo.value = h; }
    function cancelarExclusaoLog() { excluirAlvo.value = null; }
    async function confirmarExclusaoLog() {
      const alvo = excluirAlvo.value;
      if (!alvo) return;
      excluindo.value = true;
      try {
        const resp = await deleteRecordApi("preventiva", alvo.id);
        if (resp && resp.status === "error") throw new Error(resp.message || "Erro ao excluir.");
        preventivasHistorico.value = preventivasHistorico.value.filter(p => p.id !== alvo.id);
        pushToast("Registro excluído com sucesso!", "success");
        excluirAlvo.value = null;
      } catch (err) {
        console.error(err);
        pushToast("Erro ao excluir registro.", "error");
      } finally {
        excluindo.value = false;
      }
    }

    function abrirEdicaoLog(h) {
      editarAlvo.value = { id: h.id, status: h.status, observacoes: h.observacoes || "" };
    }
    function fecharEdicaoLog() { editarAlvo.value = null; }
    async function salvarEdicaoLog() {
      const alvo = editarAlvo.value;
      if (!alvo) return;
      editando.value = true;
      try {
        const statusInspecao = formatarStatusLabel(alvo.status);
        const resp = await updateRecordApi("preventiva", alvo.id, {
          statusInspecao, observacoes: alvo.observacoes || "",
        });
        if (resp && resp.status === "error") throw new Error(resp.message || "Erro ao salvar.");
        const registro = preventivasHistorico.value.find(p => p.id === alvo.id);
        if (registro) {
          registro.status = alvo.status;
          registro.observacoes = alvo.observacoes;
        }
        pushToast("Registro atualizado com sucesso!", "success");
        editarAlvo.value = null;
      } catch (err) {
        console.error(err);
        pushToast("Erro ao atualizar registro.", "error");
      } finally {
        editando.value = false;
      }
    }

    function linhasParaExportar() {
      return historicoFiltrado.value.map(h => ({
        "Data/Hora": formatarData(h.data),
        "Setor": h.area || "",
        "ID": h.id || "",
        "Equipamento": h.equipamento || "",
        "Periodicidade": periodicidadeDoEquipamento(h.equipamento, h.area) || "-",
        "Status": formatarStatusLabel(h.status),
        "Usuário": h.usuario || "",
        "Observações": h.observacoes || "",
      }));
    }

    function exportarExcel() {
      if (typeof XLSX === "undefined") return pushToast("Biblioteca Excel não carregada.", "error");
      const ws = XLSX.utils.json_to_sheet(linhasParaExportar());
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Histórico");
      XLSX.writeFile(wb, `historico-preventivas-${Date.now()}.xlsx`);
    }

    function exportarPDF() {
      if (typeof window.jspdf === "undefined") return pushToast("Biblioteca PDF não carregada.", "error");
      const doc = new window.jspdf.jsPDF({ orientation: "landscape" });
      doc.setFontSize(13);
      doc.text("Histórico de Inspeções — Manutenção Preventiva", 14, 15);
      doc.autoTable({
        startY: 20,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [15, 23, 42] },
        head: [["Data/Hora", "Setor", "ID", "Equipamento", "Periodicidade", "Status", "Usuário", "Observações"]],
        body: historicoFiltrado.value.map(h => [
          formatarData(h.data), h.area || "", h.id || "", h.equipamento || "",
          periodicidadeDoEquipamento(h.equipamento, h.area) || "-",
          formatarStatusLabel(h.status), h.usuario || "", h.observacoes || "",
        ]),
      });
      doc.save(`historico-preventivas-${Date.now()}.pdf`);
    }

    onMounted(carregarDados);
    onMounted(() => carregarCadastrosMestres());

    return {
      areas, meses, periodicidadesCanonicas: PERIODICIDADES_ORDEM, view, areaSelecionada, equipamentoSelecionado,
      loadingDados, erroCarregamento, statsPorArea, equipamentosDaAreaAtual, progressoSetor,
      periodicidadesDaArea, filtroPeriodicidadeLista, equipamentosFiltradosLista,
      itensChecklist, blocosChecklist, temNC, progresso,
      observacoesGerais, salvando, nomeExecutor, ativoSelecionadoEhTI,
      inputCameraRef, inputGaleriaRef,
      assinaturaSupervisorNome, onAssinaturaInspetor, onAssinaturaSupervisor,
      abrirArea, voltarSetores, abrirHistorico, abrirCalendario,
      abrirEquipamento, voltarLista, setItemStatus, abrirCameraItem, abrirGaleriaItem, onFotoSelecionada, removerFotoItem, salvarInspecao,
      ultimaInspecao, formatarStatusLabel, statusCicloEquipamento, formatarData, tagPeriodicidade, corPeriodicidadeItem, tituloBloco,
      filtroAno, filtroMes, filtroArea, filtroBusca, filtroStatus, filtroPeriodicidade, anosDisponiveis,
      historicoFiltrado, historicoPaginado, limparFiltrosHistorico, carregarMaisHistorico,
      souAdmin, excluirAlvo, excluindo, editarAlvo, editando,
      pedirExclusaoLog, cancelarExclusaoLog, confirmarExclusaoLog, abrirEdicaoLog, fecharEdicaoLog, salvarEdicaoLog,
      periodicidadeDoEquipamento, exportarExcel, exportarPDF,
      laudoAberto, laudoAtual, laudoModoPosSalvar, fecharLaudo, laudoNovaInspecao, laudoIrInicio, abrirLaudoHistorico,
      alertaWhatsAppAberto, alertaWhatsAppDados, fecharAlertaWhatsApp,
      calendarioArea, calendarioAno, calendarioAnoAnterior, calendarioAnoProximo, ativosCalendario, statusCelula, CORES_CELULA, perfisNaCelula,
      dataLimiteMesAtual, dataPlanejadaMes, formatarDataCurta,
      exportarCalendarioExcel, exportarCalendarioPDF,
    };
  },
  template: `
  <div class="space-y-5">
    <nav class="flex items-center gap-1.5 text-xs font-medium text-slate-400 flex-wrap">
      <button @click="$emit('go-home')" class="hover:text-sky-600 transition-colors btn-tap">Início</button>
      <span>›</span>
      <button @click="voltarSetores" class="hover:text-sky-600 transition-colors btn-tap"
        :class="(view === 'setores' || view === 'historico' || view === 'calendario') ? 'text-slate-700 font-semibold' : ''">Preventiva</button>
      <template v-if="areaSelecionada && (view === 'lista' || view === 'detalhe')">
        <span>›</span>
        <button @click="abrirArea(areaSelecionada)" class="hover:text-sky-600 transition-colors btn-tap"
          :class="view === 'lista' ? 'text-slate-700 font-semibold' : ''">{{ areaSelecionada }}</button>
      </template>
      <template v-if="view === 'detalhe' && equipamentoSelecionado">
        <span>›</span>
        <span class="text-slate-700 font-semibold truncate max-w-[160px]">{{ equipamentoSelecionado.nome }}</span>
      </template>
    </nav>

    <div v-if="view === 'setores' || view === 'historico' || view === 'calendario'" class="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      <button @click="voltarSetores" class="btn-tap whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border"
        :class="view === 'setores' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-500'">
        Áreas
      </button>
      <button @click="abrirHistorico" class="btn-tap whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border"
        :class="view === 'historico' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-500'">
        Histórico de Inspeções
      </button>
      <button @click="abrirCalendario" class="btn-tap whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border"
        :class="view === 'calendario' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-500'">
        📅 Calendário de Preventivas
      </button>
    </div>

    <!-- NÍVEL 0: Setores -->
    <template v-if="view === 'setores'">
      <div v-if="loadingDados" class="flex justify-center py-12 text-slate-400">
        <span class="spinner !border-slate-300 !border-t-sky-600"></span>
      </div>
      <div v-else-if="erroCarregamento" class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
        {{ erroCarregamento }}
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div v-for="s in statsPorArea" :key="s.area"
          class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all">
          <h3 class="font-bold text-slate-800 text-base mb-3">{{ s.area }}</h3>
          <div class="flex items-center gap-6 mb-4">
            <div>
              <p class="text-2xl font-extrabold text-slate-700">{{ s.total }}</p>
              <p class="text-[11px] text-slate-400 uppercase font-semibold tracking-wide">Equipamentos</p>
            </div>
            <div>
              <p class="text-2xl font-extrabold" :class="s.pendentes > 0 ? 'text-amber-600' : 'text-emerald-600'">{{ s.pendentes }}</p>
              <p class="text-[11px] text-slate-400 uppercase font-semibold tracking-wide">Pendentes no ciclo</p>
            </div>
          </div>
          <button @click="abrirArea(s.area)"
            class="btn-tap w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 rounded-lg text-sm">
            Acessar Área →
          </button>
        </div>
      </div>
    </template>

    <!-- NÍVEL 1: Lista de Equipamentos -->
    <template v-else-if="view === 'lista'">
      <div v-if="loadingDados" class="flex justify-center py-12 text-slate-400">
        <span class="spinner !border-slate-300 !border-t-sky-600"></span>
      </div>
      <div v-else-if="erroCarregamento" class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
        {{ erroCarregamento }}
      </div>
      <div v-else-if="equipamentosDaAreaAtual.length === 0" class="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-400">
        Nenhum equipamento cadastrado para esta área.
      </div>
      <template v-else>
        <div class="bg-white rounded-xl border border-slate-200 p-4">
          <div class="flex justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>Progresso do setor</span>
            <span>{{ progressoSetor.feitos }}/{{ progressoSetor.total }}</span>
          </div>
          <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full bg-emerald-500 transition-all duration-300" :style="{ width: progressoSetor.pct + '%' }"></div>
          </div>
        </div>

        <div v-if="periodicidadesDaArea.length" class="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button @click="filtroPeriodicidadeLista = 'todas'"
            class="btn-tap whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
            :class="filtroPeriodicidadeLista === 'todas' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-500'">
            Todas
          </button>
          <button v-for="p in periodicidadesDaArea" :key="p" @click="filtroPeriodicidadeLista = p"
            class="btn-tap whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
            :class="filtroPeriodicidadeLista === p ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-500'">
            {{ p }}
          </button>
        </div>

        <div class="space-y-3">
          <button v-for="eq in equipamentosFiltradosLista" :key="eq.chave" @click="abrirEquipamento(eq)"
            class="w-full text-left btn-tap bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-sky-300 hover:shadow-md transition-all flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="font-semibold text-slate-800 truncate">
                <span v-if="eq.idDisplay" class="text-slate-400 font-mono text-sm mr-1">[{{ eq.idDisplay }}]</span>{{ eq.nome }}<span v-if="eq.modelo" class="text-slate-400 font-normal"> — {{ eq.modelo }}</span>
              </p>
              <p v-if="eq.perfis && eq.perfis.length" class="flex flex-wrap gap-1 mt-1">
                <span v-for="perfil in eq.perfis" :key="perfil.id" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 uppercase tracking-wide">{{ perfil.periodicidade || 'Geral' }}</span>
              </p>
              <p class="text-xs text-slate-400 mt-1 truncate">
                <template v-if="ultimaInspecao(eq)">Última inspeção: {{ formatarStatusLabel(ultimaInspecao(eq).status) }} · {{ formatarData(ultimaInspecao(eq).dataObj) }}</template>
                <template v-else>Sem inspeção registrada</template>
              </p>
            </div>
            <span class="text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0" :class="statusCicloEquipamento(eq).badge">
              {{ statusCicloEquipamento(eq).label }}
            </span>
          </button>
        </div>
      </template>
    </template>

    <!-- NÍVEL 2: Execução do Checklist -->
    <template v-else-if="view === 'detalhe' && equipamentoSelecionado">
      <button @click="voltarLista" class="btn-tap flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-sky-600">
        ← Voltar à lista de equipamentos
      </button>

      <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <p class="font-bold text-slate-800">
          <span v-if="equipamentoSelecionado.idDisplay" class="text-slate-400 font-mono text-sm mr-1">[{{ equipamentoSelecionado.idDisplay }}]</span>{{ equipamentoSelecionado.nome }}
        </p>
        <p v-if="equipamentoSelecionado.modelo" class="text-sm text-slate-500 mt-0.5">Modelo: {{ equipamentoSelecionado.modelo }}</p>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Executor/Inspetor *</label>
        <input v-model="nomeExecutor" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
      </div>

      <div class="space-y-3">
        <template v-for="bloco in blocosChecklist" :key="bloco.periodicidade">
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full" :class="corPeriodicidadeItem(bloco.periodicidade)">{{ bloco.periodicidade }}</span>
            {{ tituloBloco(bloco.periodicidade) }}
          </h4>
          <div v-for="(item, itemIdx) in bloco.itens" :key="bloco.periodicidade + '-' + itemIdx" class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p class="font-semibold text-slate-800 mb-3">{{ item.texto }}</p>
            <div class="grid grid-cols-3 gap-2">
              <button @click="setItemStatus(item, 'C')"
                class="btn-tap py-2.5 rounded-lg text-sm font-bold border-2 transition-colors"
                :class="item.status === 'C' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-emerald-50 border-emerald-200 text-emerald-700'">
                ✓ C
              </button>
              <button @click="setItemStatus(item, 'NC')"
                class="btn-tap py-2.5 rounded-lg text-sm font-bold border-2 transition-colors"
                :class="item.status === 'NC' ? 'bg-red-500 border-red-500 text-white' : 'bg-red-50 border-red-200 text-red-700'">
                ✗ NC
              </button>
              <button @click="setItemStatus(item, 'NA')"
                class="btn-tap py-2.5 rounded-lg text-sm font-bold border-2 transition-colors"
                :class="item.status === 'NA' ? 'bg-slate-500 border-slate-500 text-white' : 'bg-slate-100 border-slate-200 text-slate-600'">
                - NA
              </button>
            </div>

            <div v-if="item.status === 'NC'" class="mt-3 bg-red-50 border-2 border-red-200 rounded-lg p-3 space-y-2">
              <label class="block text-xs font-semibold text-red-700 uppercase tracking-wide">Desvio apontado *</label>
              <textarea v-model="item.observacao" rows="2" class="w-full rounded-lg border border-red-300 px-3 py-2 text-sm focus:ring-2 focus:ring-red-500"></textarea>

              <label class="block text-xs font-semibold text-red-700 uppercase tracking-wide">Evidência Fotográfica *</label>
              <div class="flex gap-2">
                <button type="button" @click="abrirCameraItem(item)" class="btn-tap flex-1 bg-white border-2 border-red-300 text-red-700 font-semibold py-2 rounded-lg text-xs">📷 Tirar Foto</button>
                <button type="button" @click="abrirGaleriaItem(item)" class="btn-tap flex-1 bg-white border-2 border-red-300 text-red-700 font-semibold py-2 rounded-lg text-xs">📁 Galeria</button>
              </div>
              <div v-if="item.fotoBase64" class="flex items-center gap-3 bg-white border border-red-200 rounded-lg p-2">
                <img :src="item.fotoBase64" class="w-14 h-14 object-cover rounded border" />
                <p class="text-xs text-slate-600 truncate flex-1">{{ item.fotoNome }}</p>
                <button type="button" @click="removerFotoItem(item)" class="text-red-600 font-bold px-2">✕</button>
              </div>
            </div>

            <div v-if="item.status === 'NA'" class="mt-3 bg-slate-50 border-2 border-slate-200 rounded-lg p-3 space-y-2">
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Justificativa *</label>
              <textarea v-model="item.observacao" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-slate-500"></textarea>
            </div>
          </div>
        </template>

        <input ref="inputCameraRef" type="file" accept="image/*" capture="environment" class="hidden" @change="onFotoSelecionada" />
        <input ref="inputGaleriaRef" type="file" accept="image/*" class="hidden" @change="onFotoSelecionada" />

        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Observações adicionais (opcional)</label>
          <textarea v-model="observacoesGerais" rows="2" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"></textarea>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide">✍️ Assinatura Digital</h4>
          <assinatura-canvas label="Assinatura do Inspetor / Responsável" @update="onAssinaturaInspetor"></assinatura-canvas>
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nome do Supervisor *</label>
            <input v-model="assinaturaSupervisorNome" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <assinatura-canvas label="Assinatura do Supervisor" @update="onAssinaturaSupervisor"></assinatura-canvas>
        </div>

        <button @click="salvarInspecao" :disabled="salvando"
          class="btn-tap w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl shadow-md mt-2 sticky bottom-3">
          <span v-if="salvando" class="spinner"></span>
          <span>{{ salvando ? "Gravando na Base..." : "Salvar Inspeção do Equipamento" }}</span>
        </button>
      </div>
    </template>

    <!-- NÍVEL 3: Histórico -->
    <template v-else-if="view === 'historico'">
      <div class="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select v-model="filtroAno" class="rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white">
            <option value="todos">Ano: Todos</option>
            <option v-for="a in anosDisponiveis" :key="a" :value="a">{{ a }}</option>
          </select>
          <select v-model="filtroMes" class="rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white">
            <option value="todos">Mês: Todos</option>
            <option v-for="m in meses" :key="m.v" :value="m.v">{{ m.l }}</option>
          </select>
          <select v-model="filtroArea" class="rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white">
            <option value="todas">Setor: Todos</option>
            <option v-for="a in areas" :key="a" :value="a">{{ a }}</option>
          </select>
          <select v-model="filtroPeriodicidade" class="rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white">
            <option value="todas">Periodicidade: Todas</option>
            <option v-for="p in periodicidadesCanonicas" :key="p" :value="p">{{ p }}</option>
          </select>
        </div>

        <input v-model="filtroBusca" type="text" placeholder="Buscar por equipamento ou ID..."
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />

        <div class="flex items-center justify-between flex-wrap gap-2">
          <button @click="limparFiltrosHistorico" class="text-sky-600 text-xs font-semibold btn-tap">✕ Limpar Filtros</button>
          <div class="flex gap-2">
            <button @click="exportarExcel" class="btn-tap text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700">📊 Exportar Excel</button>
            <button @click="exportarPDF" class="btn-tap text-xs font-semibold px-3 py-1.5 rounded-full border border-red-300 bg-red-50 text-red-700">📄 Exportar PDF</button>
          </div>
        </div>
      </div>

      <div class="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        <div v-for="h in historicoPaginado" :key="h.id" class="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
          <div class="flex items-start justify-between gap-2 mb-1">
            <div class="min-w-0">
              <p class="font-semibold text-slate-800 truncate">{{ h.equipamento || 'Equipamento' }}</p>
              <p class="text-xs text-slate-400 truncate">{{ h.area }} · #{{ h.id }}</p>
            </div>
            <span class="text-xs font-bold px-2 py-0.5 rounded-full"
              :class="h.status === 'NC' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'">
              {{ formatarStatusLabel(h.status) }}
            </span>
          </div>
          <p v-if="h.observacoes" class="text-sm text-slate-600 mt-1">{{ h.observacoes }}</p>
          <div class="flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 pt-2 mt-2">
            <span>👤 {{ h.usuario || '—' }}</span>
            <span>{{ formatarData(h.data) }}</span>
          </div>
          <div class="flex gap-1.5 mt-2">
            <button @click="abrirLaudoHistorico(h)" class="btn-tap flex-1 text-xs font-semibold text-sky-600 border border-sky-200 bg-sky-50 rounded-lg py-1.5">
              👁️ Visualizar Laudo
            </button>
            <template v-if="souAdmin">
              <button @click="abrirEdicaoLog(h)" class="btn-tap text-xs font-semibold text-amber-700 border border-amber-200 bg-amber-50 rounded-lg py-1.5 px-3">✏️ Editar</button>
              <button @click="pedirExclusaoLog(h)" class="btn-tap text-xs font-semibold text-red-700 border border-red-200 bg-red-50 rounded-lg py-1.5 px-3">🗑️ Excluir</button>
            </template>
          </div>
        </div>
      </div>
    </template>

    <!-- NÍVEL 4: Calendário Mestre -->
    <template v-else-if="view === 'calendario'">
      <div class="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <select v-model="calendarioArea" class="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white">
          <option value="todas">Setor: Todos</option>
          <option v-for="a in areas" :key="a" :value="a">{{ a }}</option>
        </select>
        <div class="flex items-center justify-center gap-4">
          <button @click="calendarioAnoAnterior" class="btn-tap w-9 h-9 rounded-full border border-slate-300 text-slate-600 font-bold">‹</button>
          <span class="font-extrabold text-xl text-slate-800 w-20 text-center">{{ calendarioAno }}</span>
          <button @click="calendarioAnoProximo" class="btn-tap w-9 h-9 rounded-full border border-slate-300 text-slate-600 font-bold">›</button>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table class="text-xs border-collapse w-full">
          <thead>
            <tr class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th class="sticky left-0 bg-slate-50 text-left font-bold px-3 py-2">Equipamento</th>
              <th v-for="m in meses" :key="m.v" class="font-bold px-1.5 py-2 text-center">{{ m.l.slice(0, 3) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ativo in ativosCalendario" :key="ativo.chave" class="border-t border-slate-100">
              <td class="sticky left-0 bg-white text-left px-3 py-2 font-semibold text-slate-700">
                <span v-if="ativo.idDisplay" class="text-slate-400 font-mono mr-1">[{{ ativo.idDisplay }}]</span>{{ ativo.nome }}
              </td>
              <td v-for="m in meses" :key="m.v" class="px-1 py-2 text-center align-middle">
                <div v-if="perfisNaCelula(ativo, m.v).length" class="flex flex-wrap items-center justify-center gap-0.5">
                  <button v-for="(perfil, pIdx) in perfisNaCelula(ativo, m.v)" :key="pIdx" @click="abrirEquipamento(perfil)"
                    class="btn-tap w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center"
                    :class="CORES_CELULA[statusCelula(ativo, m.v, calendarioAno)]">
                    {{ tagPeriodicidade(perfil.periodicidade) }}
                  </button>
                </div>
                <span v-else class="text-slate-300">–</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <laudo-preventiva-modal v-if="laudoAberto" :laudo="laudoAtual" :modo-pos-salvar="laudoModoPosSalvar"
      @fechar="fecharLaudo" @nova-inspecao="laudoNovaInspecao" @ir-inicio="laudoIrInicio">
    </laudo-preventiva-modal>

    <alerta-whats-app-modal v-if="alertaWhatsAppAberto" :dados="alertaWhatsAppDados" @fechar="fecharAlertaWhatsApp"></alerta-whats-app-modal>
  </div>`
};

/* ==========================================================================
   ORDEM DE SERVIÇO DE MANUTENÇÃO CORRETIVA (RSG-6302-02)
   ========================================================================== */
const RSG_CODIGO_CORRETIVA = "RSG-6302-02";
const RSG_TITULO_CORRETIVA = "RSG-6302-02 - Ordem de Serviço de Manutenção Corretiva";

function formatarDowntime(inicio, fim) {
  if (!inicio || !fim) return "-";
  const di = new Date(inicio), df = new Date(fim);
  if (isNaN(di.getTime()) || isNaN(df.getTime())) return "-";
  const totalMin = Math.floor((df.getTime() - di.getTime()) / 60000);
  if (totalMin < 0) return "-";
  const dias = Math.floor(totalMin / 1440);
  const horas = Math.floor((totalMin % 1440) / 60);
  const min = totalMin % 60;
  const partes = [];
  if (dias) partes.push(dias + "d");
  if (dias || horas) partes.push(horas + "h");
  partes.push(min + "min");
  return partes.join(" ");
}

const LaudoCorretivaModal = {
  props: { laudo: Object, modoPosSalvar: Boolean },
  emits: ["fechar"],
  setup(props) {
    const exportandoPdf = ref(false);

    function formatarDataHora(v) {
      if (!v) return "-";
      const d = v instanceof Date ? v : new Date(v);
      if (isNaN(d.getTime())) return String(v);
      return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    function imagensAnexadas(laudo) { return (laudo.anexos || []).filter(a => a.tipo === "imagem"); }
    function documentosAnexados(laudo) { return (laudo.anexos || []).filter(a => a.tipo === "documento"); }

    const nomeArquivo = computed(() => {
      const l = props.laudo || {};
      const dataParte = String(l.dataAbertura || "").split(" ")[0] || new Date().toISOString().slice(0, 10);
      const idParte = sanitizarNomeArquivo(l.idChamado || "chamado");
      return `${RSG_CODIGO_CORRETIVA}_${idParte}_${dataParte}.pdf`;
    });

    function imprimir() { window.print(); }

    function exportarPDF() {
      if (typeof window.jspdf === "undefined" || typeof window.html2canvas === "undefined") {
        pushToast("Biblioteca PDF não carregou.", "error");
        return;
      }
      const elemento = document.getElementById("laudo-imprimivel");
      if (!elemento) return;
      exportandoPdf.value = true;
      try {
        const doc = new window.jspdf.jsPDF("p", "pt", "a4");
        doc.html(elemento, {
          margin: [24, 24, 24, 24],
          autoPaging: "text",
          html2canvas: { scale: 0.72, useCORS: true, backgroundColor: "#ffffff" },
          width: 547,
          windowWidth: elemento.scrollWidth || 780,
          callback: (docFinal) => {
            docFinal.save(nomeArquivo.value);
            exportandoPdf.value = false;
          },
        });
      } catch (err) {
        console.error(err);
        pushToast("Erro ao exportar PDF.", "error");
        exportandoPdf.value = false;
      }
    }

    return { exportandoPdf, formatarDataHora, formatarDowntime, imagensAnexadas, documentosAnexados, nomeArquivo, imprimir, exportarPDF, RSG_CODIGO_CORRETIVA, RSG_TITULO_CORRETIVA };
  },
  template: `
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4">
    <div class="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] overflow-y-auto">
      <div class="no-print sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
        <h3 class="font-bold text-slate-800">Ordem de Serviço de Manutenção Corretiva</h3>
        <button v-if="!modoPosSalvar" @click="$emit('fechar')" class="btn-tap text-slate-400 hover:text-slate-600 text-xl leading-none px-2">✕</button>
      </div>

      <div id="laudo-imprimivel" class="p-5 space-y-4" v-if="laudo">
        <div class="border-b-2 border-slate-800 pb-3">
          <p class="text-xs font-bold text-orange-700 uppercase tracking-wide">Hidrogeron - Sistema de Manutenção</p>
          <h2 class="text-lg font-extrabold text-slate-900 mt-0.5">{{ RSG_TITULO_CORRETIVA }}</h2>
          <div class="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-500">
            <p><span class="font-semibold text-slate-700">Protocolo/Chamado ID:</span> #{{ laudo.idChamado }}</p>
            <p><span class="font-semibold text-slate-700">Tempo de Parada:</span> {{ formatarDowntime(laudo.dataAbertura, laudo.dataConclusao) }}</p>
          </div>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Dados do Ativo</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <p><span class="text-slate-400">Setor/Área:</span> <span class="font-medium text-slate-800">{{ laudo.area || '-' }}</span></p>
            <p><span class="text-slate-400">ID:</span> <span class="font-medium text-slate-800">{{ laudo.equipamentoIdDisplay || '-' }}</span></p>
            <p class="col-span-2"><span class="text-slate-400">Equipamento:</span> <span class="font-medium text-slate-800">{{ laudo.equipamentoNome || '-' }}</span></p>
          </div>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Intervenção Técnica</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-1.5 text-sm">
            <p><span class="text-slate-400">Técnico Executor:</span> <span class="font-medium text-slate-800">{{ laudo.tecnico || '-' }}</span></p>
            <p><span class="text-slate-400">Diagnóstico da Causa Raiz:</span> <span class="text-slate-700">{{ laudo.diagnostico || '-' }}</span></p>
            <p><span class="text-slate-400">Resolução / Ação:</span> <span class="text-slate-700">{{ laudo.resolucao || '-' }}</span></p>
          </div>
        </div>
      </div>

      <div class="no-print px-5 pb-5 pt-2 grid grid-cols-2 gap-2 sticky bottom-0 bg-white border-t border-slate-200 mt-2">
        <button @click="imprimir" class="btn-tap flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-lg text-sm">🖨️ Imprimir</button>
        <button @click="exportarPDF" :disabled="exportandoPdf" class="btn-tap flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg text-sm">📄 Exportar PDF</button>
        <button @click="$emit('fechar')" class="btn-tap col-span-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 rounded-lg text-sm">Fechar</button>
      </div>
    </div>
  </div>`
};

/* ==========================================================================
   ORDEM DE SERVIÇO DE ABERTURA — RSG-6302-01
   ========================================================================== */
const RSG_CODIGO_OS_CORRETIVA = "RSG-6302-01";
const RSG_TITULO_OS_CORRETIVA = "RSG-6302-01 - Ordem de Serviço de Manutenção Corretiva";

const OrdemServicoModal = {
  props: { chamado: Object },
  emits: ["fechar"],
  setup(props) {
    const exportandoPdf = ref(false);
    function formatarDataHora(v) {
      if (!v) return "-";
      const d = parseDataHoraLocal(v);
      if (!d || isNaN(d.getTime())) return String(v);
      return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    function imprimir() { window.print(); }
    return { exportandoPdf, formatarDataHora, imprimir, RSG_CODIGO_OS_CORRETIVA, RSG_TITULO_OS_CORRETIVA };
  },
  template: `
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
    <div class="bg-white w-full max-w-2xl rounded-2xl shadow-2xl p-5 space-y-4">
      <div class="flex items-center justify-between border-b pb-3">
        <h3 class="font-bold text-slate-800">{{ RSG_TITULO_OS_CORRETIVA }}</h3>
        <button @click="$emit('fechar')" class="text-slate-400 hover:text-slate-600 text-xl">✕</button>
      </div>
      <div class="space-y-2 text-sm">
        <p><strong>OS:</strong> #{{ chamado && chamado.id }}</p>
        <p><strong>Equipamento:</strong> {{ chamado && chamado.equipamento }} ({{ chamado && chamado.area }})</p>
        <p><strong>Prioridade:</strong> {{ chamado && chamado.prioridade }}</p>
        <p><strong>Descrição:</strong> {{ chamado && chamado.descricao }}</p>
      </div>
      <div class="flex justify-end gap-2 border-t pt-3">
        <button @click="imprimir" class="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold">🖨️ Imprimir</button>
        <button @click="$emit('fechar')" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold">Fechar</button>
      </div>
    </div>
  </div>`
};

/* ==========================================================================
   MÓDULO CORRETIVA
   ========================================================================== */
const CorretivaModule = {
  props: { user: Object },
  components: { AssinaturaCanvas, LaudoCorretivaModal, OrdemServicoModal, AlertaWhatsAppModal },
  setup(props) {
    const prioridades = PRIORIDADES;
    const form = reactive({
      area: "Uso Geral",
      equipamento: "",
      prioridade: "Média",
      descricao: "",
    });
    const enviando = ref(false);
    const alertaWhatsAppAberto = ref(false);
    const alertaWhatsAppDados = ref(null);
    function fecharAlertaWhatsApp() { alertaWhatsAppAberto.value = false; }

    const confirmacaoAberturaAberta = ref(false);
    const confirmacaoAberturaChamado = ref(null);
    const osImpressaoAberta = ref(false);
    const osImpressaoChamado = ref(null);
    function abrirOSImpressao(chamado) { osImpressaoChamado.value = chamado; osImpressaoAberta.value = true; }
    function fecharOSImpressao() { osImpressaoAberta.value = false; osImpressaoChamado.value = null; }
    function fecharConfirmacaoAbertura() {
      confirmacaoAberturaAberta.value = false;
      confirmacaoAberturaChamado.value = null;
      alertaWhatsAppAberto.value = true;
    }
    function imprimirOSDaConfirmacao() {
      const chamado = confirmacaoAberturaChamado.value;
      fecharConfirmacaoAbertura();
      abrirOSImpressao(chamado);
    }

    const chamados = ref([]);
    const chamadosEncerrados = ref([]);
    const loadingChamados = ref(true);
    const erroChamados = ref("");
    const aba = ref("abertos");

    const filtroBuscaCorretiva = ref("");
    const filtroAreaCorretiva = ref("todas");
    const filtroStatusCorretiva = ref("todos");
    const filtroPrioridadeCorretiva = ref("todas");
    function limparFiltrosCorretiva() {
      filtroBuscaCorretiva.value = "";
      filtroAreaCorretiva.value = "todas";
      filtroStatusCorretiva.value = "todos";
      filtroPrioridadeCorretiva.value = "todas";
    }

    function aplicarFiltrosCorretiva(lista) {
      const termo = filtroBuscaCorretiva.value.trim().toLowerCase();
      return (lista || []).filter(c => {
        if (filtroAreaCorretiva.value !== "todas" && normalizarTexto(c.area) !== normalizarTexto(filtroAreaCorretiva.value)) return false;
        if (filtroPrioridadeCorretiva.value !== "todas" && c.prioridade !== filtroPrioridadeCorretiva.value) return false;
        if (filtroStatusCorretiva.value === "aberto" && !isStatusChamadoAberto(c.status)) return false;
        if (filtroStatusCorretiva.value === "fechado" && isStatusChamadoAberto(c.status)) return false;
        if (termo) {
          const alvo = `${c.equipamento || ""} ${c.id || ""} ${c.solicitante || ""}`.toLowerCase();
          if (!alvo.includes(termo)) return false;
        }
        return true;
      });
    }

    const todosEquipamentosCorretiva = ref([]);
    const areas = computed(() => unirAreas(todosEquipamentosCorretiva.value));

    async function carregarChamados(opts) {
      const silencioso = opts && opts.silencioso;
      if (!silencioso) {
        loadingChamados.value = true;
        erroChamados.value = "";
      }
      try {
        const data = await getInitialData();
        const todos = extractCorretivas(data);
        chamados.value = todos.filter(c => isStatusChamadoAberto(c.status)).sort((a, b) => new Date(b.data) - new Date(a.data));
        chamadosEncerrados.value = todos.filter(c => !isStatusChamadoAberto(c.status)).sort((a, b) => new Date(b.dataConclusao || b.data) - new Date(a.dataConclusao || a.data));

        const rawEquipData = data.equipamentos || data.Equipamentos || (data.data && data.data.equipamentos) || [];
        const rawEquip = comFallbackEquipamentosTI(Array.isArray(rawEquipData) ? rawEquipData : []);
        todosEquipamentosCorretiva.value = rawEquip.map(e => ({
          idDisplay: e.ID || e.id || "",
          nome: e.Nome || e.Equipamento || e.nome || "Equipamento",
          modelo: e.Modelo || e.modelo || "",
          area: e.Area || e.area || "",
        }));
      } catch (err) {
        console.error(err);
        if (!silencioso) erroChamados.value = "Não foi possível carregar chamados.";
      } finally {
        if (!silencioso) loadingChamados.value = false;
      }
    }

    async function abrirChamado() {
      if (!form.equipamento.trim()) return pushToast("Informe o equipamento.", "error");
      if (!form.descricao.trim()) return pushToast("Descreva a falha.", "error");
      enviando.value = true;
      try {
        const dataAbertura = formatarDataHoraLocalISO();
        const payload = {
          action: "saveCorretiva",
          area: form.area,
          equipamento: form.equipamento.trim(),
          descricaoProblema: form.descricao.trim(),
          prioridade: form.prioridade,
          solicitante: props.user.nome || "Produção",
          dataAbertura,
        };
        const resp = await postToAppsScript(payload);
        const idChamado = (resp && (resp.id || resp.ID || resp.idChamado)) || uid();

        form.equipamento = "";
        form.descricao = "";
        form.prioridade = "Média";

        const novoChamado = {
          id: idChamado, area: payload.area, equipamento: payload.equipamento,
          descricao: payload.descricaoProblema, prioridade: payload.prioridade,
          solicitante: payload.solicitante, status: "Aberto", data: dataAbertura,
          anexos: []
        };
        chamados.value.unshift(novoChamado);
        pushToast("Chamado aberto com sucesso!", "success");

        confirmacaoAberturaChamado.value = novoChamado;
        confirmacaoAberturaAberta.value = true;
      } catch (err) {
        console.error(err);
        pushToast("Erro ao abrir chamado.", "error");
      } finally {
        enviando.value = false;
      }
    }

    const modalAberto = ref(false);
    const chamadoSelecionado = ref(null);
    const diagnosticoTexto = ref("");
    const resolucaoTexto = ref("");
    const pecasTexto = ref("");
    const fotoConclusaoBase64 = ref(null);
    const fotoConclusaoNome = ref("");
    const encerrando = ref(false);

    function abrirModalEncerramento(chamado) {
      chamadoSelecionado.value = chamado;
      diagnosticoTexto.value = "";
      resolucaoTexto.value = "";
      pecasTexto.value = "";
      fotoConclusaoBase64.value = null;
      fotoConclusaoNome.value = "";
      modalAberto.value = true;
    }
    function fecharModal() {
      if (encerrando.value) return;
      modalAberto.value = false;
      chamadoSelecionado.value = null;
    }

    async function confirmarEncerramento() {
      if (!diagnosticoTexto.value.trim() || !resolucaoTexto.value.trim()) {
        return pushToast("Preencha o diagnóstico e a resolução.", "error");
      }
      const chamado = chamadoSelecionado.value;
      const tecnico = props.user.nome || "Manutenção";
      const resolucaoCompleta = `[DIAGNOSTICO] ${diagnosticoTexto.value.trim()} | [RESOLUCAO] ${resolucaoTexto.value.trim()}` + (pecasTexto.value.trim() ? ` | [PECAS] ${pecasTexto.value.trim()}` : "");

      encerrando.value = true;
      try {
        await postToAppsScript({
          action: "closeCorretiva",
          id: chamado.id,
          resolucao: resolucaoCompleta,
          tecnico: tecnico,
          dataFechamento: formatarDataHoraLocalISO()
        });

        chamado.status = "Fechado";
        chamado.dataConclusao = formatarDataHoraLocalISO();
        chamado.resolucao = resolucaoCompleta;
        chamado.tecnico = tecnico;

        chamados.value = chamados.value.filter(c => c.id !== chamado.id);
        chamadosEncerrados.value.unshift(chamado);

        pushToast(`Chamado #${chamado.id} encerrado!`, "success");
        modalAberto.value = false;
        setTimeout(() => carregarChamados({ silencioso: true }), 2000);
      } catch (err) {
        console.error(err);
        pushToast("Erro ao encerrar chamado.", "error");
      } finally {
        encerrando.value = false;
      }
    }

    function corPrioridade(p) {
      const found = prioridades.find(x => x.value === p);
      return found ? found.color : "bg-slate-100 text-slate-700";
    }

    function formatarData(iso) {
      if (!iso) return "-";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    }

    const chamadosFiltrados = computed(() => aplicarFiltrosCorretiva(chamados.value));
    const chamadosEncerradosFiltrados = computed(() => aplicarFiltrosCorretiva(chamadosEncerrados.value));

    onMounted(carregarChamados);
    onMounted(() => carregarCadastrosMestres());

    return {
      areas, prioridades, form, enviando, abrirChamado,
      confirmacaoAberturaAberta, confirmacaoAberturaChamado, fecharConfirmacaoAbertura, imprimirOSDaConfirmacao,
      osImpressaoAberta, osImpressaoChamado, abrirOSImpressao, fecharOSImpressao,
      chamados, chamadosEncerrados, loadingChamados, erroChamados, aba, corPrioridade, formatarData, carregarChamados,
      chamadosFiltrados, chamadosEncerradosFiltrados,
      filtroBuscaCorretiva, filtroAreaCorretiva, filtroStatusCorretiva, filtroPrioridadeCorretiva, limparFiltrosCorretiva,
      modalAberto, chamadoSelecionado, diagnosticoTexto, resolucaoTexto, pecasTexto, encerrando,
      abrirModalEncerramento, fecharModal, confirmarEncerramento,
    };
  },
  template: `
  <div class="space-y-6">
    <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
      <h2 class="font-bold text-slate-800 flex items-center gap-2">🛠️ Abrir Chamado de Manutenção Corretiva</h2>
      <div>
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Área</label>
        <select v-model="form.area" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white">
          <option v-for="a in areas" :key="a" :value="a">{{ a }}</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Equipamento</label>
        <input v-model="form.equipamento" type="text" placeholder="Ex: Torno CNC" class="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Prioridade</label>
        <div class="grid grid-cols-4 gap-2">
          <button v-for="p in prioridades" :key="p.value" @click="form.prioridade = p.value"
            class="btn-tap py-2 rounded-lg text-xs font-bold border-2"
            :class="form.prioridade === p.value ? p.color : 'bg-slate-50 border-slate-200 text-slate-400'">
            {{ p.value }}
          </button>
        </div>
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Descrição da falha</label>
        <textarea v-model="form.descricao" rows="3" class="w-full rounded-lg border border-slate-300 px-3 py-2.5"></textarea>
      </div>
      <button @click="abrirChamado" :disabled="enviando" class="btn-tap w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3.5 rounded-xl shadow-md">
        {{ enviando ? 'Enviando...' : '+ Abrir Novo Chamado' }}
      </button>
    </div>

    <div>
      <div class="flex gap-2 mb-3">
        <button @click="aba = 'abertos'" class="btn-tap px-3 py-1.5 rounded-full text-xs font-semibold border"
          :class="aba === 'abertos' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-500'">
          Abertos ({{ chamadosFiltrados.length }})
        </button>
        <button @click="aba = 'encerrados'" class="btn-tap px-3 py-1.5 rounded-full text-xs font-semibold border"
          :class="aba === 'encerrados' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-500'">
          Encerrados ({{ chamadosEncerradosFiltrados.length }})
        </button>
      </div>

      <div v-if="aba === 'abertos'" class="space-y-3">
        <div v-for="c in chamadosFiltrados" :key="c.id" class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div class="flex items-start justify-between">
            <div>
              <p class="font-semibold text-slate-800">#{{ c.id }} - {{ c.equipamento }}</p>
              <p class="text-xs text-slate-400">{{ c.area }}</p>
            </div>
            <span class="text-xs font-bold px-2.5 py-1 rounded-full border" :class="corPrioridade(c.prioridade)">{{ c.prioridade }}</span>
          </div>
          <p class="text-sm text-slate-600 my-2">{{ c.descricao }}</p>
          <button @click="abrirModalEncerramento(c)" class="btn-tap w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2 rounded-lg text-sm">
            ⚙️ Atender / Encerrar Chamado
          </button>
        </div>
      </div>

      <div v-if="aba === 'encerrados'" class="space-y-3">
        <div v-for="c in chamadosEncerradosFiltrados" :key="c.id" class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm opacity-80">
          <p class="font-semibold text-slate-800">#{{ c.id }} - {{ c.equipamento }}</p>
          <p class="text-xs text-slate-400">{{ c.area }} · Concluído em {{ formatarData(c.dataConclusao || c.data) }}</p>
          <p class="text-sm text-slate-600 mt-2">{{ c.resolucao }}</p>
        </div>
      </div>
    </div>

    <!-- Modal Encerramento -->
    <div v-if="modalAberto" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div class="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-5 space-y-4">
        <h3 class="font-bold text-slate-800">Encerrar Chamado #{{ chamadoSelecionado && chamadoSelecionado.id }}</h3>
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Diagnóstico *</label>
          <textarea v-model="diagnosticoTexto" rows="2" class="w-full rounded-lg border border-slate-300 p-2 text-sm"></textarea>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Resolução *</label>
          <textarea v-model="resolucaoTexto" rows="2" class="w-full rounded-lg border border-slate-300 p-2 text-sm"></textarea>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Peças Substituídas</label>
          <input v-model="pecasTexto" type="text" class="w-full rounded-lg border border-slate-300 p-2 text-sm" />
        </div>
        <div class="flex justify-end gap-2 border-t pt-3">
          <button @click="fecharModal" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold">Cancelar</button>
          <button @click="confirmarEncerramento" :disabled="encerrando" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold">
            {{ encerrando ? 'Concluindo...' : 'Concluir Chamado' }}
          </button>
        </div>
      </div>
    </div>
  </div>`
};

window.PreventivaModule = PreventivaModule;
window.CorretivaModule = CorretivaModule;