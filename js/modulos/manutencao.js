/* ==========================================================================
   js/modulos/manutencao.js — Preventiva (RSG-6301-01) e Corretiva
   (RSG-6302-01/02)
   Normalização de logs/chamados, helpers de periodicidade e de checklist de
   TI, assinatura digital em tela, seletor multi-mês, alerta de WhatsApp, e
   os componentes Vue de Preventiva e Corretiva (incluindo Kanban/calendário
   e as Ordens de Serviço impressas). Depende de js/api.js e do núcleo
   compartilhado do index.html.
   ========================================================================== */
const PRIORIDADES = [
  { value: "Baixa",   color: "bg-blue-100 text-blue-700 border-blue-300" },
  { value: "Média",   color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  { value: "Alta",    color: "bg-orange-100 text-orange-700 border-orange-300" },
  { value: "Crítica", color: "bg-red-100 text-red-700 border-red-300" },
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
    // Não fazem parte do schema original informado, mas são aproveitados se existirem
    // (preenchidos pelo fluxo de encerramento / usados no cálculo de MTTR).
    dataConclusao: c.DataConclusao || c.dataConclusao || c.DataFechamento || c.dataFechamento || c.DataResolucao || c.dataResolucao || "",
    resolucao: c.Resolucao || c.resolucao || c.Resolução || c.resolução || "",
    tecnico: c.Tecnico || c.tecnico || c.Técnico || c.técnico || "",
  };
}
function extractPreventivas(data) {
  const raw = (data && (data.preventivas || data.Preventivas || (data.data && data.data.preventivas))) || [];
  return (Array.isArray(raw) ? raw : []).map(normalizePreventivaLog);
}
// Linhas totalmente em branco (ou sem um ID real da planilha) viravam
// "cards fantasma" na lista: sem ID_Chamado, normalizeCorretivaChamado cai
// no fallback uid() e gera um card com um ID sintético e todo o resto
// vazio. Filtra na fonte, antes de normalizar, exigindo um ID real da
// própria planilha e pelo menos equipamento ou descrição preenchidos.
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
   Usado na validação dos laudos RSG-6301-01 (Preventiva) e RSG-6302-02
   (Corretiva) — dispensa impressão física para colher assinatura.
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
      // Resolução do canvas em pixels reais (não CSS), para o traço não ficar
      // borrado em telas de alta densidade (celulares/tablets).
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
   MÓDULO PREVENTIVA (navegação em 2 níveis: lista de equipamentos → checklist)
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
// ===== Setor de Tecnologia da Informação (ativos geridos pela IRONTECH) =====
// Prestador de serviço externo responsável pela manutenção preventiva de
// todo o parque de TI — usado para sugerir automaticamente o executor do
// checklist e para identificar o prestador no laudo RSG-6301-01.
const AREA_TI = "Tecnologia da Informação";
const PRESTADOR_TI = "IRONTECH";
function ehAreaTI(area) {
  return normalizarTexto(area) === normalizarTexto(AREA_TI);
}
// Data-limite para uma preventiva contar como "no prazo" dentro do mês de
// referência (usada no cálculo de Aderência ao Cronograma). O setor de TI é
// atendido pela IRONTECH (prestador externo) sob um SLA próprio, que não
// segue o calendário interno de produção — por isso qualquer inspeção
// válida dentro do próprio mês conta como no prazo. Os demais setores
// mantêm a meta da 3ª quinta-feira do mês (+24h de tolerância).
function dataLimiteAderencia(ano, mes, area) {
  if (ehAreaTI(area)) {
    return new Date(ano, mes, 0, 23, 59, 59, 999).getTime();
  }
  return getThirdThursday(ano, mes - 1).getTime() + 24 * 3600 * 1000;
}
// Itens de inspeção do checklist RSG-6301-01, específicos por ativo de TI —
// prevalecem sobre o texto livre de "Itens_Inspecao_Recomendados" da
// planilha (quando cadastrado para estes ativos) para garantir que a
// Matriz de Verificação siga exatamente o padrão definido para a IRONTECH.
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
// Hardening: os ativos de TI SEMPRE aparecem na listagem de equipamentos e
// nos seletores de Preventiva/Corretiva, mesmo que a planilha ainda não
// tenha propagado essas linhas (ou demore a responder). A cada carregamento,
// comFallbackEquipamentosTI injeta apenas os ativos que estiverem realmente
// ausentes (comparando por nome) no array bruto vindo do backend — assim que
// a planilha realmente trouxer essas linhas, a injeção some sozinha, sem
// duplicar cards.
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
/* ==========================================================================
   SELETOR MULTI-MÊS (dropdown com checkboxes + atalhos de tri/semestre)
   modelValue é um array de números de mês (1-12). Array vazio = "Todos os
   Meses" — tanto na exibição (todas as caixas aparecem marcadas) quanto na
   filtragem (nenhuma restrição de mês é aplicada).
   ========================================================================== */
const ATALHOS_MESES = [
  { label: "1º Tri", meses: [1, 2, 3] },
  { label: "2º Tri", meses: [4, 5, 6] },
  { label: "3º Tri", meses: [7, 8, 9] },
  { label: "4º Tri", meses: [10, 11, 12] },
  { label: "1º Sem", meses: [1, 2, 3, 4, 5, 6] },
  { label: "2º Sem", meses: [7, 8, 9, 10, 11, 12] },
];
// Periodicidades industriais suportadas e sua janela de validade em dias.
const PERIODICIDADES_ORDEM = ["Diária", "Semanal", "Quinzenal", "Mensal", "Bimestral", "Trimestral", "Semestral", "Anual"];
const PERIODICIDADE_DIAS = {
  "diária": 1, "diaria": 1,
  "semanal": 7,
  "quinzenal": 15,
  "mensal": 30,
  "bimestral": 60,
  "trimestral": 90,
  "semestral": 180,
  "anual": 365,
};
function normalizePeriodicidade(raw) {
  const v = String(raw || "").trim().toLowerCase();
  const encontrada = PERIODICIDADES_ORDEM.find(p => p.toLowerCase() === v);
  return encontrada || String(raw || "").trim();
}
function diasPeriodicidade(periodicidade) {
  const v = String(periodicidade || "").trim().toLowerCase();
  return PERIODICIDADE_DIAS[v] || null;
}
// ===== Calendário Mestre: agendamento mensal por periodicidade =====
// Quantos meses de intervalo entre execuções programadas de cada periodicidade.
const PERIODICIDADE_STEP_MESES = {
  "diária": 1, "diaria": 1, "semanal": 1, "quinzenal": 1,
  "mensal": 1, "bimestral": 2, "trimestral": 3, "semestral": 6, "anual": 12,
};
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
// Meses (1-12) em que a periodicidade do item/equipamento cai, a partir de um
// mês de referência (âncora). Ex.: âncora=Setembro(9) + Semestral(6 em 6
// meses) => [Março, Setembro]; âncora=Setembro + Anual => [Setembro].
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
// Cor da tag/badge de periodicidade exibida nos blocos do checklist.
function corPeriodicidadeItem(p) {
  const v = String(p || "").trim().toLowerCase();
  if (v === "mensal") return "bg-blue-100 text-blue-700";
  if (v === "semestral") return "bg-orange-100 text-orange-700";
  if (v === "anual") return "bg-purple-100 text-purple-700";
  return "bg-slate-100 text-slate-600";
}
// Checagem Semestral: vencimento = Data de Checagem + 180 dias corridos.
function calcularVencimentoChecagem(dataChecagem) {
  const d = parseDataHoraLocal(dataChecagem);
  if (!d) return "";
  const venc = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 180);
  return formatarDataISO(venc);
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

    // Badge da coluna "Condição" da Matriz de Inspeção — ícone + cor por status.
    const CONDICAO_INFO = {
      C: { icone: "✓", classe: "bg-emerald-100 text-emerald-700" },
      NC: { icone: "✗", classe: "bg-red-100 text-red-700" },
      NA: { icone: "⚪", classe: "bg-amber-100 text-amber-700" },
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

    // Identifica claramente no laudo quando a manutenção foi executada pelo
    // prestador de serviço externo IRONTECH (setor de TI, ou inspetor
    // registrado como IRONTECH em laudos antigos sem o campo de área).
    const laudoEhPrestadorExterno = computed(() => {
      const l = props.laudo || {};
      return ehAreaTI(l.area) || normalizarTexto(l.inspetor) === normalizarTexto(PRESTADOR_TI);
    });

    function imprimir() {
      window.print();
    }

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
        <!-- Cabeçalho documental -->
        <div class="border-b-2 border-slate-800 pb-3">
          <p class="text-xs font-bold text-sky-700 uppercase tracking-wide">Hidrogeron - Sistema de Manutenção</p>
          <h2 class="text-lg font-extrabold text-slate-900 mt-0.5">{{ RSG_TITULO }}</h2>
          <div class="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-500">
            <p><span class="font-semibold text-slate-700">Protocolo/Log ID:</span> #{{ laudo.idLog }}</p>
            <p><span class="font-semibold text-slate-700">Data/Hora Execução:</span> {{ formatarDataHora(laudo.dataHora) }}</p>
          </div>
        </div>

        <!-- Dados do Ativo -->
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

        <!-- Responsabilidade Técnica -->
        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Responsabilidade Técnica</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm"><span class="text-slate-400">Inspetor/Técnico:</span> <span class="font-medium text-slate-800">{{ laudo.inspetor || '-' }}</span></p>
              <span class="text-xs font-bold px-3 py-1 rounded-full"
                :class="laudo.statusGeral === 'Não Conforme' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'">
                {{ (laudo.statusGeral || 'Conforme').toUpperCase() }}
              </span>
            </div>
            <p v-if="laudoEhPrestadorExterno" class="text-xs font-bold text-indigo-700 bg-indigo-100 rounded-full px-3 py-1 inline-block">
              🖥️ Prestador de Serviço: IRONTECH (Externo)
            </p>
          </div>
        </div>

        <!-- Matriz de Inspeção -->
        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Matriz de Inspeção</h4>
          <div class="border border-slate-200 rounded-lg overflow-hidden overflow-x-auto">
            <table class="w-full text-sm border-collapse laudo-matriz">
              <thead>
                <tr class="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wide">
                  <th class="text-left font-bold px-2 py-1.5 w-8 border border-slate-200">#</th>
                  <th class="text-left font-bold px-2 py-1.5 border border-slate-200">Ponto de Inspeção / Item</th>
                  <th class="text-left font-bold px-2 py-1.5 border border-slate-200">Periodicidade / Descrição</th>
                  <th class="text-left font-bold px-2 py-1.5 border border-slate-200 whitespace-nowrap">Condição</th>
                  <th class="text-left font-bold px-2 py-1.5 border border-slate-200">Observação / Justificativa</th>
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
                    <img v-if="item.fotoBase64" :src="item.fotoBase64" class="w-16 h-16 object-cover rounded border border-slate-200" alt="Evidência fotográfica do item" />
                    <span v-else class="text-slate-300">-</span>
                  </td>
                </tr>
                <tr v-if="!laudo.itens || !laudo.itens.length">
                  <td colspan="6" class="px-2 py-3 text-center text-xs text-slate-400 italic border border-slate-200">Nenhum item de inspeção cadastrado para este equipamento.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Observações e Anomalias -->
        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Observações e Anomalias</h4>
          <p class="bg-slate-50 rounded-lg border border-slate-200 p-3 text-sm text-slate-700 whitespace-pre-line">
            {{ laudo.observacoes || 'Nenhuma observação registrada.' }}
          </p>
        </div>

        <!-- Rodapé de Validação -->
        <div class="pt-4">
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Validação</h4>
          <div class="grid grid-cols-2 gap-6 text-xs text-slate-500">
            <div>
              <img v-if="laudo.assinaturaInspetor" :src="laudo.assinaturaInspetor" class="h-14 object-contain border-b border-slate-400" alt="Assinatura do Técnico Responsável" />
              <div v-else class="border-b border-slate-400 h-10"></div>
              <p class="mt-1 font-semibold text-slate-700">Técnico Responsável</p>
              <p class="mt-3">Nome: {{ laudo.inspetor || '______________________________' }}</p>
              <p class="mt-2">Data: {{ laudo.assinaturaInspetor ? formatarDataHora(laudo.dataHora) : '____/____/________' }}</p>
            </div>
            <div>
              <img v-if="laudo.assinaturaSupervisor" :src="laudo.assinaturaSupervisor" class="h-14 object-contain border-b border-slate-400" alt="Assinatura da Supervisão/Gestão da Área" />
              <div v-else class="border-b border-slate-400 h-10"></div>
              <p class="mt-1 font-semibold text-slate-700">Supervisão/Gestão da Área</p>
              <p class="mt-3">Nome: {{ laudo.assinaturaSupervisorNome || '______________________________' }}</p>
              <p class="mt-2">Data: {{ laudo.assinaturaSupervisor ? formatarDataHora(laudo.dataHora) : '____/____/________' }}</p>
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

    // 'setores' -> 'lista' -> 'detalhe' | 'historico' | 'calendario' (abas irmãs de 'setores')
    const view = ref("setores");
    const areaSelecionada = ref(null);
    const equipamentoSelecionado = ref(null);
    // lista plana (todos os blocos): [{ texto, status, periodicidade, observacao, fotoBase64, fotoNome }]
    // observacao = desvio apontado (NC) ou justificativa (NA); fotoBase64 = evidência do item (NC).
    const itensChecklist = ref([]);
    const blocosChecklist = ref([]); // [{ periodicidade, itens: [...] }] — para exibir agrupado
    const observacoesGerais = ref("");
    const salvando = ref(false);
    const inputCameraRef = ref(null);
    const inputGaleriaRef = ref(null);
    const itemFotoAlvo = ref(null); // item-alvo do próximo arquivo selecionado nos inputs acima (compartilhados entre itens)

    // Nome do Executor/Inspetor do checklist — sugerido automaticamente
    // (usuário logado, ou "IRONTECH" para ativos do setor de TI, ver
    // abrirEquipamento), mas sempre editável antes de salvar.
    const nomeExecutor = ref("");

    // Assinatura Digital em Tela — capturada ao concluir a inspeção,
    // estampada no rodapé de Validação do laudo RSG-6301-01.
    const assinaturaInspetor = ref(null);
    const assinaturaSupervisor = ref(null);
    const assinaturaSupervisorNome = ref("");
    function onAssinaturaInspetor(dataUrl) { assinaturaInspetor.value = dataUrl; }
    function onAssinaturaSupervisor(dataUrl) { assinaturaSupervisor.value = dataUrl; }

    // Ficha de Inspeção Técnica / Laudo Operacional (RSG-6301-01)
    const laudoAberto = ref(false);
    const laudoAtual = ref(null);
    const laudoModoPosSalvar = ref(false);

    // Alerta automático via WhatsApp ao registrar um item Não Conforme.
    const alertaWhatsAppAberto = ref(false);
    const alertaWhatsAppDados = ref(null);
    function fecharAlertaWhatsApp() {
      alertaWhatsAppAberto.value = false;
    }

    // Filtros do Histórico de Inspeções
    const filtroAno = ref("todos");
    const filtroMes = ref("todos");
    const filtroArea = ref("todas");
    const filtroBusca = ref("");
    const filtroStatus = ref("todos"); // 'todos' | 'C' | 'NC'
    const filtroPeriodicidade = ref("todas");
    const paginaHistorico = ref(1);

    // Calendário Mestre de Preventivas
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
          // Mês-âncora do ciclo (1-12). Sem coluna cadastrada, assume Janeiro
          // para todos — cadastre "Mes_Referencia" na planilha para escalonar
          // o calendário de cada equipamento (ex: 9 = Setembro).
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

    function equipamentosDaArea(area) {
      const alvo = String(area || "").trim().toLowerCase();
      return todosEquipamentos.value.filter(e => e.area.trim().toLowerCase() === alvo);
    }

    // Lista do setor: um card por ATIVO físico (linhas de mesmo ID/Nome já
    // unificadas), não mais um card por linha/periodicidade cadastrada.
    function ativosDaArea(area) {
      const alvo = String(area || "").trim().toLowerCase();
      return ativosAgrupados.value.filter(a => a.area.trim().toLowerCase() === alvo);
    }
    const equipamentosDaAreaAtual = computed(() => ativosDaArea(areaSelecionada.value));

    // Abas de periodicidade geradas dinamicamente a partir de TODOS os perfis
    // (linhas) dos ativos da área — um ativo com Mensal+Semestral aparece nas
    // duas abas.
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

    // O log de preventivas não traz sempre o ID do equipamento de forma
    // isolada, então o casamento é feito de forma flexível (ver
    // equipamentoLogCorrespondeAoAtivo): nome exato, nome sem um eventual
    // prefixo "[ID] " no log, ou o log trazendo o ID do ativo — cobre o caso
    // de ativos como os de TI, cujos logs podem chegar como
    // "[EQ-TI-01] Servidor Central" em vez do nome puro cadastrado.
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

    // Existe log de preventiva deste equipamento dentro do mês/ano informado?
    // Base do cálculo de status das células do Calendário Mestre.
    function logNoMes(ativo, ano, mes) {
      return preventivasHistorico.value.some(p => {
        if (!equipamentoLogCorrespondeAoAtivo(p.equipamento, ativo)) return false;
        if (!areasCorrespondem(p.area, ativo && ativo.area)) return false;
        const d = new Date(p.data);
        if (isNaN(d.getTime())) return false;
        return d.getFullYear() === ano && d.getMonth() + 1 === mes;
      });
    }

    // Unificação de múltiplas periodicidades por ativo físico: linhas da
    // planilha Equipamentos que compartilham o mesmo ID (ou Nome+Área, na
    // ausência de ID) são agrupadas em um único "ativo" com vários "perfis"
    // (um por periodicidade cadastrada para aquele equipamento).
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

    // Localiza o ativo (já agrupado) de um registro do Histórico para
    // reconstituir a Matriz de Inspeção do laudo. Prioridade: 1) ID do
    // equipamento, quando o log traz um; 2) nome + área, com comparação
    // robusta a maiúsculas/acentuação (normalizarTexto) — cobre variações
    // de digitação entre o cadastro e o log salvo.
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

    // Reconstitui a Matriz de Verificação de um registro que não guardou o
    // detalhamento por item (todo registro salvo antes desta versão, ou
    // qualquer log retroativo): busca os itens recomendados cadastrados no
    // ativo (todos os perfis/periodicidades) e aplica o resultado geral do
    // log a cada item. Quando o log é Não Conforme, tenta identificar nas
    // observações quais itens específicos foram apontados — o restante é
    // preenchido como Conforme.
    function montarItensLaudoHistorico(ativo, statusGeral, observacoes) {
      const vistos = new Set();
      const itens = [];
      (ativo && ativo.perfis || []).forEach(perfil => {
        const textosPerfil = (ativo && itensInspecaoTI(ativo.nome)) || parseItensInspecao(perfil.itensInspecao);
        textosPerfil.forEach(texto => {
          const chave = texto.trim().toLowerCase();
          if (vistos.has(chave)) return;
          vistos.add(chave);
          // Registros retroativos não guardam foto por item — a célula de
          // Evidência Fotográfica fica vazia ("-") para todo item reconstituído.
          itens.push({
            texto, periodicidade: perfil.periodicidade, status: "C",
            observacao: "Conforme padrão operacional", fotoBase64: null,
          });
        });
      });
      // Fallback de emergência: sem ativo cadastrado ou sem itens recomendados
      // no cadastro, a Matriz de Inspeção nunca pode ficar vazia/oculta.
      if (itens.length === 0) {
        const periodicidadeFallback = ativo && ativo.perfis && ativo.perfis[0] ? ativo.perfis[0].periodicidade : "";
        itens.push({
          texto: "Inspeção Operacional e Integridade Estrutural",
          periodicidade: periodicidadeFallback, status: "C",
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
        // Anotações não citam nenhum item específico: sem como isolar qual
        // item falhou, o resultado geral (Não Conforme) é aplicado a todos.
        if (!algumApontado) {
          itens.forEach(item => {
            item.status = "NC";
            item.observacao = observacoes || "Não conformidade registrada no log — detalhamento por item não disponível.";
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

    // Selo do card do ativo: considera TODOS os perfis (periodicidades)
    // cadastrados para aquele ID/Nome, usando o mesmo motor de agendamento
    // mensal do Calendário Mestre (mês-âncora + "existe log naquele mês?").
    // Um único log do equipamento dá baixa em qualquer perfil programado
    // para o mês em que ele foi lançado.
    function statusCicloEquipamento(ativo) {
      const info = ultimaInspecao(ativo);
      if (info && info.status === "NC") {
        return { label: "⚠ Não Conforme", badge: "bg-red-100 text-red-700 border border-red-200", tipo: "nc" };
      }

      const agora = new Date();
      const anoAtual = agora.getFullYear();
      const mesAtual = agora.getMonth() + 1;
      const perfis = ativo.perfis || [ativo];

      // Atrasado = a 3ª quinta-feira do mês programado já passou sem log.
      // Meses futuros e o mês vigente antes da 3ª quinta não contam como
      // pendência (mesmo modelo de 3 estados do Calendário Mestre).
      let atrasado = false;
      perfis.forEach(perfil => {
        mesesProgramadosEquipamento(perfil).forEach(mes => {
          if (mes > mesAtual) return;
          if (logNoMes(ativo, anoAtual, mes)) return;
          if (dataPlanejadaMes(anoAtual, mes).getTime() < Date.now()) atrasado = true;
        });
      });

      if (atrasado) return { label: "✗ Atrasado", badge: "bg-red-100 text-red-700 border border-red-200", tipo: "vencido" };
      return { label: "✓ Em dia", badge: "bg-emerald-100 text-emerald-700 border border-emerald-200", tipo: "em_dia" };
    }

    // Próxima data planejada (3ª quinta-feira) do mês vigente, se houver
    // algum perfil do ativo programado para este mês — usada nos cards e no
    // tooltip das células do Calendário.
    function dataLimiteMesAtual(ativo) {
      const agora = new Date();
      const mesAtual = agora.getMonth() + 1;
      const perfis = ativo.perfis || [ativo];
      const programado = perfis.some(p => mesesProgramadosEquipamento(p).includes(mesAtual));
      return programado ? dataPlanejadaMes(agora.getFullYear(), mesAtual) : null;
    }

    // Cards do nível "Setores": total de ATIVOS (já unificados) e pendências
    // por área (vencidos ou não conformes contam como pendência que exige ação).
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

    // Progresso do setor selecionado: quantos equipamentos NÃO estão pendentes
    // (vencidos ou NC) vs. o total da área.
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

    // Título do bloco no checklist consolidado: "Rotina Mensal" para o ciclo
    // curto, "Revisão {Periodicidade}" para os ciclos mais espaçados.
    function tituloBloco(periodicidade) {
      if (String(periodicidade || "").trim().toLowerCase() === "mensal") return "Rotina Mensal";
      return periodicidade ? "Revisão " + periodicidade : "Rotina Geral";
    }

    function abrirArea(area) {
      areaSelecionada.value = area;
      view.value = "lista";
    }

    function voltarSetores() {
      areaSelecionada.value = null;
      view.value = "setores";
    }

    function abrirHistorico() {
      view.value = "historico";
    }

    function abrirCalendario() {
      view.value = "calendario";
    }

    // ===== Calendário Mestre de Preventivas =====
    const ativosCalendario = computed(() => {
      if (calendarioArea.value === "todas") return ativosAgrupados.value;
      const alvo = calendarioArea.value.trim().toLowerCase();
      return ativosAgrupados.value.filter(a => a.area.trim().toLowerCase() === alvo);
    });

    // Data planejada oficial do ciclo daquele mês: 3ª quinta-feira (ver
    // getThirdThursday). "mes" aqui é 1-12 (Date.getMonth() é 0-11).
    function dataPlanejadaMes(ano, mes) {
      return getThirdThursday(ano, mes - 1);
    }

    // Status de uma célula (ativo x mês): 'concluido' (log no mês), 'atrasado'
    // (a 3ª quinta-feira do mês já passou sem log) ou 'programado' (a data
    // planejada ainda não chegou — inclui o mês vigente antes da 3ª quinta).
    function statusCelula(ativo, mes, ano) {
      if (logNoMes(ativo, ano, mes)) return "concluido";
      return dataPlanejadaMes(ano, mes).getTime() < Date.now() ? "atrasado" : "programado";
    }

    const CORES_CELULA = {
      concluido: "bg-emerald-500 text-white",
      atrasado: "bg-red-500 text-white",
      programado: "bg-sky-100 text-sky-700",
    };

    // Perfis do ativo programados para aquele mês (pode ter mais de um, ex:
    // Mensal + Semestral coincidindo) — usado para renderizar as tags da célula.
    function perfisNaCelula(ativo, mes) {
      return ativo.perfis.filter(p => mesesProgramadosEquipamento(p).includes(mes));
    }

    function linhasCalendarioParaExportar() {
      return ativosCalendario.value.map(ativo => {
        const linha = {
          "ID": ativo.idDisplay || "",
          "Equipamento": ativo.nome,
          "Setor": ativo.area,
        };
        meses.forEach(m => {
          const perfis = perfisNaCelula(ativo, m.v);
          if (perfis.length === 0) {
            linha[m.l] = "";
            return;
          }
          const st = statusCelula(ativo, m.v, calendarioAno.value);
          const statusTxt = { concluido: "OK", atrasado: "ATRASADO", programado: "PROGRAMADO" }[st];
          const dataPlanejada = formatarDataCurta(dataPlanejadaMes(calendarioAno.value, m.v));
          linha[m.l] = perfis.map(p => tagPeriodicidade(p.periodicidade)).join("/") + " (" + statusTxt + " - " + dataPlanejada + ")";
        });
        return linha;
      });
    }

    function exportarCalendarioExcel() {
      if (typeof XLSX === "undefined") {
        pushToast("Biblioteca de exportação (Excel) não carregou. Verifique sua conexão.", "error");
        return;
      }
      if (ativosCalendario.value.length === 0) {
        pushToast("Não há equipamentos para exportar com os filtros atuais.", "error");
        return;
      }
      const ws = XLSX.utils.json_to_sheet(linhasCalendarioParaExportar());
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Calendário " + calendarioAno.value);
      XLSX.writeFile(wb, `calendario-preventivas-${calendarioAno.value}-${Date.now()}.xlsx`);
    }

    function exportarCalendarioPDF() {
      if (typeof window.jspdf === "undefined") {
        pushToast("Biblioteca de exportação (PDF) não carregou. Verifique sua conexão.", "error");
        return;
      }
      if (ativosCalendario.value.length === 0) {
        pushToast("Não há equipamentos para exportar com os filtros atuais.", "error");
        return;
      }
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
      doc.save(`calendario-preventivas-${calendarioAno.value}-${Date.now()}.pdf`);
    }

    // Abre o checklist do ativo (agrupando todas as periodicidades cadastradas
    // para o mesmo ID/Nome) e monta um bloco por perfil que esteja programado
    // para o mês vigente — se Mensal e Semestral coincidirem no mês, as duas
    // aparecem juntas, em blocos separados, na mesma tela.
    function abrirEquipamento(eq) {
      const ativo = ativoDoEquipamento(eq);
      equipamentoSelecionado.value = ativo;

      const mesAtual = new Date().getMonth() + 1;
      const blocos = [];
      ativo.perfis.forEach(perfil => {
        if (!mesesProgramadosEquipamento(perfil).includes(mesAtual)) return;
        // Ativos de TI têm sua Matriz de Verificação padronizada pela
        // IRONTECH (ver ITENS_INSPECAO_TI) — prevalece sobre o texto livre
        // cadastrado na planilha, quando existir, para este equipamento.
        const textosItens = itensInspecaoTI(ativo.nome) || parseItensInspecao(perfil.itensInspecao);
        const itens = textosItens.map(texto => ({
          texto, status: null, periodicidade: perfil.periodicidade,
          observacao: "", fotoBase64: null, fotoNome: "",
        }));
        if (itens.length) blocos.push({ periodicidade: perfil.periodicidade || "Geral", itens });
      });
      blocosChecklist.value = blocos;
      itensChecklist.value = blocos.flatMap(b => b.itens);

      // Sugestão automática do executor: prestador externo IRONTECH para
      // ativos do setor de TI, senão o próprio usuário logado.
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

    function laudoNovaInspecao() {
      fecharLaudo();
      voltarLista();
    }

    function laudoIrInicio() {
      fecharLaudo();
      emit("go-home");
    }

    // Abre o laudo de um registro do Histórico. O log salvo não guarda o
    // detalhamento por item nem a foto — a Matriz de Verificação é
    // reconstituída a partir dos itens cadastrados no ativo (ver
    // montarItensLaudoHistorico).
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

    // Inputs de arquivo (câmera/galeria) são compartilhados entre todos os
    // itens do checklist — abrirCameraItem/abrirGaleriaItem definem qual item
    // recebe o arquivo antes de disparar o seletor nativo.
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

    async function salvarInspecao() {
      const pendentes = itensChecklist.value.filter(i => !i.status);
      if (itensChecklist.value.length === 0) {
        pushToast("Este equipamento não possui itens de inspeção cadastrados.", "error");
        return;
      }
      if (pendentes.length > 0) {
        pushToast(`Classifique todos os itens antes de salvar (${pendentes.length} pendente(s)).`, "error");
        return;
      }
      const ncSemDescricao = itensChecklist.value.some(i => i.status === "NC" && !i.observacao.trim());
      if (ncSemDescricao) {
        pushToast("Descreva o desvio apontado em cada item Não Conforme.", "error");
        return;
      }
      const ncSemFoto = itensChecklist.value.some(i => i.status === "NC" && !i.fotoBase64);
      if (ncSemFoto) {
        pushToast("Anexe uma foto como evidência em cada item Não Conforme.", "error");
        return;
      }
      const naSemJustificativa = itensChecklist.value.some(i => i.status === "NA" && !i.observacao.trim());
      if (naSemJustificativa) {
        pushToast("Informe a justificativa em cada item Não Aplicável.", "error");
        return;
      }
      if (!nomeExecutor.value.trim()) {
        pushToast("Informe o nome do Executor/Inspetor.", "error");
        return;
      }
      if (!assinaturaInspetor.value) {
        pushToast("Colete a assinatura do Inspetor/Técnico Responsável.", "error");
        return;
      }
      if (!assinaturaSupervisor.value) {
        pushToast("Colete a assinatura do Supervisor da Área/Operador.", "error");
        return;
      }
      if (!assinaturaSupervisorNome.value.trim()) {
        pushToast("Informe o nome do Supervisor da Área/Operador.", "error");
        return;
      }
      salvando.value = true;
      try {
        const idLog = "LOG-" + Date.now();
        const dataHora = new Date().toISOString().replace("T", " ").substring(0, 16);
        const statusInspecao = temNC.value ? "Não Conforme" : "Conforme";

        // Cada item NC/NA entra no texto de observações do log (formato
        // "[STATUS] item: nota"), preservando o desvio/justificativa mesmo
        // na planilha, que só guarda um campo de texto por registro.
        const partesObs = [];
        itensChecklist.value.forEach(item => {
          if (item.status === "NC" || item.status === "NA") {
            partesObs.push(`[${item.status}] ${item.texto}: ${item.observacao.trim()}`);
          }
        });
        if (observacoesGerais.value.trim()) partesObs.push(observacoesGerais.value.trim());
        const observacoesFinal = partesObs.join(" | ");

        const equipamentoNome = equipamentoSelecionado.value.nome;
        const areaAtual = areaSelecionada.value;
        const usuarioNome = nomeExecutor.value.trim() || props.user.nome;

        const resp = await savePreventivaApi({
          idLog, dataHora,
          area: areaAtual,
          equipamento: equipamentoNome,
          usuario: usuarioNome,
          statusInspecao,
          observacoes: observacoesFinal,
        });
        if (resp && resp.status === "error") throw new Error(resp.message || "Erro ao salvar.");

        // Evidências fotográficas (pesadas): enviadas à parte, uma por item
        // Não Conforme, via POST best-effort — não cabem em query params de
        // uma requisição GET.
        itensChecklist.value.forEach(item => {
          if (item.status === "NC" && item.fotoBase64) {
            postToAppsScript({
              action: "attachPreventivaEvidencia",
              idLog,
              itemTexto: item.texto,
              fotoBase64: item.fotoBase64,
              fotoNome: item.fotoNome,
            }).catch(err => console.error("Erro ao enviar evidência fotográfica:", err));
          }
        });

        // Assinaturas digitais (pesadas): mesmo tratamento best-effort das
        // fotos — o laudo em tela/PDF já usa a versão em memória.
        postToAppsScript({
          action: "attachPreventivaAssinaturas",
          idLog,
          assinaturaInspetorBase64: assinaturaInspetor.value,
          assinaturaSupervisorBase64: assinaturaSupervisor.value,
          assinaturaSupervisorNome: assinaturaSupervisorNome.value.trim(),
        }).catch(err => console.error("Erro ao enviar assinaturas digitais:", err));

        // Estado otimista: adiciona o novo registro em memória para que o card
        // do equipamento já reflita "Realizado Hoje" ao voltar para a lista.
        preventivasHistorico.value.unshift({
          id: idLog,
          data: dataHora,
          area: areaAtual,
          equipamento: equipamentoNome,
          usuario: usuarioNome,
          status: temNC.value ? "NC" : "C",
          observacoes: observacoesFinal,
        });

        pushToast("Inspeção registrada com sucesso!", "success");

        // Abre a Ficha de Inspeção Técnica (laudo) com os dados completos desta
        // execução — inclusive o detalhamento por item (observação e foto), que
        // só existe em memória (o log salvo na planilha guarda apenas o texto
        // agregado de observações).
        laudoAtual.value = {
          idLog, dataHora,
          area: areaAtual,
          equipamentoIdDisplay: equipamentoSelecionado.value.idDisplay,
          equipamentoNome,
          modelo: equipamentoSelecionado.value.modelo,
          periodicidade: blocosChecklist.value.map(b => b.periodicidade).filter(Boolean).join(" + "),
          inspetor: usuarioNome,
          statusGeral: statusInspecao,
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
            tipo: "nc",
            id: idLog,
            equipamento: equipamentoNome,
            area: areaAtual,
            descricao: partesObs.join(" | ") || "Item(ns) não conforme(s) apontado(s) no checklist.",
            inspetor: usuarioNome,
          };
          alertaWhatsAppAberto.value = true;
        }

        // NÃO recarrega a API imediatamente — a planilha pode levar um instante
        // para consolidar a escrita. Sincroniza em segundo plano só depois de 3s.
        setTimeout(() => carregarDados({ silencioso: true }), 3000);
      } catch (err) {
        console.error(err);
        pushToast("Erro ao salvar inspeção. Tente novamente.", "error");
      } finally {
        salvando.value = false;
      }
    }

    // ===== Histórico de Inspeções (filtros combinados) =====
    const anosDisponiveis = computed(() => {
      const anos = new Set();
      preventivasHistorico.value.forEach(p => {
        const d = new Date(p.data);
        if (!isNaN(d.getTime())) anos.add(d.getFullYear());
      });
      return Array.from(anos).sort((a, b) => b - a);
    });

    // O log de inspeção não guarda a periodicidade do equipamento; buscamos
    // no cadastro atual por nome + área (mesmo casamento usado em ultimaInspecao).
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

    function carregarMaisHistorico() {
      paginaHistorico.value += 1;
    }

    // ===== Gestão Administrativa (Perfil Administrador): editar/excluir log =====
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
        pushToast("Erro ao excluir o registro. Tente novamente.", "error");
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
        pushToast("Erro ao atualizar o registro. Tente novamente.", "error");
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
      if (typeof XLSX === "undefined") {
        pushToast("Biblioteca de exportação (Excel) não carregou. Verifique sua conexão.", "error");
        return;
      }
      if (historicoFiltrado.value.length === 0) {
        pushToast("Não há registros para exportar com os filtros atuais.", "error");
        return;
      }
      const ws = XLSX.utils.json_to_sheet(linhasParaExportar());
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Histórico");
      XLSX.writeFile(wb, `historico-preventivas-${Date.now()}.xlsx`);
    }

    function exportarPDF() {
      if (typeof window.jspdf === "undefined") {
        pushToast("Biblioteca de exportação (PDF) não carregou. Verifique sua conexão.", "error");
        return;
      }
      if (historicoFiltrado.value.length === 0) {
        pushToast("Não há registros para exportar com os filtros atuais.", "error");
        return;
      }
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
    <!-- Breadcrumb -->
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

    <!-- Abas de topo: Áreas | Histórico de Inspeções | Calendário -->
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

    <!-- NÍVEL 0: grid de setores -->
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

    <!-- NÍVEL 1: lista de equipamentos da área -->
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

        <div v-if="equipamentosFiltradosLista.length === 0" class="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-400">
          Nenhum equipamento com essa periodicidade nesta área.
        </div>

        <div v-else class="space-y-3">
          <button v-for="eq in equipamentosFiltradosLista" :key="eq.chave" @click="abrirEquipamento(eq)"
            class="w-full text-left btn-tap bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-sky-300 hover:shadow-md transition-all flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="font-semibold text-slate-800 truncate">
                <span v-if="eq.idDisplay" class="text-slate-400 font-mono text-sm mr-1">[{{ eq.idDisplay }}]</span>{{ eq.nome }}<span v-if="eq.modelo" class="text-slate-400 font-normal"> — {{ eq.modelo }}</span>
              </p>
              <p v-if="eq.perfis && eq.perfis.length" class="flex flex-wrap gap-1 mt-1">
                <span v-for="perfil in eq.perfis" :key="perfil.id" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 uppercase tracking-wide">{{ perfil.periodicidade || 'Sem periodicidade' }}</span>
              </p>
              <p v-if="dataLimiteMesAtual(eq)" class="text-xs text-sky-600 font-semibold mt-1">
                📅 Vence em: {{ formatarDataCurta(dataLimiteMesAtual(eq)) }}
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

    <!-- ABA: Calendário Mestre de Preventivas -->
    <template v-else-if="view === 'calendario'">
      <div class="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <select v-model="calendarioArea" class="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
          <option value="todas">Setor: Todos</option>
          <option v-for="a in areas" :key="a" :value="a">{{ a }}</option>
        </select>

        <div class="flex items-center justify-center gap-4">
          <button @click="calendarioAnoAnterior" class="btn-tap w-9 h-9 rounded-full border border-slate-300 text-slate-600 font-bold flex items-center justify-center">‹</button>
          <span class="font-extrabold text-xl text-slate-800 w-20 text-center tabular-nums">{{ calendarioAno }}</span>
          <button @click="calendarioAnoProximo" class="btn-tap w-9 h-9 rounded-full border border-slate-300 text-slate-600 font-bold flex items-center justify-center">›</button>
        </div>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-emerald-500 inline-block"></span> Concluído</span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-red-500 inline-block"></span> Pendente/Atrasado</span>
          <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-sky-100 border border-sky-300 inline-block"></span> Programado</span>
        </div>

        <div class="flex gap-2">
          <button @click="exportarCalendarioExcel" class="btn-tap text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700">
            📊 Exportar Excel
          </button>
          <button @click="exportarCalendarioPDF" class="btn-tap text-xs font-semibold px-3 py-1.5 rounded-full border border-red-300 bg-red-50 text-red-700">
            📄 Exportar PDF
          </button>
        </div>
      </div>

      <div v-if="ativosCalendario.length === 0" class="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-400">
        Nenhum equipamento encontrado para este filtro.
      </div>

      <div v-else class="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table class="text-xs border-collapse w-full">
          <thead>
            <tr class="bg-slate-800 text-white">
              <th class="sticky left-0 bg-slate-800 text-left font-bold px-3 py-2 whitespace-nowrap z-10">Equipamento</th>
              <th v-for="m in meses" :key="m.v" class="font-bold px-1.5 py-2 text-center whitespace-nowrap">{{ m.l.slice(0, 3) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ativo in ativosCalendario" :key="ativo.chave" class="border-t border-slate-100">
              <td class="sticky left-0 bg-white text-left px-3 py-2 whitespace-nowrap font-semibold text-slate-700">
                <span v-if="ativo.idDisplay" class="text-slate-400 font-mono mr-1">[{{ ativo.idDisplay }}]</span>{{ ativo.nome }}
              </td>
              <td v-for="m in meses" :key="m.v" class="px-1 py-2 text-center align-middle">
                <div v-if="perfisNaCelula(ativo, m.v).length" class="flex flex-wrap items-center justify-center gap-0.5">
                  <button v-for="(perfil, pIdx) in perfisNaCelula(ativo, m.v)" :key="pIdx" @click="abrirEquipamento(perfil)"
                    class="btn-tap w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center"
                    :class="CORES_CELULA[statusCelula(ativo, m.v, calendarioAno)]"
                    :title="perfil.periodicidade + ' — planejado para ' + formatarDataCurta(dataPlanejadaMes(calendarioAno, m.v))">
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

    <!-- NÍVEL 2: execução do checklist do equipamento -->
    <template v-else-if="view === 'detalhe' && equipamentoSelecionado">
      <button @click="voltarLista" class="btn-tap flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-sky-600">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
        </svg>
        <span>Voltar à lista de equipamentos</span>
      </button>

      <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <p class="font-bold text-slate-800">
          <span v-if="equipamentoSelecionado.idDisplay" class="text-slate-400 font-mono text-sm mr-1">[{{ equipamentoSelecionado.idDisplay }}]</span>{{ equipamentoSelecionado.nome }}
        </p>
        <p v-if="equipamentoSelecionado.modelo" class="text-sm text-slate-500 mt-0.5">Modelo: {{ equipamentoSelecionado.modelo }}</p>
        <p v-if="equipamentoSelecionado.tag" class="text-xs text-slate-400 font-mono mt-0.5">{{ equipamentoSelecionado.tag }}</p>
        <span v-if="ativoSelecionadoEhTI"
          class="inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
          🖥️ Prestador de Serviço: IRONTECH (Externo)
        </span>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Executor/Inspetor *</label>
        <input v-model="nomeExecutor" type="text" placeholder="Nome de quem está executando a inspeção"
          class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
      </div>

      <div v-if="itensChecklist.length" class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex justify-between text-xs font-semibold text-slate-500 mb-1">
          <span>Progresso do checklist</span>
          <span>{{ progresso }}%</span>
        </div>
        <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full bg-sky-500 transition-all duration-300" :style="{ width: progresso + '%' }"></div>
        </div>
      </div>

      <div v-if="blocosChecklist.length === 0" class="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center text-emerald-700 font-semibold">
        ✓ Nada programado para este equipamento no mês vigente.
      </div>

      <div v-else class="space-y-3">
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
              <textarea v-model="item.observacao" rows="2" placeholder="Descreva o que foi encontrado..."
                class="w-full rounded-lg border border-red-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"></textarea>

              <label class="block text-xs font-semibold text-red-700 uppercase tracking-wide">Evidência Fotográfica *</label>
              <div class="flex gap-2">
                <button type="button" @click="abrirCameraItem(item)"
                  class="btn-tap flex-1 flex items-center justify-center gap-1.5 bg-white border-2 border-red-300 text-red-700 font-semibold py-2.5 rounded-lg text-sm">
                  📷 Tirar Foto
                </button>
                <button type="button" @click="abrirGaleriaItem(item)"
                  class="btn-tap flex-1 flex items-center justify-center gap-1.5 bg-white border-2 border-red-300 text-red-700 font-semibold py-2.5 rounded-lg text-sm">
                  📁 Galeria
                </button>
              </div>
              <div v-if="item.fotoBase64" class="flex items-center gap-3 bg-white border border-red-200 rounded-lg p-2">
                <img :src="item.fotoBase64" class="w-16 h-16 object-cover rounded-md border border-slate-200" alt="Prévia da evidência fotográfica" />
                <p class="text-xs text-slate-600 truncate flex-1">{{ item.fotoNome }}</p>
                <button type="button" @click="removerFotoItem(item)" class="btn-tap text-red-600 hover:text-red-800 text-lg leading-none px-2">✕</button>
              </div>
            </div>

            <div v-if="item.status === 'NA'" class="mt-3 bg-slate-50 border-2 border-slate-200 rounded-lg p-3 space-y-2">
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Justificativa *</label>
              <textarea v-model="item.observacao" rows="2" placeholder="Explique por que este item não se aplica..."
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"></textarea>
            </div>
          </div>
        </template>

        <!-- Inputs de arquivo compartilhados: abrirCameraItem/abrirGaleriaItem definem o item-alvo antes do click(). -->
        <input ref="inputCameraRef" type="file" accept="image/*" capture="environment" class="hidden" @change="onFotoSelecionada" />
        <input ref="inputGaleriaRef" type="file" accept="image/*" class="hidden" @change="onFotoSelecionada" />

        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Observações gerais (opcional)</label>
          <textarea v-model="observacoesGerais" rows="2" placeholder="Observações adicionais"
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"></textarea>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">✍️ Assinatura Digital</h4>
          <assinatura-canvas label="Assinatura do Inspetor/Técnico Responsável" @update="onAssinaturaInspetor"></assinatura-canvas>
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nome do Supervisor da Área/Operador *</label>
            <input v-model="assinaturaSupervisorNome" type="text" placeholder="Nome completo"
              class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <assinatura-canvas label="Assinatura do Supervisor da Área/Operador" @update="onAssinaturaSupervisor"></assinatura-canvas>
        </div>

        <button @click="salvarInspecao" :disabled="salvando"
          class="btn-tap w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl shadow-md mt-2 sticky bottom-3">
          <span v-if="salvando" class="spinner"></span>
          <span>{{ salvando ? "Salvando..." : "Salvar Inspeção do Equipamento" }}</span>
        </button>
      </div>
    </template>

    <!-- ABA: Histórico de Inspeções -->
    <template v-else-if="view === 'historico'">
      <div class="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select v-model="filtroAno" class="rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
            <option value="todos">Ano: Todos</option>
            <option v-for="a in anosDisponiveis" :key="a" :value="a">{{ a }}</option>
          </select>
          <select v-model="filtroMes" class="rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
            <option value="todos">Mês: Todos</option>
            <option v-for="m in meses" :key="m.v" :value="m.v">{{ m.l }}</option>
          </select>
          <select v-model="filtroArea" class="rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
            <option value="todas">Setor: Todos</option>
            <option v-for="a in areas" :key="a" :value="a">{{ a }}</option>
          </select>
          <select v-model="filtroPeriodicidade" class="rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
            <option value="todas">Periodicidade: Todas</option>
            <option v-for="p in periodicidadesCanonicas" :key="p" :value="p">{{ p }}</option>
          </select>
        </div>

        <input v-model="filtroBusca" type="text" placeholder="Buscar por equipamento ou ID..."
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />

        <div class="flex gap-1.5">
          <button v-for="s in [{v:'todos', l:'Todos'}, {v:'C', l:'Conforme'}, {v:'NC', l:'Não Conforme'}]" :key="s.v"
            @click="filtroStatus = s.v"
            class="btn-tap flex-1 px-2 py-2 rounded-lg text-xs font-semibold border whitespace-nowrap"
            :class="filtroStatus === s.v ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-500'">
            {{ s.l }}
          </button>
        </div>

        <div class="flex items-center justify-between flex-wrap gap-2">
          <button @click="limparFiltrosHistorico" class="text-sky-600 text-xs font-semibold btn-tap">✕ Limpar Filtros</button>
          <div class="flex gap-2">
            <button @click="exportarExcel" class="btn-tap text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700">
              📊 Exportar Excel
            </button>
            <button @click="exportarPDF" class="btn-tap text-xs font-semibold px-3 py-1.5 rounded-full border border-red-300 bg-red-50 text-red-700">
              📄 Exportar PDF
            </button>
          </div>
        </div>
      </div>

      <p class="text-xs text-slate-400">{{ historicoFiltrado.length }} registro(s) encontrado(s)</p>

      <div v-if="historicoFiltrado.length === 0" class="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-400">
        Nenhum registro encontrado para os filtros selecionados.
      </div>

      <div v-else class="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        <div v-for="h in historicoPaginado" :key="h.id" class="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
          <div class="flex items-start justify-between gap-2 mb-1">
            <div class="min-w-0">
              <p class="font-semibold text-slate-800 truncate">{{ h.equipamento || 'Equipamento' }}</p>
              <p class="text-xs text-slate-400 truncate">{{ h.area }} · #{{ h.id }}<template v-if="periodicidadeDoEquipamento(h.equipamento, h.area)"> · {{ periodicidadeDoEquipamento(h.equipamento, h.area) }}</template></p>
            </div>
            <span class="text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0"
              :class="h.status === 'NC' ? 'bg-red-100 text-red-700' : h.status === 'NA' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'">
              {{ formatarStatusLabel(h.status) }}
            </span>
          </div>
          <p v-if="h.observacoes" class="text-sm text-slate-600 mt-1">{{ h.observacoes }}</p>
          <div class="flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 pt-2 mt-2 mb-2">
            <span>👤 {{ h.usuario || '—' }}</span>
            <span>{{ formatarData(h.data) }}</span>
          </div>
          <div class="flex gap-1.5">
            <button @click="abrirLaudoHistorico(h)"
              class="btn-tap flex-1 text-xs font-semibold text-sky-600 border border-sky-200 bg-sky-50 rounded-lg py-1.5">
              👁️ Visualizar Laudo
            </button>
            <template v-if="souAdmin">
              <button @click="abrirEdicaoLog(h)"
                class="btn-tap text-xs font-semibold text-amber-700 border border-amber-200 bg-amber-50 rounded-lg py-1.5 px-3">
                ✏️ Editar
              </button>
              <button @click="pedirExclusaoLog(h)"
                class="btn-tap text-xs font-semibold text-red-700 border border-red-200 bg-red-50 rounded-lg py-1.5 px-3">
                🗑️ Excluir
              </button>
            </template>
          </div>
        </div>

        <button v-if="historicoPaginado.length < historicoFiltrado.length" @click="carregarMaisHistorico"
          class="btn-tap w-full text-sky-600 text-sm font-semibold py-2.5">
          Mostrar mais ({{ historicoFiltrado.length - historicoPaginado.length }} restantes)
        </button>
      </div>
    </template>

    <laudo-preventiva-modal v-if="laudoAberto" :laudo="laudoAtual" :modo-pos-salvar="laudoModoPosSalvar"
      @fechar="fecharLaudo" @nova-inspecao="laudoNovaInspecao" @ir-inicio="laudoIrInicio">
    </laudo-preventiva-modal>

    <alerta-whats-app-modal v-if="alertaWhatsAppAberto" :dados="alertaWhatsAppDados" @fechar="fecharAlertaWhatsApp"></alerta-whats-app-modal>

    <!-- MODAL: confirmação de exclusão (Gestão Administrativa) -->
    <div v-if="excluirAlvo" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="cancelarExclusaoLog">
      <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4">
        <h3 class="font-bold text-slate-800">Excluir registro?</h3>
        <p class="text-sm text-slate-600">Esta ação remove definitivamente o registro <span class="font-semibold">#{{ excluirAlvo.id }}</span> ({{ excluirAlvo.equipamento }}) do Histórico. Não pode ser desfeita.</p>
        <div class="flex gap-2 pt-1">
          <button @click="cancelarExclusaoLog" :disabled="excluindo"
            class="btn-tap flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-semibold py-2.5 rounded-xl">
            Cancelar
          </button>
          <button @click="confirmarExclusaoLog" :disabled="excluindo"
            class="btn-tap flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl">
            <span v-if="excluindo" class="spinner"></span>
            <span>{{ excluindo ? "Excluindo..." : "🗑️ Excluir" }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: edição de registro (Gestão Administrativa) -->
    <div v-if="editarAlvo" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="fecharEdicaoLog">
      <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4">
        <h3 class="font-bold text-slate-800">Editar registro #{{ editarAlvo.id }}</h3>
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Status</label>
          <select v-model="editarAlvo.status" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
            <option value="C">Conforme</option>
            <option value="NC">Não Conforme</option>
            <option value="NA">Não Aplicável</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Observações</label>
          <textarea v-model="editarAlvo.observacoes" rows="3"
            class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"></textarea>
        </div>
        <div class="flex gap-2 pt-1">
          <button @click="fecharEdicaoLog" :disabled="editando"
            class="btn-tap flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-semibold py-2.5 rounded-xl">
            Cancelar
          </button>
          <button @click="salvarEdicaoLog" :disabled="editando"
            class="btn-tap flex-1 flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl">
            <span v-if="editando" class="spinner"></span>
            <span>{{ editando ? "Salvando..." : "Salvar" }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>`
};
/* ==========================================================================
   ORDEM DE SERVIÇO DE MANUTENÇÃO CORRETIVA (RSG-6302-02)
   ========================================================================== */
const RSG_CODIGO_CORRETIVA = "RSG-6302-02";
const RSG_TITULO_CORRETIVA = "RSG-6302-02 - Ordem de Serviço de Manutenção Corretiva";
// Tempo total de parada (downtime): diferença entre abertura e encerramento,
// formatado como "Xd Yh Zmin".
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

    function imagensAnexadas(laudo) {
      return (laudo.anexos || []).filter(a => a.tipo === "imagem");
    }
    function documentosAnexados(laudo) {
      return (laudo.anexos || []).filter(a => a.tipo === "documento");
    }

    const nomeArquivo = computed(() => {
      const l = props.laudo || {};
      const dataParte = String(l.dataAbertura || "").split(" ")[0] || new Date().toISOString().slice(0, 10);
      const idParte = sanitizarNomeArquivo(l.idChamado || "chamado");
      return `${RSG_CODIGO_CORRETIVA}_${idParte}_${dataParte}.pdf`;
    });

    function imprimir() {
      window.print();
    }

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
        pushToast("Erro ao gerar o PDF da ordem de serviço.", "error");
        exportandoPdf.value = false;
      }
    }

    return {
      exportandoPdf, formatarDataHora, formatarDowntime, imagensAnexadas, documentosAnexados,
      nomeArquivo, imprimir, exportarPDF, RSG_CODIGO_CORRETIVA, RSG_TITULO_CORRETIVA,
    };
  },
  template: `
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4">
    <div class="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] overflow-y-auto">
      <div class="no-print sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
        <h3 class="font-bold text-slate-800">Ordem de Serviço de Manutenção Corretiva</h3>
        <button v-if="!modoPosSalvar" @click="$emit('fechar')" class="btn-tap text-slate-400 hover:text-slate-600 text-xl leading-none px-2">✕</button>
      </div>

      <div id="laudo-imprimivel" class="p-5 space-y-4" v-if="laudo">
        <!-- Cabeçalho documental -->
        <div class="border-b-2 border-slate-800 pb-3">
          <p class="text-xs font-bold text-orange-700 uppercase tracking-wide">Hidrogeron - Sistema de Manutenção</p>
          <h2 class="text-lg font-extrabold text-slate-900 mt-0.5">{{ RSG_TITULO_CORRETIVA }}</h2>
          <div class="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-500">
            <p><span class="font-semibold text-slate-700">Protocolo/Chamado ID:</span> #{{ laudo.idChamado }}</p>
            <p><span class="font-semibold text-slate-700">Tempo Total de Parada:</span> {{ formatarDowntime(laudo.dataAbertura, laudo.dataConclusao) }}</p>
            <p><span class="font-semibold text-slate-700">Data/Hora Abertura:</span> {{ formatarDataHora(laudo.dataAbertura) }}</p>
            <p><span class="font-semibold text-slate-700">Data/Hora Encerramento:</span> {{ formatarDataHora(laudo.dataConclusao) }}</p>
          </div>
        </div>

        <!-- Dados do Ativo -->
        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Dados do Ativo</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <p><span class="text-slate-400">Setor/Área:</span> <span class="font-medium text-slate-800">{{ laudo.area || '-' }}</span></p>
            <p><span class="text-slate-400">ID Equipamento:</span> <span class="font-medium text-slate-800">{{ laudo.equipamentoIdDisplay || '-' }}</span></p>
            <p class="col-span-2"><span class="text-slate-400">Equipamento:</span> <span class="font-medium text-slate-800">{{ laudo.equipamentoNome || '-' }}</span></p>
            <p class="col-span-2"><span class="text-slate-400">Modelo:</span> <span class="font-medium text-slate-800">{{ laudo.modelo || '-' }}</span></p>
          </div>
        </div>

        <!-- Descrição da Falha -->
        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Descrição da Falha</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-1.5 text-sm">
            <p><span class="text-slate-400">Solicitante:</span> <span class="font-medium text-slate-800">{{ laudo.solicitante || '-' }}</span></p>
            <p><span class="text-slate-400">Grau de Prioridade:</span> <span class="font-medium text-slate-800">{{ laudo.prioridade || '-' }}</span></p>
            <p><span class="text-slate-400">Sintoma/Problema:</span> <span class="text-slate-700">{{ laudo.descricao || '-' }}</span></p>
          </div>
        </div>

        <!-- Intervenção Técnica -->
        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Intervenção Técnica</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-1.5 text-sm">
            <p><span class="text-slate-400">Técnico Executor:</span> <span class="font-medium text-slate-800">{{ laudo.tecnico || '-' }}</span></p>
            <p><span class="text-slate-400">Diagnóstico da Causa Raiz:</span> <span class="text-slate-700">{{ laudo.diagnostico || '-' }}</span></p>
            <p><span class="text-slate-400">Resolução/Ação Tomada:</span> <span class="text-slate-700">{{ laudo.resolucao || '-' }}</span></p>
            <p><span class="text-slate-400">Peças Substituídas:</span> <span class="text-slate-700">{{ laudo.pecas || 'Nenhuma' }}</span></p>
          </div>
        </div>

        <!-- Evidências e Documentos Anexos -->
        <div v-if="laudo.anexos && laudo.anexos.length">
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Evidências e Documentos Anexos</h4>
          <div v-if="imagensAnexadas(laudo).length" class="flex gap-3 flex-wrap mb-2">
            <div v-for="img in imagensAnexadas(laudo)" :key="img.id">
              <img :src="img.dataUrl" class="w-24 h-24 object-cover rounded-lg border border-slate-200" :alt="img.nome" />
              <p class="text-[10px] text-slate-400 mt-1 text-center w-24 truncate">{{ img.nome }}</p>
            </div>
          </div>
          <div v-if="documentosAnexados(laudo).length" class="space-y-1.5">
            <div v-for="doc in documentosAnexados(laudo)" :key="doc.id" class="flex items-center gap-2 border border-slate-200 rounded-lg p-2 bg-slate-50">
              <span class="text-lg">{{ iconeAnexo(doc.nome) }}</span>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-semibold text-slate-700 truncate">{{ doc.nome }}</p>
                <p class="text-[11px] text-slate-400">{{ doc.tamanhoKB }} KB</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Rodapé de Validação -->
        <div class="pt-4">
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Validação</h4>
          <div class="grid grid-cols-2 gap-6 text-xs text-slate-500">
            <div>
              <img v-if="laudo.assinaturaTecnico" :src="laudo.assinaturaTecnico" class="h-14 object-contain border-b border-slate-400" alt="Assinatura do Técnico Executor" />
              <div v-else class="border-b border-slate-400 h-10"></div>
              <p class="mt-1 font-semibold text-slate-700">Técnico Executor</p>
              <p class="mt-3">Nome: {{ laudo.tecnico || '______________________________' }}</p>
              <p class="mt-2">Data: {{ laudo.assinaturaTecnico ? formatarDataHora(laudo.dataConclusao) : '____/____/________' }}</p>
            </div>
            <div>
              <img v-if="laudo.assinaturaSupervisor" :src="laudo.assinaturaSupervisor" class="h-14 object-contain border-b border-slate-400" alt="Assinatura da Supervisão da Área" />
              <div v-else class="border-b border-slate-400 h-10"></div>
              <p class="mt-1 font-semibold text-slate-700">Supervisão da Área</p>
              <p class="mt-3">Nome: {{ laudo.assinaturaSupervisorNome || '______________________________' }}</p>
              <p class="mt-2">Data: {{ laudo.assinaturaSupervisor ? formatarDataHora(laudo.dataConclusao) : '____/____/________' }}</p>
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
        <button @click="$emit('fechar')" class="btn-tap col-span-2 flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 rounded-lg text-sm">
          Fechar
        </button>
      </div>
    </div>
  </div>`
};
/* ==========================================================================
   ORDEM DE SERVIÇO DE ABERTURA — RSG-6302-01 (emitida na hora, para o
   técnico levar ao chão de fábrica; os campos de diagnóstico/peças/
   assinaturas ficam em branco para preenchimento manual — o registro
   digital deles acontece depois, no encerramento, no laudo RSG-6302-02).
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

    const nomeArquivo = computed(() => {
      const c = props.chamado || {};
      const dataParte = String(c.data || "").split(" ")[0] || formatarDataISO(new Date());
      const idParte = sanitizarNomeArquivo(c.id || "chamado");
      return `${RSG_CODIGO_OS_CORRETIVA}_${idParte}_${dataParte}.pdf`;
    });

    function imprimir() {
      window.print();
    }

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
        pushToast("Erro ao gerar o PDF da ordem de serviço.", "error");
        exportandoPdf.value = false;
      }
    }

    return {
      exportandoPdf, formatarDataHora, nomeArquivo, imprimir, exportarPDF,
      RSG_CODIGO_OS_CORRETIVA, RSG_TITULO_OS_CORRETIVA,
    };
  },
  template: `
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4">
    <div class="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] overflow-y-auto">
      <div class="no-print sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
        <h3 class="font-bold text-slate-800">Ordem de Serviço (Abertura)</h3>
        <button @click="$emit('fechar')" class="btn-tap text-slate-400 hover:text-slate-600 text-xl leading-none px-2">✕</button>
      </div>

      <div id="laudo-imprimivel" class="p-5 space-y-4" v-if="chamado">
        <!-- Cabeçalho documental -->
        <div class="border-b-2 border-slate-800 pb-3">
          <p class="text-xs font-bold text-orange-700 uppercase tracking-wide">Hidrogeron - Sistema de Manutenção</p>
          <h2 class="text-lg font-extrabold text-slate-900 mt-0.5">{{ RSG_TITULO_OS_CORRETIVA }}</h2>
          <div class="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-500">
            <p><span class="font-semibold text-slate-700">Número da OS:</span> #{{ chamado.id }}</p>
            <p><span class="font-semibold text-slate-700">Prioridade:</span> {{ chamado.prioridade || '-' }}</p>
            <p><span class="font-semibold text-slate-700">Data/Hora Abertura:</span> {{ formatarDataHora(chamado.data) }}</p>
            <p><span class="font-semibold text-slate-700">Solicitante:</span> {{ chamado.solicitante || '-' }}</p>
          </div>
        </div>

        <!-- Dados do Ativo -->
        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Ativo / Equipamento</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <p class="col-span-2"><span class="text-slate-400">Máquina/Equipamento:</span> <span class="font-medium text-slate-800">{{ chamado.equipamento || '-' }}</span></p>
            <p><span class="text-slate-400">Setor/Área Fabril:</span> <span class="font-medium text-slate-800">{{ chamado.area || '-' }}</span></p>
            <p><span class="text-slate-400">Status Inicial:</span> <span class="font-medium text-slate-800">{{ chamado.status || 'Aberto' }}</span></p>
          </div>
        </div>

        <!-- Descrição do Defeito -->
        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Descrição do Defeito / Sintoma</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 text-sm">
            <p class="text-slate-700">{{ chamado.descricao || '-' }}</p>
          </div>
        </div>

        <!-- Campos em branco para o técnico no chão de fábrica -->
        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Preenchimento do Técnico</h4>

          <p class="text-xs font-semibold text-slate-600 mt-2 mb-1">Diagnóstico Técnico / Causa Encontrada:</p>
          <div class="border-b border-slate-400 h-7"></div>
          <div class="border-b border-slate-400 h-7"></div>
          <div class="border-b border-slate-400 h-7"></div>

          <p class="text-xs font-semibold text-slate-600 mt-4 mb-1">Peças / Componentes Substituídos:</p>
          <table class="w-full text-xs border border-slate-300 border-collapse">
            <thead>
              <tr class="bg-slate-100">
                <th class="border border-slate-300 px-2 py-1.5 text-left w-1/4">Código</th>
                <th class="border border-slate-300 px-2 py-1.5 text-left">Descrição</th>
                <th class="border border-slate-300 px-2 py-1.5 text-left w-1/6">Qtd.</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="n in 4" :key="n">
                <td class="border border-slate-300 px-2 h-7">&nbsp;</td>
                <td class="border border-slate-300 px-2 h-7">&nbsp;</td>
                <td class="border border-slate-300 px-2 h-7">&nbsp;</td>
              </tr>
            </tbody>
          </table>

          <div class="grid grid-cols-2 gap-4 mt-4 text-xs text-slate-600">
            <div>
              <p class="font-semibold mb-1">Data/Horário de Início:</p>
              <div class="border-b border-slate-400 h-7"></div>
            </div>
            <div>
              <p class="font-semibold mb-1">Data/Horário de Término:</p>
              <div class="border-b border-slate-400 h-7"></div>
            </div>
          </div>
        </div>

        <!-- Assinaturas -->
        <div class="pt-4">
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Validação</h4>
          <div class="grid grid-cols-2 gap-6 text-xs text-slate-500">
            <div>
              <div class="border-b border-slate-400 h-10"></div>
              <p class="mt-1 font-semibold text-slate-700">Assinatura do Técnico Responsável</p>
            </div>
            <div>
              <div class="border-b border-slate-400 h-10"></div>
              <p class="mt-1 font-semibold text-slate-700">Assinatura do Solicitante / Líder de Produção</p>
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
        <button @click="$emit('fechar')" class="btn-tap col-span-2 flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 rounded-lg text-sm">
          Fechar
        </button>
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
      area: AREAS[0],
      equipamento: "",
      prioridade: "Média",
      descricao: "",
    });
    const enviando = ref(false);
    const alertaWhatsAppAberto = ref(false);
    const alertaWhatsAppDados = ref(null);
    function fecharAlertaWhatsApp() {
      alertaWhatsAppAberto.value = false;
    }

    // Modal de confirmação exibido logo após a abertura do chamado, com
    // atalho para a Ordem de Serviço em branco (RSG-6302-01) — o alerta de
    // WhatsApp acima só é disparado depois que este for dispensado.
    const confirmacaoAberturaAberta = ref(false);
    const confirmacaoAberturaChamado = ref(null);
    const osImpressaoAberta = ref(false);
    const osImpressaoChamado = ref(null);
    function abrirOSImpressao(chamado) {
      osImpressaoChamado.value = chamado;
      osImpressaoAberta.value = true;
    }
    function fecharOSImpressao() {
      osImpressaoAberta.value = false;
      osImpressaoChamado.value = null;
    }
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
    const aba = ref("abertos"); // 'abertos' | 'encerrados' | 'calendario'

    // ===== Filtros da listagem (busca, área, status, prioridade) =====
    const filtroBuscaCorretiva = ref("");
    const filtroAreaCorretiva = ref("todas");
    const filtroStatusCorretiva = ref("todos"); // 'todos' | 'aberto' | 'fechado'
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

    // ===== Calendário de Corretivas =====
    const ANO_ATUAL_CORRETIVA = new Date().getFullYear();
    const calendarioCorretivaArea = ref("todas");
    const calendarioCorretivaAno = ref(ANO_ATUAL_CORRETIVA);
    const mesCalendarioSelecionado = ref(null); // 1-12, drill-down para o mês
    const diaCalendarioSelecionado = ref(null); // 1-31, drill-down para o dia
    function calendarioCorretivaAnoAnterior() { calendarioCorretivaAno.value -= 1; mesCalendarioSelecionado.value = null; diaCalendarioSelecionado.value = null; }
    function calendarioCorretivaAnoProximo() { calendarioCorretivaAno.value += 1; mesCalendarioSelecionado.value = null; diaCalendarioSelecionado.value = null; }
    function selecionarMesCalendario(mes) { mesCalendarioSelecionado.value = mes; diaCalendarioSelecionado.value = null; }
    function selecionarDiaCalendario(dia) { diaCalendarioSelecionado.value = dia; }
    function voltarMatrizAnual() { mesCalendarioSelecionado.value = null; diaCalendarioSelecionado.value = null; }

    // Cadastro de Equipamentos (só para consulta de ID/Modelo no laudo RSG-6302-02).
    const todosEquipamentosCorretiva = ref([]);
    const areas = computed(() => unirAreas(todosEquipamentosCorretiva.value));
    function equipamentoInfo(nome, area) {
      const nomeAlvo = normalizarTexto(nome);
      const areaAlvo = normalizarTexto(area);
      return todosEquipamentosCorretiva.value.find(e =>
        normalizarTexto(e.nome) === nomeAlvo && (!areaAlvo || normalizarTexto(e.area) === areaAlvo)
      ) || null;
    }

    // Lista unificada de evidências do laudo RSG-6302-02: anexos da abertura
    // (fotos/documentos) + a foto de conclusão (quando houver), como um item
    // sintético de imagem.
    function montarAnexosLaudo(chamado, fotoConclusao) {
      const anexos = (chamado.anexos || []).slice();
      if (fotoConclusao) {
        anexos.push({
          id: "conclusao", tipo: "imagem", nome: "Máquina Reparada (Conclusão)",
          tamanhoKB: tamanhoKbDataUrl(fotoConclusao), dataUrl: fotoConclusao,
        });
      }
      return anexos;
    }

    // Upload misto (fotos + documentos), anexado na abertura do chamado
    // (opcional). Cada item: { id, tipo: 'imagem'|'documento', nome,
    // tamanhoKB, mime, dataUrl }. Imagens são comprimidas via canvas antes
    // de virar Base64 (largura máx. 1000px, JPEG 0.7).
    const anexosAbertura = ref([]);
    const inputAnexoUniversalRef = ref(null);
    const enviandoAnexo = ref(false);
    const anexoZoomAtivo = ref(null);

    async function onAnexosSelecionados(e) {
      const arquivos = Array.from(e.target.files || []);
      e.target.value = "";
      if (!arquivos.length) return;
      enviandoAnexo.value = true;
      try {
        for (const file of arquivos) {
          try {
            if (file.type.startsWith("image/")) {
              const dataUrl = await comprimirImagem(file, 1000, 0.7);
              anexosAbertura.value.push({
                id: uid(), tipo: "imagem", nome: file.name,
                tamanhoKB: tamanhoKbDataUrl(dataUrl), mime: file.type, dataUrl,
              });
            } else {
              const dataUrl = await lerArquivoComoDataUrl(file);
              anexosAbertura.value.push({
                id: uid(), tipo: "documento", nome: file.name,
                tamanhoKB: Math.round(file.size / 1024), mime: file.type, dataUrl,
              });
            }
          } catch (err) {
            console.error(err);
            pushToast(`Não foi possível anexar "${file.name}".`, "error");
          }
        }
      } finally {
        enviandoAnexo.value = false;
      }
    }
    function removerAnexoAbertura(id) {
      anexosAbertura.value = anexosAbertura.value.filter(a => a.id !== id);
    }
    function abrirZoomAnexo(dataUrl) { anexoZoomAtivo.value = dataUrl; }
    function fecharZoomAnexo() { anexoZoomAtivo.value = null; }

    // Modal de atendimento/encerramento
    const modalAberto = ref(false);
    const chamadoSelecionado = ref(null);
    const diagnosticoTexto = ref("");
    const resolucaoTexto = ref("");
    const pecasTexto = ref("");
    const fotoConclusaoBase64 = ref(null);
    const fotoConclusaoNome = ref("");
    const encerrando = ref(false);
    const inputCameraConclusaoRef = ref(null);
    const inputGaleriaConclusaoRef = ref(null);
    const assinaturaTecnico = ref(null);
    const assinaturaSupervisorCorretiva = ref(null);
    const assinaturaSupervisorCorretivaNome = ref("");
    function onAssinaturaTecnico(dataUrl) { assinaturaTecnico.value = dataUrl; }
    function onAssinaturaSupervisorCorretiva(dataUrl) { assinaturaSupervisorCorretiva.value = dataUrl; }

    // Laudo oficial RSG-6302-02 (Ordem de Serviço de Manutenção Corretiva)
    const laudoCorretivaAberto = ref(false);
    const laudoCorretivaAtual = ref(null);
    const laudoCorretivaModoPosSalvar = ref(false);
    function fecharLaudoCorretiva() {
      laudoCorretivaAberto.value = false;
      laudoCorretivaAtual.value = null;
    }

    async function carregarChamados(opts) {
      const silencioso = opts && opts.silencioso;
      if (!silencioso) {
        loadingChamados.value = true;
        erroChamados.value = "";
      }
      try {
        const data = await getInitialData();
        const todos = extractCorretivas(data);
        chamados.value = todos
          .filter(c => isStatusChamadoAberto(c.status))
          .sort((a, b) => new Date(b.data) - new Date(a.data));
        chamadosEncerrados.value = todos
          .filter(c => !isStatusChamadoAberto(c.status))
          .sort((a, b) => new Date(b.dataConclusao || b.data) - new Date(a.dataConclusao || a.data));

        const rawEquipData = data.equipamentos || data.Equipamentos || (data.data && data.data.equipamentos) || [];
        const rawEquip = comFallbackEquipamentosTI(Array.isArray(rawEquipData) ? rawEquipData : []);
        todosEquipamentosCorretiva.value = rawEquip.map(e => ({
          idDisplay: e.ID || e.id || e.Tag || e.TAG || "",
          nome: e.Nome || e.Equipamento || e.nome || "Equipamento",
          modelo: e.Modelo || e.modelo || "",
          area: e.Area || e.area || "",
        }));
      } catch (err) {
        console.error(err);
        if (!silencioso) erroChamados.value = "Não foi possível carregar os chamados abertos.";
      } finally {
        if (!silencioso) loadingChamados.value = false;
      }
    }

    async function abrirChamado() {
      if (!form.equipamento.trim()) {
        pushToast("Informe o equipamento com falha.", "error");
        return;
      }
      if (!form.descricao.trim()) {
        pushToast("Descreva a falha observada.", "error");
        return;
      }
      enviando.value = true;
      try {
        const dataAbertura = formatarDataHoraLocalISO();
        const payload = {
          area: form.area,
          equipamento: form.equipamento.trim(),
          descricaoProblema: form.descricao.trim(),
          prioridade: form.prioridade,
          solicitante: props.user.nome || "Produção",
          dataAbertura,
        };
        const resp = await saveCorretivaApi(payload);
        if (resp && resp.status === "error") throw new Error(resp.message || "Erro ao salvar.");

        const idChamado = (resp && (resp.id || resp.ID || resp.idChamado)) || uid();
        const anexos = anexosAbertura.value.slice();

        // Anexos (pesados): enviados à parte, um por um, via POST
        // best-effort — não cabem em query params de uma requisição GET.
        anexos.forEach(a => {
          postToAppsScript({
            action: "attachCorretivaEvidencia",
            idChamado,
            fase: "abertura",
            tipoAnexo: a.tipo,
            fotoBase64: a.dataUrl,
            fotoNome: a.nome,
            mime: a.mime,
          }).catch(err => console.error("Erro ao enviar anexo:", err));
        });

        form.equipamento = "";
        form.descricao = "";
        form.prioridade = "Média";

        const novoChamado = {
          id: idChamado,
          area: payload.area,
          equipamento: payload.equipamento,
          descricao: payload.descricaoProblema,
          prioridade: payload.prioridade,
          solicitante: payload.solicitante,
          status: "Aberto",
          data: dataAbertura,
          anexos,
        };
        chamados.value.unshift(novoChamado);

        anexosAbertura.value = [];
        pushToast("Chamado aberto com sucesso!", "success");

        alertaWhatsAppDados.value = {
          tipo: "corretiva",
          id: idChamado,
          equipamento: payload.equipamento,
          area: payload.area,
          descricao: payload.descricaoProblema,
          inspetor: payload.solicitante,
        };

        // Modal de confirmação com atalho para a Ordem de Serviço (RSG-6302-01);
        // o alerta de WhatsApp só é disparado depois que este for dispensado.
        confirmacaoAberturaChamado.value = novoChamado;
        confirmacaoAberturaAberta.value = true;
      } catch (err) {
        console.error(err);
        pushToast("Erro ao abrir chamado. Tente novamente.", "error");
      } finally {
        enviando.value = false;
      }
    }

    function abrirModalEncerramento(chamado) {
      chamadoSelecionado.value = chamado;
      diagnosticoTexto.value = "";
      resolucaoTexto.value = "";
      pecasTexto.value = "";
      fotoConclusaoBase64.value = null;
      fotoConclusaoNome.value = "";
      assinaturaTecnico.value = null;
      assinaturaSupervisorCorretiva.value = null;
      assinaturaSupervisorCorretivaNome.value = "";
      modalAberto.value = true;
    }

    function fecharModal() {
      if (encerrando.value) return;
      modalAberto.value = false;
      chamadoSelecionado.value = null;
    }

    function onFotoConclusaoSelecionada(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        fotoConclusaoBase64.value = reader.result;
        fotoConclusaoNome.value = file.name;
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    }

    function removerFotoConclusao() {
      fotoConclusaoBase64.value = null;
      fotoConclusaoNome.value = "";
    }

    async function confirmarEncerramento() {
      if (!diagnosticoTexto.value.trim()) {
        pushToast("Descreva o diagnóstico da causa raiz.", "error");
        return;
      }
      if (!resolucaoTexto.value.trim()) {
        pushToast("Descreva a resolução/ação tomada para encerrar o chamado.", "error");
        return;
      }
      if (!assinaturaTecnico.value) {
        pushToast("Colete a assinatura do Técnico Executor.", "error");
        return;
      }
      if (!assinaturaSupervisorCorretiva.value) {
        pushToast("Colete a assinatura do Supervisor da Área.", "error");
        return;
      }
      if (!assinaturaSupervisorCorretivaNome.value.trim()) {
        pushToast("Informe o nome do Supervisor da Área.", "error");
        return;
      }
      const chamado = chamadoSelecionado.value;
      const diagnostico = diagnosticoTexto.value.trim();
      const resolucao = resolucaoTexto.value.trim();
      const pecas = pecasTexto.value.trim();
      const tecnico = props.user.nome || "Produção";
      const foto = fotoConclusaoBase64.value;
      const fotoNomeAnexo = fotoConclusaoNome.value;
      const supervisorNome = assinaturaSupervisorCorretivaNome.value.trim();

      // Texto único enviado ao campo "Resolucao" da planilha (que não tem
      // colunas próprias para diagnóstico/peças): preserva os três campos
      // no mesmo padrão "[TAG] texto" já usado no laudo RSG-6301-01.
      const resolucaoCompleta = [
        `[DIAGNOSTICO] ${diagnostico}`,
        `[RESOLUCAO] ${resolucao}`,
        pecas ? `[PECAS] ${pecas}` : null,
      ].filter(Boolean).join(" | ");

      encerrando.value = true;
      try {
        const resp = await closeCorretivaApi(chamado.id, resolucaoCompleta, tecnico, {
          diagnostico, pecasSubstituidas: pecas, supervisor: supervisorNome,
        });
        if (resp && resp.status === "error") throw new Error(resp.message || "Erro ao encerrar.");

        // Evidência fotográfica (pesada): enviada à parte, via POST best-effort,
        // pois não cabe em query params de uma requisição GET.
        if (foto) {
          postToAppsScript({
            action: "attachCorretivaEvidencia",
            idChamado: chamado.id,
            fase: "conclusao",
            fotoBase64: foto,
            fotoNome: fotoNomeAnexo,
          }).catch(err => console.error("Erro ao enviar evidência fotográfica:", err));
        }

        // Assinaturas digitais (pesadas): mesmo tratamento best-effort da
        // foto — o laudo em tela/PDF já usa a versão em memória.
        postToAppsScript({
          action: "attachCorretivaAssinaturas",
          idChamado: chamado.id,
          assinaturaTecnicoBase64: assinaturaTecnico.value,
          assinaturaSupervisorBase64: assinaturaSupervisorCorretiva.value,
          assinaturaSupervisorNome: supervisorNome,
        }).catch(err => console.error("Erro ao enviar assinaturas digitais:", err));

        // Retorno confirmado pelo servidor: atualiza o objeto do chamado em
        // memória (estado otimista) e re-renderiza a tela na hora.
        const dataFechamento = (resp && (resp.dataFechamento || resp.dataConclusao))
          || formatarDataHoraLocalISO();
        chamado.status = "Fechado";
        chamado.dataConclusao = dataFechamento;
        chamado.resolucao = resolucaoCompleta;
        chamado.tecnico = tecnico;
        chamado.fotoConclusao = foto;

        chamados.value = chamados.value.filter(c => c.id !== chamado.id);
        chamadosEncerrados.value.unshift(chamado);

        pushToast(`Chamado #${chamado.id} encerrado com sucesso!`, "success");
        modalAberto.value = false;

        // Abre a Ordem de Serviço (laudo RSG-6302-02) com os dados completos
        // desta execução — inclusive assinaturas e fotos, que só existem em
        // memória (a planilha guarda apenas o texto agregado de resolução).
        const info = equipamentoInfo(chamado.equipamento, chamado.area);
        laudoCorretivaAtual.value = {
          idChamado: chamado.id,
          area: chamado.area,
          equipamentoIdDisplay: info ? info.idDisplay : "",
          equipamentoNome: chamado.equipamento,
          modelo: info ? info.modelo : "",
          solicitante: chamado.solicitante,
          descricao: chamado.descricao,
          prioridade: chamado.prioridade,
          dataAbertura: chamado.data,
          dataConclusao: dataFechamento,
          tecnico,
          diagnostico, resolucao, pecas,
          anexos: montarAnexosLaudo(chamado, foto),
          assinaturaTecnico: assinaturaTecnico.value,
          assinaturaSupervisor: assinaturaSupervisorCorretiva.value,
          assinaturaSupervisorNome: supervisorNome,
        };
        laudoCorretivaModoPosSalvar.value = true;
        laudoCorretivaAberto.value = true;
        chamadoSelecionado.value = null;

        // NÃO recarrega a API imediatamente: a planilha pode levar um instante
        // para consolidar a escrita. Sincroniza em segundo plano só depois de
        // 3s, sem loading/erro visíveis (a UI local já está correta).
        setTimeout(() => carregarChamados({ silencioso: true }), 3000);
      } catch (err) {
        console.error(err);
        pushToast("Erro ao encerrar o chamado. Tente novamente.", "error");
      } finally {
        encerrando.value = false;
      }
    }

    // Reconstitui os dados do laudo RSG-6302-02 para um chamado já encerrado
    // do histórico — assinaturas e fotos não são persistidas na planilha, só
    // no laudo gerado no momento do encerramento (mesma limitação do RSG-6301-01).
    function abrirLaudoCorretivaHistorico(chamado) {
      const info = equipamentoInfo(chamado.equipamento, chamado.area);
      const partes = { diagnostico: "", resolucao: chamado.resolucao || "", pecas: "" };
      const match = String(chamado.resolucao || "").match(/\[DIAGNOSTICO\]([\s\S]*?)(\||$)/);
      if (match) partes.diagnostico = match[1].trim();
      const matchRes = String(chamado.resolucao || "").match(/\[RESOLUCAO\]([\s\S]*?)(\||$)/);
      if (matchRes) partes.resolucao = matchRes[1].trim();
      const matchPecas = String(chamado.resolucao || "").match(/\[PECAS\]([\s\S]*?)(\||$)/);
      if (matchPecas) partes.pecas = matchPecas[1].trim();

      laudoCorretivaAtual.value = {
        idChamado: chamado.id,
        area: chamado.area,
        equipamentoIdDisplay: info ? info.idDisplay : "",
        equipamentoNome: chamado.equipamento,
        modelo: info ? info.modelo : "",
        solicitante: chamado.solicitante,
        descricao: chamado.descricao,
        prioridade: chamado.prioridade,
        dataAbertura: chamado.data,
        dataConclusao: chamado.dataConclusao,
        tecnico: chamado.tecnico,
        diagnostico: partes.diagnostico, resolucao: partes.resolucao, pecas: partes.pecas,
        anexos: montarAnexosLaudo(chamado, chamado.fotoConclusao || null),
      };
      laudoCorretivaModoPosSalvar.value = false;
      laudoCorretivaAberto.value = true;
    }

    // ===== Gestão Administrativa (Perfil Administrador): editar/excluir chamado =====
    const excluirChamadoAlvo = ref(null);
    const excluindoChamado = ref(false);
    const editarChamadoAlvo = ref(null);
    const editandoChamado = ref(false);

    function pedirExclusaoChamado(c) { excluirChamadoAlvo.value = c; }
    function cancelarExclusaoChamado() { excluirChamadoAlvo.value = null; }
    async function confirmarExclusaoChamado() {
      const alvo = excluirChamadoAlvo.value;
      if (!alvo) return;
      excluindoChamado.value = true;
      try {
        const resp = await deleteRecordApi("corretiva", alvo.id);
        if (resp && resp.status === "error") throw new Error(resp.message || "Erro ao excluir.");
        chamados.value = chamados.value.filter(c => c.id !== alvo.id);
        chamadosEncerrados.value = chamadosEncerrados.value.filter(c => c.id !== alvo.id);
        pushToast("Chamado excluído com sucesso!", "success");
        excluirChamadoAlvo.value = null;
      } catch (err) {
        console.error(err);
        pushToast("Erro ao excluir o chamado. Tente novamente.", "error");
      } finally {
        excluindoChamado.value = false;
      }
    }

    function abrirEdicaoChamado(c) {
      editarChamadoAlvo.value = { id: c.id, area: c.area, equipamento: c.equipamento, prioridade: c.prioridade, descricao: c.descricao };
    }
    function fecharEdicaoChamado() { editarChamadoAlvo.value = null; }
    async function salvarEdicaoChamado() {
      const alvo = editarChamadoAlvo.value;
      if (!alvo) return;
      editandoChamado.value = true;
      try {
        const resp = await updateRecordApi("corretiva", alvo.id, {
          area: alvo.area, equipamento: alvo.equipamento, prioridade: alvo.prioridade, descricaoProblema: alvo.descricao,
        });
        if (resp && resp.status === "error") throw new Error(resp.message || "Erro ao salvar.");
        const registro = chamados.value.find(c => c.id === alvo.id) || chamadosEncerrados.value.find(c => c.id === alvo.id);
        if (registro) {
          registro.area = alvo.area;
          registro.equipamento = alvo.equipamento;
          registro.prioridade = alvo.prioridade;
          registro.descricao = alvo.descricao;
        }
        pushToast("Chamado atualizado com sucesso!", "success");
        editarChamadoAlvo.value = null;
      } catch (err) {
        console.error(err);
        pushToast("Erro ao atualizar o chamado. Tente novamente.", "error");
      } finally {
        editandoChamado.value = false;
      }
    }

    function corPrioridade(p) {
      const found = prioridades.find(x => x.value === p);
      return found ? found.color : "bg-slate-100 text-slate-700 border-slate-300";
    }

    function formatarData(iso) {
      if (!iso) return "-";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    }

    const chamadosFiltrados = computed(() => aplicarFiltrosCorretiva(chamados.value));
    const chamadosEncerradosFiltrados = computed(() => aplicarFiltrosCorretiva(chamadosEncerrados.value));

    // Todos os chamados (abertos + encerrados), filtrados pelo setor do
    // Calendário — base de todas as contagens e da tabela filtrada abaixo.
    const todosChamadosCalendario = computed(() => {
      const alvo = calendarioCorretivaArea.value;
      const todos = chamados.value.concat(chamadosEncerrados.value);
      if (alvo === "todas") return todos;
      return todos.filter(c => String(c.area || "").trim().toLowerCase() === alvo.trim().toLowerCase());
    });

    // Matriz anual: contagem de abertos (por data de abertura) e encerrados
    // (por data de encerramento) em cada um dos 12 meses do ano selecionado.
    const matrizAnualCorretiva = computed(() => {
      const ano = calendarioCorretivaAno.value;
      return MESES_PT.map(m => {
        let abertas = 0, encerradas = 0;
        todosChamadosCalendario.value.forEach(c => {
          const dAbertura = new Date(c.data);
          if (!isNaN(dAbertura.getTime()) && dAbertura.getFullYear() === ano && dAbertura.getMonth() + 1 === m.v && isStatusChamadoAberto(c.status)) abertas++;
          if (c.dataConclusao) {
            const dFim = new Date(c.dataConclusao);
            if (!isNaN(dFim.getTime()) && dFim.getFullYear() === ano && dFim.getMonth() + 1 === m.v) encerradas++;
          }
        });
        return { mes: m.v, label: m.l, abertas, encerradas };
      });
    });

    // Calendário mensal (drill-down): contagem por dia do mês selecionado.
    const diasDoMesCorretiva = computed(() => {
      if (!mesCalendarioSelecionado.value) return [];
      const ano = calendarioCorretivaAno.value;
      const mes = mesCalendarioSelecionado.value;
      const totalDias = new Date(ano, mes, 0).getDate();
      const dias = [];
      for (let dia = 1; dia <= totalDias; dia++) {
        let abertas = 0, encerradas = 0;
        todosChamadosCalendario.value.forEach(c => {
          const dAbertura = new Date(c.data);
          if (!isNaN(dAbertura.getTime()) && dAbertura.getFullYear() === ano && dAbertura.getMonth() + 1 === mes && dAbertura.getDate() === dia && isStatusChamadoAberto(c.status)) abertas++;
          if (c.dataConclusao) {
            const dFim = new Date(c.dataConclusao);
            if (!isNaN(dFim.getTime()) && dFim.getFullYear() === ano && dFim.getMonth() + 1 === mes && dFim.getDate() === dia) encerradas++;
          }
        });
        dias.push({ dia, abertas, encerradas });
      }
      return dias;
    });

    // Tabela filtrada pelo período clicado no Calendário (mês ou dia); sem
    // seleção, mostra todos os chamados do ano/setor filtrado.
    const chamadosCalendarioFiltrados = computed(() => {
      const ano = calendarioCorretivaAno.value;
      const mes = mesCalendarioSelecionado.value;
      const dia = diaCalendarioSelecionado.value;
      return todosChamadosCalendario.value.filter(c => {
        const dRef = c.dataConclusao && !isStatusChamadoAberto(c.status) ? new Date(c.dataConclusao) : new Date(c.data);
        if (isNaN(dRef.getTime()) || dRef.getFullYear() !== ano) return false;
        if (mes && dRef.getMonth() + 1 !== mes) return false;
        if (dia && dRef.getDate() !== dia) return false;
        return true;
      }).sort((a, b) => new Date(b.data) - new Date(a.data));
    });

    onMounted(carregarChamados);

    return {
      areas, prioridades, form, enviando, abrirChamado,
      alertaWhatsAppAberto, alertaWhatsAppDados, fecharAlertaWhatsApp,
      confirmacaoAberturaAberta, confirmacaoAberturaChamado, fecharConfirmacaoAbertura, imprimirOSDaConfirmacao,
      osImpressaoAberta, osImpressaoChamado, abrirOSImpressao, fecharOSImpressao,
      chamados, chamadosEncerrados, loadingChamados, erroChamados, aba, corPrioridade, formatarData, carregarChamados,
      chamadosFiltrados, chamadosEncerradosFiltrados,
      filtroBuscaCorretiva, filtroAreaCorretiva, filtroStatusCorretiva, filtroPrioridadeCorretiva, limparFiltrosCorretiva,
      modalAberto, chamadoSelecionado, diagnosticoTexto, resolucaoTexto, pecasTexto, fotoConclusaoBase64, fotoConclusaoNome, encerrando,
      inputCameraConclusaoRef, inputGaleriaConclusaoRef,
      anexosAbertura, inputAnexoUniversalRef, enviandoAnexo, anexoZoomAtivo,
      onAnexosSelecionados, removerAnexoAbertura, abrirZoomAnexo, fecharZoomAnexo, equipamentoInfo,
      assinaturaSupervisorCorretivaNome, onAssinaturaTecnico, onAssinaturaSupervisorCorretiva,
      abrirModalEncerramento, fecharModal, onFotoConclusaoSelecionada, removerFotoConclusao, confirmarEncerramento,
      laudoCorretivaAberto, laudoCorretivaAtual, laudoCorretivaModoPosSalvar, fecharLaudoCorretiva, abrirLaudoCorretivaHistorico,
      souAdmin: computed(() => isAdmin(props.user)),
      meses: MESES_PT,
      calendarioCorretivaArea, calendarioCorretivaAno, mesCalendarioSelecionado, diaCalendarioSelecionado,
      calendarioCorretivaAnoAnterior, calendarioCorretivaAnoProximo, selecionarMesCalendario, selecionarDiaCalendario, voltarMatrizAnual,
      matrizAnualCorretiva, diasDoMesCorretiva, chamadosCalendarioFiltrados,
      excluirChamadoAlvo, excluindoChamado, editarChamadoAlvo, editandoChamado,
      pedirExclusaoChamado, cancelarExclusaoChamado, confirmarExclusaoChamado,
      abrirEdicaoChamado, fecharEdicaoChamado, salvarEdicaoChamado,
    };
  },
  template: `
  <div class="space-y-6">
    <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
      <h2 class="font-bold text-slate-800 flex items-center gap-2">
        <span class="text-lg">🛠️</span> Abrir Chamado de Manutenção Corretiva
      </h2>

      <div>
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Área</label>
        <select v-model="form.area" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
          <option v-for="a in areas" :key="a" :value="a">{{ a }}</option>
        </select>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Equipamento</label>
        <input v-model="form.equipamento" type="text" placeholder="Ex: Bomba Hidráulica 02"
          class="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500" />
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Prioridade</label>
        <div class="grid grid-cols-4 gap-2">
          <button v-for="p in prioridades" :key="p.value" @click="form.prioridade = p.value"
            class="btn-tap py-2 rounded-lg text-xs sm:text-sm font-bold border-2 transition-colors"
            :class="form.prioridade === p.value ? p.color + ' ring-2 ring-offset-1 ring-current' : 'bg-slate-50 border-slate-200 text-slate-400'">
            {{ p.value }}
          </button>
        </div>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Descrição detalhada da falha</label>
        <textarea v-model="form.descricao" rows="4" placeholder="Descreva o que está acontecendo, ruídos, vazamentos, paradas, etc."
          class="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500"></textarea>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Fotos e Documentos (opcional)</label>
        <button type="button" @click="inputAnexoUniversalRef.click()" :disabled="enviandoAnexo"
          class="btn-tap w-full flex items-center justify-center gap-1.5 bg-white border-2 border-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg text-sm disabled:opacity-60">
          <span v-if="enviandoAnexo" class="spinner"></span>
          <span>{{ enviandoAnexo ? "Processando..." : "📎 Anexar Fotos ou Documentos" }}</span>
        </button>
        <p class="text-[11px] text-slate-400 mt-1">Fotos, manuais técnicos, relatórios de falha (PDF, DOC, XLS, TXT)...</p>
        <input ref="inputAnexoUniversalRef" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" class="hidden" @change="onAnexosSelecionados" />

        <div v-if="anexosAbertura.length" class="mt-3 space-y-2">
          <div v-for="a in anexosAbertura" :key="a.id" class="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-2">
            <img v-if="a.tipo === 'imagem'" :src="a.dataUrl" @click="abrirZoomAnexo(a.dataUrl)"
              class="w-14 h-14 object-cover rounded-md border border-slate-200 cursor-zoom-in shrink-0" alt="Miniatura do anexo" />
            <span v-else class="w-14 h-14 flex items-center justify-center text-2xl bg-white rounded-md border border-slate-200 shrink-0">{{ iconeAnexo(a.nome) }}</span>
            <div class="min-w-0 flex-1">
              <p class="text-xs font-semibold text-slate-700 truncate">{{ a.nome }}</p>
              <p class="text-[11px] text-slate-400">{{ a.tamanhoKB }} KB</p>
            </div>
            <a v-if="a.tipo === 'documento'" :href="a.dataUrl" :download="a.nome" class="btn-tap text-sky-600 text-lg leading-none px-1.5" title="Baixar/visualizar">⬇️</a>
            <button type="button" @click="removerAnexoAbertura(a.id)" class="btn-tap text-red-600 hover:text-red-800 text-lg leading-none px-1.5">✕</button>
          </div>
        </div>
      </div>

      <button @click="abrirChamado" :disabled="enviando"
        class="btn-tap w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl shadow-md">
        <span v-if="enviando" class="spinner"></span>
        <span>{{ enviando ? "Enviando..." : "+ Abrir Novo Chamado Corretivo" }}</span>
      </button>
    </div>

    <div>
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div class="flex gap-2 flex-wrap">
          <button @click="aba = 'abertos'" class="btn-tap px-3 py-1.5 rounded-full text-xs font-semibold border"
            :class="aba === 'abertos' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-500'">
            Chamados Abertos
          </button>
          <button @click="aba = 'encerrados'" class="btn-tap px-3 py-1.5 rounded-full text-xs font-semibold border"
            :class="aba === 'encerrados' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-500'">
            Encerrados / Histórico
          </button>
          <button @click="aba = 'calendario'" class="btn-tap px-3 py-1.5 rounded-full text-xs font-semibold border"
            :class="aba === 'calendario' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-500'">
            📅 Calendário de Corretivas
          </button>
        </div>
        <button @click="carregarChamados" class="text-sky-600 text-sm font-semibold btn-tap">↻ Atualizar</button>
      </div>

      <div v-if="aba !== 'calendario'" class="bg-white rounded-xl border border-slate-200 p-3 mb-3 space-y-2">
        <input v-model="filtroBuscaCorretiva" type="text" placeholder="Buscar por equipamento, ID ou solicitante..."
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        <div class="grid grid-cols-3 gap-2">
          <select v-model="filtroAreaCorretiva" class="rounded-lg border border-slate-300 px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
            <option value="todas">Setor: Todos</option>
            <option v-for="a in areas" :key="a" :value="a">{{ a }}</option>
          </select>
          <select v-model="filtroStatusCorretiva" class="rounded-lg border border-slate-300 px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
            <option value="todos">Status: Todos</option>
            <option value="aberto">Aberto</option>
            <option value="fechado">Fechado</option>
          </select>
          <select v-model="filtroPrioridadeCorretiva" class="rounded-lg border border-slate-300 px-2 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
            <option value="todas">Prioridade: Todas</option>
            <option v-for="p in prioridades" :key="p.value" :value="p.value">{{ p.value }}</option>
          </select>
        </div>
        <button @click="limparFiltrosCorretiva" class="text-sky-600 text-xs font-semibold btn-tap">✕ Limpar Filtros</button>
      </div>

      <div v-if="loadingChamados" class="flex justify-center py-8 text-slate-400">
        <span class="spinner !border-slate-300 !border-t-sky-600"></span>
      </div>
      <div v-else-if="erroChamados" class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
        {{ erroChamados }}
      </div>

      <template v-else-if="aba === 'abertos'">
        <div v-if="chamadosFiltrados.length === 0" class="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-400">
          {{ chamados.length === 0 ? "Nenhum chamado aberto no momento. 🎉" : "Nenhum chamado corresponde aos filtros." }}
        </div>
        <div v-else class="space-y-3">
          <div v-for="c in chamadosFiltrados" :key="c.id" class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div class="flex items-start justify-between gap-2 mb-2">
              <div class="flex items-start gap-2 min-w-0">
                <span class="text-xs font-bold text-slate-400 font-mono shrink-0 mt-0.5">#{{ c.id }}</span>
                <div class="min-w-0">
                  <p class="font-semibold text-slate-800 truncate">{{ c.equipamento }}</p>
                  <p class="text-xs text-slate-400 truncate">{{ c.area }}</p>
                </div>
              </div>
              <span class="text-xs font-bold px-2.5 py-1 rounded-full border whitespace-nowrap shrink-0" :class="corPrioridade(c.prioridade)">
                {{ c.prioridade }}
              </span>
            </div>
            <p class="text-sm text-slate-600 mb-2">{{ c.descricao }}</p>
            <div v-if="c.anexos && c.anexos.length" class="flex items-center gap-1.5 flex-wrap mb-2">
              <span class="text-[11px] font-bold text-slate-500">📎 {{ c.anexos.length }} anexo(s)</span>
              <img v-for="a in c.anexos.filter(x => x.tipo === 'imagem')" :key="a.id" :src="a.dataUrl" @click="abrirZoomAnexo(a.dataUrl)"
                class="w-9 h-9 object-cover rounded border border-slate-200 cursor-zoom-in" alt="Miniatura do anexo" />
              <a v-for="a in c.anexos.filter(x => x.tipo === 'documento')" :key="a.id" :href="a.dataUrl" :download="a.nome" :title="a.nome"
                class="text-[11px] bg-slate-100 border border-slate-200 rounded px-1.5 py-1 flex items-center gap-1 max-w-[110px]">
                <span>{{ iconeAnexo(a.nome) }}</span><span class="truncate">{{ a.nome }}</span>
              </a>
            </div>
            <div class="flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 pt-2 mb-3">
              <span>👤 {{ c.solicitante || "—" }}</span>
              <span class="flex items-center gap-2">
                <span class="font-semibold" :class="String(c.status).toLowerCase() === 'aberto' ? 'text-orange-600' : 'text-sky-600'">{{ c.status }}</span>
                <span>{{ formatarData(c.data) }}</span>
              </span>
            </div>
            <button @click="abrirModalEncerramento(c)"
              class="btn-tap w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-lg text-sm">
              ⚙️ Atender / Encerrar Chamado
            </button>
            <button @click="abrirOSImpressao(c)"
              class="btn-tap w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2 rounded-lg text-sm border border-slate-300 mt-1.5">
              🖨️ Imprimir OS
            </button>
            <div v-if="souAdmin" class="flex gap-1.5 mt-1.5">
              <button @click="abrirEdicaoChamado(c)"
                class="btn-tap flex-1 text-xs font-semibold text-amber-700 border border-amber-200 bg-amber-50 rounded-lg py-1.5">
                ✏️ Editar
              </button>
              <button @click="pedirExclusaoChamado(c)"
                class="btn-tap flex-1 text-xs font-semibold text-red-700 border border-red-200 bg-red-50 rounded-lg py-1.5">
                🗑️ Excluir
              </button>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="aba === 'encerrados'">
        <div v-if="chamadosEncerradosFiltrados.length === 0" class="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-400">
          {{ chamadosEncerrados.length === 0 ? "Nenhum chamado encerrado ainda." : "Nenhum chamado corresponde aos filtros." }}
        </div>
        <div v-else class="space-y-3">
          <div v-for="c in chamadosEncerradosFiltrados" :key="c.id" class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm opacity-90">
            <div class="flex items-start justify-between gap-2 mb-2">
              <div class="flex items-start gap-2 min-w-0">
                <span class="text-xs font-bold text-slate-400 font-mono shrink-0 mt-0.5">#{{ c.id }}</span>
                <div class="min-w-0">
                  <p class="font-semibold text-slate-800 truncate">{{ c.equipamento }}</p>
                  <p class="text-xs text-slate-400 truncate">{{ c.area }}</p>
                </div>
              </div>
              <span class="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap shrink-0">
                {{ c.status }}
              </span>
            </div>
            <p class="text-sm text-slate-600 mb-1"><span class="text-slate-400">Falha relatada:</span> {{ c.descricao }}</p>
            <p v-if="c.resolucao" class="text-sm text-slate-600 mb-2"><span class="text-slate-400">Resolução:</span> {{ c.resolucao }}</p>
            <div v-if="c.anexos && c.anexos.length" class="flex items-center gap-1.5 flex-wrap mb-2">
              <span class="text-[11px] font-bold text-slate-500">📎 {{ c.anexos.length }} anexo(s)</span>
              <img v-for="a in c.anexos.filter(x => x.tipo === 'imagem')" :key="a.id" :src="a.dataUrl" @click="abrirZoomAnexo(a.dataUrl)"
                class="w-9 h-9 object-cover rounded border border-slate-200 cursor-zoom-in" alt="Miniatura do anexo" />
              <a v-for="a in c.anexos.filter(x => x.tipo === 'documento')" :key="a.id" :href="a.dataUrl" :download="a.nome" :title="a.nome"
                class="text-[11px] bg-slate-100 border border-slate-200 rounded px-1.5 py-1 flex items-center gap-1 max-w-[110px]">
                <span>{{ iconeAnexo(a.nome) }}</span><span class="truncate">{{ a.nome }}</span>
              </a>
            </div>
            <div class="flex items-center justify-between text-xs text-slate-400 border-t border-slate-100 pt-2 mt-2 mb-2">
              <span>🔧 {{ c.tecnico || c.solicitante || "—" }}</span>
              <span>{{ formatarData(c.dataConclusao || c.data) }}</span>
            </div>
            <button @click="abrirLaudoCorretivaHistorico(c)"
              class="btn-tap w-full text-xs font-semibold text-sky-600 border border-sky-200 bg-sky-50 rounded-lg py-1.5">
              👁️ Ver Ordem de Serviço (RSG-6302-02)
            </button>
            <div v-if="souAdmin" class="flex gap-1.5 mt-1.5">
              <button @click="abrirEdicaoChamado(c)"
                class="btn-tap flex-1 text-xs font-semibold text-amber-700 border border-amber-200 bg-amber-50 rounded-lg py-1.5">
                ✏️ Editar
              </button>
              <button @click="pedirExclusaoChamado(c)"
                class="btn-tap flex-1 text-xs font-semibold text-red-700 border border-red-200 bg-red-50 rounded-lg py-1.5">
                🗑️ Excluir
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- ABA: Calendário de Corretivas -->
      <template v-else-if="aba === 'calendario'">
        <div class="bg-white rounded-xl border border-slate-200 p-4 space-y-3 mb-4">
          <select v-model="calendarioCorretivaArea" class="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
            <option value="todas">Setor: Todos</option>
            <option v-for="a in areas" :key="a" :value="a">{{ a }}</option>
          </select>

          <div class="flex items-center justify-center gap-4">
            <button @click="calendarioCorretivaAnoAnterior" class="btn-tap w-9 h-9 rounded-full border border-slate-300 text-slate-600 font-bold flex items-center justify-center">‹</button>
            <span class="font-extrabold text-xl text-slate-800 w-20 text-center tabular-nums">{{ calendarioCorretivaAno }}</span>
            <button @click="calendarioCorretivaAnoProximo" class="btn-tap w-9 h-9 rounded-full border border-slate-300 text-slate-600 font-bold flex items-center justify-center">›</button>
          </div>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span class="flex items-center gap-1.5">🔴 Abertas/Pendentes</span>
            <span class="flex items-center gap-1.5">🟢 Encerradas/Concluídas</span>
          </div>
        </div>

        <!-- Matriz Anual (12 meses) -->
        <div v-if="!mesCalendarioSelecionado" class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <button v-for="m in matrizAnualCorretiva" :key="m.mes" @click="selecionarMesCalendario(m.mes)"
            class="btn-tap bg-white rounded-xl border border-slate-200 p-3 text-left hover:border-sky-300 hover:shadow-md transition-all">
            <p class="text-sm font-bold text-slate-700">{{ m.label }}</p>
            <div class="flex gap-3 mt-2 text-xs font-bold">
              <span class="text-red-600">🔴 {{ m.abertas }}</span>
              <span class="text-emerald-600">🟢 {{ m.encerradas }}</span>
            </div>
          </button>
        </div>

        <!-- Calendário Mensal (drill-down por dia) -->
        <div v-else class="mb-4 space-y-3">
          <button @click="voltarMatrizAnual" class="btn-tap text-sm font-semibold text-sky-600 flex items-center gap-1">‹ Voltar à Matriz Anual</button>
          <p class="text-sm font-bold text-slate-700">{{ meses.find(m => m.v === mesCalendarioSelecionado).l }} de {{ calendarioCorretivaAno }}</p>
          <div class="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            <button v-for="d in diasDoMesCorretiva" :key="d.dia" @click="selecionarDiaCalendario(d.dia)"
              class="btn-tap rounded-lg border p-1.5 text-center"
              :class="diaCalendarioSelecionado === d.dia ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-600'">
              <p class="text-xs font-bold">{{ d.dia }}</p>
              <p v-if="d.abertas" class="text-[10px]" :class="diaCalendarioSelecionado === d.dia ? 'text-white' : 'text-red-500'">🔴{{ d.abertas }}</p>
              <p v-if="d.encerradas" class="text-[10px]" :class="diaCalendarioSelecionado === d.dia ? 'text-white' : 'text-emerald-500'">🟢{{ d.encerradas }}</p>
            </button>
          </div>
        </div>

        <!-- Tabela filtrada pelo período selecionado -->
        <div class="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table class="text-sm w-full border-collapse">
            <thead>
              <tr class="bg-slate-800 text-white text-xs">
                <th class="px-3 py-2 text-left whitespace-nowrap">#</th>
                <th class="px-3 py-2 text-left">Equipamento</th>
                <th class="px-3 py-2 text-left">Setor</th>
                <th class="px-3 py-2 text-left">Status</th>
                <th class="px-3 py-2 text-left whitespace-nowrap">Data</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in chamadosCalendarioFiltrados" :key="c.id" class="border-t border-slate-100">
                <td class="px-3 py-2 font-mono text-xs text-slate-400 whitespace-nowrap">#{{ c.id }}</td>
                <td class="px-3 py-2 text-slate-700">{{ c.equipamento }}</td>
                <td class="px-3 py-2 text-slate-500">{{ c.area }}</td>
                <td class="px-3 py-2">
                  <span class="text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                    :class="String(c.status).toLowerCase() === 'aberto' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'">
                    {{ c.status }}
                  </span>
                </td>
                <td class="px-3 py-2 text-slate-400 whitespace-nowrap">{{ formatarData(c.dataConclusao || c.data) }}</td>
              </tr>
              <tr v-if="chamadosCalendarioFiltrados.length === 0">
                <td colspan="5" class="px-3 py-6 text-center text-slate-400">Nenhum chamado no período selecionado.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <!-- MODAL: Atender / Encerrar Chamado -->
    <div v-if="modalAberto" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4" @click.self="fecharModal">
      <div class="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <h3 class="font-bold text-slate-800">Chamado #{{ chamadoSelecionado && chamadoSelecionado.id }}</h3>
          <button @click="fecharModal" class="btn-tap text-slate-400 hover:text-slate-600 text-xl leading-none px-2">✕</button>
        </div>

        <div v-if="chamadoSelecionado" class="p-5 space-y-4">
          <div class="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-1.5">
            <p class="font-semibold text-slate-800">{{ chamadoSelecionado.equipamento }}</p>
            <p class="text-sm text-slate-500">Área: {{ chamadoSelecionado.area }}</p>
            <p class="text-sm text-slate-500 flex items-center gap-2">
              Prioridade:
              <span class="text-xs font-bold px-2 py-0.5 rounded-full border" :class="corPrioridade(chamadoSelecionado.prioridade)">{{ chamadoSelecionado.prioridade }}</span>
            </p>
            <p class="text-sm text-slate-600 pt-1"><span class="text-slate-400">Relato original:</span> {{ chamadoSelecionado.descricao }}</p>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Diagnóstico da Causa Raiz *</label>
            <textarea v-model="diagnosticoTexto" rows="3" placeholder="O que causou a falha..."
              class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"></textarea>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Resolução / Ação Tomada *</label>
            <textarea v-model="resolucaoTexto" rows="3" placeholder="Descreva o que foi feito para resolver o problema..."
              class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"></textarea>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Peças Substituídas (opcional)</label>
            <textarea v-model="pecasTexto" rows="2" placeholder="Ex: Rolamento 6205, Vedação de borracha..."
              class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"></textarea>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Evidência da Conclusão (opcional)</label>
            <div class="flex gap-2">
              <button type="button" @click="inputCameraConclusaoRef.click()"
                class="btn-tap flex-1 flex items-center justify-center gap-1.5 bg-white border-2 border-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg text-sm">
                📷 Tirar Foto
              </button>
              <button type="button" @click="inputGaleriaConclusaoRef.click()"
                class="btn-tap flex-1 flex items-center justify-center gap-1.5 bg-white border-2 border-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg text-sm">
                📁 Selecionar Arquivo
              </button>
            </div>
            <input ref="inputCameraConclusaoRef" type="file" accept="image/*" capture="environment" class="hidden" @change="onFotoConclusaoSelecionada" />
            <input ref="inputGaleriaConclusaoRef" type="file" accept="image/*" class="hidden" @change="onFotoConclusaoSelecionada" />

            <div v-if="fotoConclusaoBase64" class="mt-3 flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-2">
              <img :src="fotoConclusaoBase64" class="w-16 h-16 object-cover rounded-md border border-slate-200" alt="Prévia da evidência de conclusão" />
              <p class="text-xs text-slate-600 truncate flex-1">{{ fotoConclusaoNome }}</p>
              <button type="button" @click="removerFotoConclusao" class="btn-tap text-red-600 hover:text-red-800 text-lg leading-none px-2">✕</button>
            </div>
          </div>

          <div class="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
            <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">✍️ Assinatura Digital</h4>
            <assinatura-canvas label="Assinatura do Técnico Executor" @update="onAssinaturaTecnico"></assinatura-canvas>
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nome do Supervisor da Área *</label>
              <input v-model="assinaturaSupervisorCorretivaNome" type="text" placeholder="Nome completo"
                class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <assinatura-canvas label="Assinatura do Supervisor da Área" @update="onAssinaturaSupervisorCorretiva"></assinatura-canvas>
          </div>

          <div class="flex gap-2 pt-1">
            <button @click="fecharModal" :disabled="encerrando"
              class="btn-tap flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-semibold py-3 rounded-xl">
              Cancelar
            </button>
            <button @click="confirmarEncerramento" :disabled="encerrando || !resolucaoTexto.trim() || !diagnosticoTexto.trim()"
              class="btn-tap flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl shadow-md">
              <span v-if="encerrando" class="spinner"></span>
              <span>{{ encerrando ? "Encerrando..." : "Concluir e Fechar Chamado" }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Zoom/preview de imagem anexada -->
    <div v-if="anexoZoomAtivo" class="no-print fixed inset-0 z-[60] bg-slate-900/90 flex items-center justify-center p-4" @click="fecharZoomAnexo">
      <img :src="anexoZoomAtivo" class="max-w-full max-h-full rounded-lg shadow-2xl" alt="Anexo em zoom" />
      <button @click="fecharZoomAnexo" class="btn-tap absolute top-4 right-4 text-white text-3xl leading-none">✕</button>
    </div>

    <laudo-corretiva-modal v-if="laudoCorretivaAberto" :laudo="laudoCorretivaAtual" :modo-pos-salvar="laudoCorretivaModoPosSalvar"
      @fechar="fecharLaudoCorretiva">
    </laudo-corretiva-modal>

    <alerta-whats-app-modal v-if="alertaWhatsAppAberto" :dados="alertaWhatsAppDados" @fechar="fecharAlertaWhatsApp"></alerta-whats-app-modal>

    <!-- MODAL: confirmação de abertura de chamado, com atalho para a OS -->
    <div v-if="confirmacaoAberturaAberta" class="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="fecharConfirmacaoAbertura">
      <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4 text-center">
        <p class="text-4xl">✅</p>
        <h3 class="font-bold text-slate-800 text-lg">Chamado #{{ confirmacaoAberturaChamado && confirmacaoAberturaChamado.id }} aberto com sucesso!</h3>
        <div class="space-y-2 pt-1">
          <button @click="imprimirOSDaConfirmacao" class="btn-tap w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 rounded-lg text-sm">
            🖨️ Imprimir Ordem de Serviço (PDF)
          </button>
          <button @click="fecharConfirmacaoAbertura" class="btn-tap w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg text-sm">
            Concluir / Voltar à Lista
          </button>
        </div>
      </div>
    </div>

    <ordem-servico-modal v-if="osImpressaoAberta" :chamado="osImpressaoChamado" @fechar="fecharOSImpressao"></ordem-servico-modal>

    <!-- MODAL: confirmação de exclusão (Gestão Administrativa) -->
    <div v-if="excluirChamadoAlvo" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="cancelarExclusaoChamado">
      <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4">
        <h3 class="font-bold text-slate-800">Excluir chamado?</h3>
        <p class="text-sm text-slate-600">Esta ação remove definitivamente o chamado <span class="font-semibold">#{{ excluirChamadoAlvo.id }}</span> ({{ excluirChamadoAlvo.equipamento }}). Não pode ser desfeita.</p>
        <div class="flex gap-2 pt-1">
          <button @click="cancelarExclusaoChamado" :disabled="excluindoChamado"
            class="btn-tap flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-semibold py-2.5 rounded-xl">
            Cancelar
          </button>
          <button @click="confirmarExclusaoChamado" :disabled="excluindoChamado"
            class="btn-tap flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl">
            <span v-if="excluindoChamado" class="spinner"></span>
            <span>{{ excluindoChamado ? "Excluindo..." : "🗑️ Excluir" }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: edição de chamado (Gestão Administrativa) -->
    <div v-if="editarChamadoAlvo" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="fecharEdicaoChamado">
      <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4">
        <h3 class="font-bold text-slate-800">Editar chamado #{{ editarChamadoAlvo.id }}</h3>
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Área</label>
          <select v-model="editarChamadoAlvo.area" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
            <option v-for="a in areas" :key="a" :value="a">{{ a }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Equipamento</label>
          <input v-model="editarChamadoAlvo.equipamento" type="text"
            class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Prioridade</label>
          <select v-model="editarChamadoAlvo.prioridade" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
            <option v-for="p in prioridades" :key="p.value" :value="p.value">{{ p.value }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Descrição</label>
          <textarea v-model="editarChamadoAlvo.descricao" rows="3"
            class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"></textarea>
        </div>
        <div class="flex gap-2 pt-1">
          <button @click="fecharEdicaoChamado" :disabled="editandoChamado"
            class="btn-tap flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-semibold py-2.5 rounded-xl">
            Cancelar
          </button>
          <button @click="salvarEdicaoChamado" :disabled="editandoChamado"
            class="btn-tap flex-1 flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl">
            <span v-if="editandoChamado" class="spinner"></span>
            <span>{{ editandoChamado ? "Salvando..." : "Salvar" }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>`
};
