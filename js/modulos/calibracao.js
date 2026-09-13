/* ==========================================================================
   js/modulos/calibracao.js — Calibração & Medição (RSG-7601-02)
   Normalização tolerante dos dados da planilha (aceita tanto os cabeçalhos
   literais com espaço/acento quanto variações antigas), classificação de
   status/grandeza metrológica, e os componentes Vue do módulo: listagem,
   modal de edição/exclusão, ficha do instrumento, etiqueta/QR Code, laudo
   e registro de checagem semestral. Depende de js/api.js e do núcleo
   compartilhado do index.html.
   ========================================================================== */
// Leitura tolerante do item vindo da aba "Calibracoes_Controle": o cabeçalho
// real da planilha usa nomes de coluna (Descricao, Marca_Modelo,
// Criterio_Aceitacao, Vencimento_Calibracao, Operador_Responsavel etc.) que
// não batiam com os nomes assumidos originalmente no front-end, fazendo a
// tabela renderizar em branco mesmo com dados gravados. Cada campo aceita
// múltiplas variações de nome (grafia antiga, nova e minúscula) para nunca
// depender de uma única convenção da planilha.
// Cabeçalhos literais reais da planilha (com espaço/acento, ex.: "Nº de
// Série", "Marca/Modelo", "Critério de Aceitação", "Certificado RBC",
// "Link Laudo PDF", "Data Calibração", "Vencimento Calibração") entram como
// alias de maior precedência em cada campo — sem eles, o modal de "Editar"
// abria com vários campos em branco (a planilha nunca usou os nomes
// underscore/sem-acento assumidos originalmente), mesmo campos como
// "Observações" da checagem, que a planilha chama de coluna própria e não
// de "Laboratorio".
// Alguns campos (TAG em especial, ex.: "25251329") chegam da planilha como
// Number quando a célula está formatada como número, não texto. Qualquer
// operação de string (.toLowerCase, .trim, .includes) quebra em silêncio
//("x.toLowerCase is not a function") se o valor não for garantidamente uma
// string — daí todo campo textual de normalizeCalibracao passar por aqui.
function textoSeguro(v) {
  return (v === undefined || v === null) ? "" : v.toString().trim();
}
function normalizeCalibracao(c) {
  const dataChecagem = textoSeguro(c.Data_Checagem || c.DataChecagem || c.data_checagem);
  return {
    id: c.ID || c.Id || c.id || uid(),
    tag: textoSeguro(c.TAG || c.Tag || c.tag || c.Codigo || c.codigo),
    equipamento: textoSeguro(c["Descrição"] || c.Descricao || c.descricao || c.Instrumento || c.Equipamento || c.equipamento || c.Nome || c.nome),
    modelo: textoSeguro(c["Marca/Modelo"] || c.Marca_Modelo || c.MarcaModelo || c.marca_modelo || c.Modelo || c.modelo),
    capacidade: textoSeguro(c.Capacidade || c.capacidade),
    tolerancia: textoSeguro(c["Critério de Aceitação"] || c.Criterio_Aceitacao || c.criterio_aceitacao || c.criterio || c.Tolerancia || c.Tolerância || c.tolerancia || c["Tolerância"]),
    numeroSerie: textoSeguro(c["Nº de Série"] || c.Numero_Serie || c.NumeroSerie || c.numero_serie || c.numeroSerie || c["Nº_Serie"] || c.NSerie || c.serie),
    area: textoSeguro(c.Setor || c.setor || c.Area || c.area),
    responsavel: textoSeguro(c.Responsável || c.Operador_Responsavel || c.Operador_Responsave || c.Operador || c.operador || c.Responsavel || c.responsavel),
    certificadoRbc: textoSeguro(c["Certificado RBC"] || c.Certificado_RBC || c.CertificadoRBC || c.certificado_rbc || c.Certificado || c.certificado || c.Numero_Certificado || c.numero_certificado),
    laboratorio: textoSeguro(c["Observações"] || c.Observacoes || c.Obs_Checagem || c.obsChecagem || c.Laboratorio || c.laboratorio || c.Laboratório || c.laboratório),
    dataCalibracao: textoSeguro(c["Data Calibração"] || c.Data_Calibracao || c.DataCalibracao || c.data_calibracao),
    dataValidade: textoSeguro(c["Vencimento Calibração"] || c.Vencimento_Calibracao || c.VencimentoCalibracao || c.vencimento_calibracao || c.Validade || c.validade
      || c.Data_Validade || c.DataValidade || c.data_validade || c.Proxima_Calibracao || c.ProximaCalibracao),
    dataChecagem,
    vencimentoChecagem: textoSeguro(c.Vencimento_Checagem || c.VencimentoChecagem || c.vencimento_checagem || c.vencimentoChecagem) || calcularVencimentoChecagem(dataChecagem),
    emCalibracao: parseBooleanoFlexivel(c.Em_Calibracao ?? c.EmCalibracao ?? c.em_calibracao ?? c.Situacao ?? c.situacao),
    dataEnvioLaboratorio: textoSeguro(c.Data_Envio_Laboratorio || c.DataEnvioLaboratorio || c.data_envio_laboratorio),
    previsaoRetorno: textoSeguro(c.Previsao_Retorno || c.PrevisaoRetorno || c.previsao_retorno),
    urlCertificado: textoSeguro(c["Link Laudo PDF"] || c.Link_Laudo_PDF || c.linkLaudo || c.URL_Certificado || c.UrlCertificado || c.url_certificado || c.Link_Certificado || c.link_certificado),
    // Status textual já calculado na planilha (ex.: fórmula de "Prazo - Mais
    // de 45 dias"), mantido só como referência bruta — o selo colorido
    // exibido na tela continua vindo de `statusInstrumentoCalibracao`, que
    // já cobre "Em Calibração" e os limiares de 45 dias de forma consistente
    // com os cards de resumo e os filtros.
    statusBruto: textoSeguro(c.Status || c.status) || "Prazo - Mais de 45 dias",
  };
}
// Status por validade da calibração (uso geral, independe de estar em
// trânsito com o laboratório): 🟢 No Prazo (> 45 dias) / 🟡 Atenção
// (<= 45 dias) / 🔴 Vencido — ou "Sem data" quando a validade não foi
// informada, para nunca quebrar a tela.
function statusValidadeCalibracao(dataValidade) {
  const d = parseDataHoraLocal(dataValidade);
  if (!d) return { label: "Sem data", cor: "⚪", cls: "bg-slate-100 text-slate-600" };
  const hoje = new Date();
  const diffDias = Math.floor((d.getTime() - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) / 86400000);
  if (diffDias < 0) return { label: "Vencido", cor: "🔴", cls: "bg-red-100 text-red-700", diffDias };
  if (diffDias <= 45) return { label: "Atenção", cor: "🟡", cls: "bg-amber-100 text-amber-700", diffDias };
  return { label: "No Prazo", cor: "🟢", cls: "bg-emerald-100 text-emerald-700", diffDias };
}
// Classificação a partir do texto já calculado pela própria planilha (coluna
// "Status" da aba Calibracoes_Controle, ex.: "Prazo - Mais de 45 dias",
// "Encaminhado para Calibração", "Vencido"). Recalcular esse status a partir
// da data no front-end divergia do valor real da planilha (itens aparecendo
// como "Vencido" na tela mesmo com a planilha dizendo o contrário), então a
// tela agora apenas espelha o texto da planilha em vez de reprocessá-lo.
// Retorna null quando o texto não bate com nenhum padrão conhecido, para que
// o chamador caia num fallback seguro.
function classificarStatusPlanilha(statusTexto) {
  const t = (statusTexto || "").toString().trim().toUpperCase();
  if (!t) return null;
  if (t.includes("VENCEU") || t.includes("VENCIDO")) {
    return { label: "Vencido", cor: "🔴", cls: "bg-red-100 text-red-700" };
  }
  if (t.includes("ENCAMINHADO") || t.includes("CALIBRAÇÃO") || t.includes("CALIBRAR") || t.includes("LABORATÓRIO")) {
    return { label: "Em Calibração", cor: "🟠", cls: "bg-orange-100 text-orange-700" };
  }
  if (t.includes("MENOS DE 45") || t.includes("MENOS DE 30") || t.includes("MENOS DE 10") || t.includes("ATENÇÃO")) {
    return { label: "Atenção", cor: "🟡", cls: "bg-amber-100 text-amber-700" };
  }
  if (t.includes("MAIS DE 45") || t.includes("CALIBRADO") || t.includes("NO PRAZO") || t.includes("EM DIA")) {
    return { label: "No Prazo", cor: "🟢", cls: "bg-emerald-100 text-emerald-700" };
  }
  return null;
}
// Status "operacional" exibido na tabela/cards: prioriza SEMPRE o texto da
// coluna Status da planilha (statusBruto); só recorre ao sinalizador manual
// "Em Calibração" do cadastro e, por fim, ao cálculo por data como rede de
// segurança para registros sem nenhum Status reconhecível — nunca para
// sobrepor um Status que a planilha já informou.
function statusInstrumentoCalibracao(c) {
  const daPlanilha = classificarStatusPlanilha(c && c.statusBruto);
  if (daPlanilha) return daPlanilha;
  if (c && c.emCalibracao) return { label: "Em Calibração", cor: "🟠", cls: "bg-orange-100 text-orange-700" };
  return statusValidadeCalibracao(c && c.dataValidade);
}
// Deep link do instrumento: impresso como QR Code na etiqueta (RSG-7601-02)
// e lido de volta no mount do App para abrir direto a ficha completa ao
// escanear pelo celular — ver `consumirDeepLinkCalibracao` em App.setup().
function gerarUrlInstrumento(id) {
  return `${location.origin}${location.pathname}#calibracao/${encodeURIComponent(id)}`;
}
// Colunas compostas reaproveitadas tanto pela tabela de Calibração & Medição
// quanto pelo Dashboard Metrológico em Indicadores: mesmas regras de
// fallback do mapeamento de colunas da planilha, aplicadas na exibição para
// nunca deixar a célula em branco.
function nomeInstrumentoModelo(c) {
  return [c.equipamento, c.modelo].filter(Boolean).join(" - ") || "-";
}
function capacidadeTolerancia(c) {
  if (c.capacidade && c.tolerancia) return `${c.capacidade} | ${c.tolerancia}`;
  return c.capacidade || c.tolerancia || "-";
}
// Classificação por grandeza metrológica a partir do nome/descrição do
// instrumento — usada só no Dashboard Metrológico & Calibração (Indicadores)
// para agrupar visualmente por tipo de medição. Palavras-chave em português,
// sem acento (compara via normalizarTexto), cobrindo os instrumentos comuns
// de fábrica; qualquer nome não reconhecido cai em "Outros".
const CORES_GRANDEZA = {
  Dimensional: "#0ea5e9", "Elétrica": "#f59e0b", "Pressão": "#8b5cf6",
  Temperatura: "#ef4444", Massa: "#10b981", Outros: "#64748b",
};
function classificarGrandezaMetrologica(nomeInstrumento) {
  const n = normalizarTexto(nomeInstrumento || "");
  if (/paquimetro|micrometro|trena|escala|calibre|relogio comparador|goniometro/.test(n)) return "Dimensional";
  if (/alicate|multimetro|megometro|terrometro|voltimetro|amperimetro|wattimetro/.test(n)) return "Elétrica";
  if (/manometro|vacuometro|pressao/.test(n)) return "Pressão";
  if (/mufla|termometro|termopar|termohigrometro|estufa|forno|temperatura/.test(n)) return "Temperatura";
  if (/balanca|peso padrao|massa/.test(n)) return "Massa";
  return "Outros";
}
function extrairIdCalibracaoDoHash(hash) {
  const m = String(hash || "").match(/^#calibracao\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}
/* ==========================================================================
   ETIQUETA & QR CODE (RSG-7601-02) — impressão física do instrumento
   ========================================================================== */
const EtiquetaQrModal = {
  props: { instrumento: Object },
  emits: ["fechar"],
  setup(props) {
    const qrContainer = ref(null);
    const url = computed(() => gerarUrlInstrumento(props.instrumento && props.instrumento.id));

    function montarQRCode() {
      if (!qrContainer.value || typeof QRCode === "undefined") return;
      qrContainer.value.innerHTML = "";
      new QRCode(qrContainer.value, { text: url.value, width: 148, height: 148, correctLevel: QRCode.CorrectLevel.M });
    }
    onMounted(() => nextTick(montarQRCode));

    function imprimir() {
      window.print();
    }
    function formatarData(v) {
      const d = parseDataHoraLocal(v);
      return d ? d.toLocaleDateString("pt-BR") : "-";
    }

    return { qrContainer, url, imprimir, formatarData };
  },
  template: `
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4">
    <div class="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] overflow-y-auto">
      <div class="no-print sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
        <h3 class="font-bold text-slate-800">📱 Etiqueta & QR Code</h3>
        <button @click="$emit('fechar')" class="btn-tap text-slate-400 hover:text-slate-600 text-xl leading-none px-2">✕</button>
      </div>

      <div id="laudo-imprimivel" class="p-6" v-if="instrumento">
        <div class="border-2 border-slate-800 rounded-xl p-4 text-center space-y-3">
          <div class="flex items-center justify-center gap-2">
            <div class="w-7 h-7 rounded-md bg-sky-600 flex items-center justify-center shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11 21h2m-2-3h2M4 21V9a1 1 0 011-1h3V4a1 1 0 011-1h6a1 1 0 011 1v4h3a1 1 0 011 1v12M9 8h6M9 12h6M9 16h2"/>
              </svg>
            </div>
            <p class="text-sm font-extrabold text-slate-800 tracking-wide">HIDROGERON</p>
          </div>
          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Etiqueta de Calibração · RSG-7601-02</p>

          <p class="text-2xl font-black text-slate-900 font-mono tracking-wide">{{ instrumento.tag || instrumento.id }}</p>
          <p class="text-sm font-semibold text-slate-700 leading-tight">{{ instrumento.equipamento }}</p>
          <p v-if="instrumento.modelo" class="text-xs text-slate-400 -mt-2">{{ instrumento.modelo }}</p>

          <div ref="qrContainer" class="flex items-center justify-center py-1"></div>

          <div class="border-t border-dashed border-slate-300 pt-2 space-y-0.5">
            <p class="text-xs text-slate-500">Validade da Calibração</p>
            <p class="text-base font-extrabold text-slate-800">{{ formatarData(instrumento.dataValidade) }}</p>
          </div>
          <p class="text-[9px] text-slate-400 break-all">{{ url }}</p>
        </div>
      </div>

      <div class="no-print p-5 pt-0">
        <button @click="imprimir" class="btn-tap w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 rounded-xl text-sm">
          🖨️ Imprimir Etiqueta
        </button>
      </div>
    </div>
  </div>`
};
/* ==========================================================================
   LAUDO TÉCNICO / CERTIFICADO DE CALIBRAÇÃO (RSG-7601-02)
   ========================================================================== */
const RSG_CALIBRACAO_CODIGO = "RSG-7601-02";
const RSG_CALIBRACAO_TITULO = "RSG-7601-02 - Laudo de Calibração & Medição";
const LaudoCalibracaoModal = {
  props: { instrumento: Object },
  emits: ["fechar"],
  setup(props) {
    const exportandoPdf = ref(false);
    const status = computed(() => statusInstrumentoCalibracao(props.instrumento || {}));

    function formatarData(v) {
      const d = parseDataHoraLocal(v);
      return d ? d.toLocaleDateString("pt-BR") : "-";
    }
    const nomeArquivo = computed(() => {
      const i = props.instrumento || {};
      return `${RSG_CALIBRACAO_CODIGO}_${sanitizarNomeArquivo(i.tag || i.equipamento || "instrumento")}.pdf`;
    });

    function imprimir() {
      window.print();
    }
    function abrirCertificadoPdf() {
      const url = props.instrumento && props.instrumento.urlCertificado;
      if (!url) return;
      window.open(url, "_blank", "noopener");
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

    return { exportandoPdf, status, formatarData, nomeArquivo, imprimir, exportarPDF, abrirCertificadoPdf, RSG_CALIBRACAO_CODIGO, RSG_CALIBRACAO_TITULO };
  },
  template: `
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4">
    <div class="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] overflow-y-auto">
      <div class="no-print sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
        <h3 class="font-bold text-slate-800">Laudo de Calibração</h3>
        <button @click="$emit('fechar')" class="btn-tap text-slate-400 hover:text-slate-600 text-xl leading-none px-2">✕</button>
      </div>

      <div id="laudo-imprimivel" class="p-5 space-y-4" v-if="instrumento">
        <div class="border-b-2 border-slate-800 pb-3">
          <p class="text-xs font-bold text-sky-700 uppercase tracking-wide">Hidrogeron - Sistema de Manutenção</p>
          <h2 class="text-lg font-extrabold text-slate-900 mt-0.5">{{ RSG_CALIBRACAO_TITULO }}</h2>
          <div class="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-500">
            <p><span class="font-semibold text-slate-700">TAG:</span> {{ instrumento.tag || "-" }}</p>
            <p><span class="font-semibold text-slate-700">Nº Série:</span> {{ instrumento.numeroSerie || "-" }}</p>
          </div>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Dados do Instrumento</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <p class="col-span-2"><span class="text-slate-400">Instrumento:</span> <span class="font-medium text-slate-800">{{ instrumento.equipamento || '-' }}</span></p>
            <p><span class="text-slate-400">Modelo:</span> <span class="font-medium text-slate-800">{{ instrumento.modelo || '-' }}</span></p>
            <p><span class="text-slate-400">Capacidade:</span> <span class="font-medium text-slate-800">{{ instrumento.capacidade || '-' }}</span></p>
            <p><span class="text-slate-400">Tolerância:</span> <span class="font-medium text-slate-800">{{ instrumento.tolerancia || '-' }}</span></p>
            <p><span class="text-slate-400">Setor:</span> <span class="font-medium text-slate-800">{{ instrumento.area || '-' }}</span></p>
            <p class="col-span-2"><span class="text-slate-400">Responsável:</span> <span class="font-medium text-slate-800">{{ instrumento.responsavel || '-' }}</span></p>
          </div>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Rastreabilidade Metrológica</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-2">
            <div class="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <p><span class="text-slate-400">Certificado RBC:</span> <span class="font-medium text-slate-800">{{ instrumento.certificadoRbc || '-' }}</span></p>
              <p><span class="text-slate-400">Laboratório:</span> <span class="font-medium text-slate-800">{{ instrumento.laboratorio || '-' }}</span></p>
              <p><span class="text-slate-400">Data da Calibração:</span> <span class="font-medium text-slate-800">{{ formatarData(instrumento.dataCalibracao) }}</span></p>
              <p><span class="text-slate-400">Validade:</span> <span class="font-medium text-slate-800">{{ formatarData(instrumento.dataValidade) }}</span></p>
            </div>
            <span class="inline-block text-xs font-bold px-3 py-1 rounded-full" :class="status.cls">{{ status.cor }} {{ status.label }}</span>
          </div>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Checagem Intermediária (180 dias)</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <p><span class="text-slate-400">Última Checagem:</span> <span class="font-medium text-slate-800">{{ instrumento.dataChecagem ? formatarData(instrumento.dataChecagem) : "Nenhuma registrada" }}</span></p>
            <p><span class="text-slate-400">Próximo Vencimento:</span> <span class="font-medium text-slate-800">{{ instrumento.vencimentoChecagem ? formatarData(instrumento.vencimentoChecagem) : "-" }}</span></p>
          </div>
        </div>

        <div class="no-print" v-if="instrumento.urlCertificado">
          <button @click="abrirCertificadoPdf" class="btn-tap w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg text-sm">
            🔗 Abrir Certificado RBC (PDF)
          </button>
        </div>
        <p v-else class="text-xs text-slate-400 text-center">Certificado digital (PDF) ainda não anexado a este cadastro.</p>
      </div>

      <div class="no-print p-5 pt-0 flex gap-2">
        <button @click="imprimir" class="btn-tap flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg text-sm">🖨️ Imprimir</button>
        <button @click="exportarPDF" :disabled="exportandoPdf" class="btn-tap flex-1 flex items-center justify-center gap-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm">
          <span v-if="exportandoPdf" class="spinner !w-3.5 !h-3.5"></span>
          <span>{{ exportandoPdf ? "Gerando..." : "⬇️ Exportar PDF" }}</span>
        </button>
      </div>
    </div>
  </div>`
};
/* ==========================================================================
   REGISTRO DE CHECAGEM SEMESTRAL (180 dias)
   ========================================================================== */
const ChecagemModal = {
  props: { instrumento: Object, usuarioNome: String, salvando: Boolean },
  emits: ["fechar", "confirmar"],
  setup(props, { emit }) {
    const operador = ref(props.usuarioNome || "");
    const hojeFormatado = computed(() => new Date().toLocaleDateString("pt-BR"));
    const vencimentoPrevisto = computed(() => {
      const iso = calcularVencimentoChecagem(formatarDataISO(new Date()));
      const d = parseDataHoraLocal(iso);
      return d ? d.toLocaleDateString("pt-BR") : "-";
    });
    function formatarData(v) {
      const d = parseDataHoraLocal(v);
      return d ? d.toLocaleDateString("pt-BR") : "-";
    }
    function confirmar() {
      if (!operador.value.trim()) {
        pushToast("Informe o nome do operador responsável pela checagem.", "error");
        return;
      }
      emit("confirmar", operador.value.trim());
    }
    return { operador, hojeFormatado, vencimentoPrevisto, formatarData, confirmar };
  },
  template: `
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4">
    <div class="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl p-5 space-y-4" v-if="instrumento">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-slate-800">✅ Registrar Checagem Semestral</h3>
        <button @click="$emit('fechar')" class="btn-tap text-slate-400 hover:text-slate-600 text-xl leading-none px-2">✕</button>
      </div>
      <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 text-sm space-y-1">
        <p class="font-semibold text-slate-800">{{ instrumento.tag ? instrumento.tag + " — " : "" }}{{ instrumento.equipamento }}</p>
        <p class="text-xs text-slate-500">Última checagem: {{ instrumento.dataChecagem ? formatarData(instrumento.dataChecagem) : "Nenhuma registrada" }}</p>
      </div>
      <p class="text-xs text-slate-500">Confirma a checagem intermediária de fábrica hoje ({{ hojeFormatado }})? O próximo vencimento será recalculado para <span class="font-semibold text-slate-700">{{ vencimentoPrevisto }}</span> (+180 dias).</p>
      <div>
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Operador Responsável *</label>
        <input v-model="operador" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
      </div>
      <button @click="confirmar" :disabled="salvando" class="btn-tap w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl text-sm">
        <span v-if="salvando" class="spinner"></span>
        <span>{{ salvando ? "Registrando..." : "✅ Confirmar Checagem" }}</span>
      </button>
    </div>
  </div>`
};
/* ==========================================================================
   FICHA COMPLETA DO INSTRUMENTO (destino do QR Code / clique na linha)
   ========================================================================== */
const FichaInstrumentoModal = {
  props: { instrumento: Object },
  emits: ["fechar", "gerar-qr", "ver-laudo", "registrar-checagem", "editar"],
  setup(props) {
    const status = computed(() => statusInstrumentoCalibracao(props.instrumento || {}));
    function formatarData(v) {
      const d = parseDataHoraLocal(v);
      return d ? d.toLocaleDateString("pt-BR") : "-";
    }
    return { status, formatarData };
  },
  template: `
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4">
    <div class="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] overflow-y-auto" v-if="instrumento">
      <div class="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
        <div class="min-w-0">
          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ficha Completa do Instrumento</p>
          <h3 class="font-bold text-slate-800 truncate">{{ instrumento.tag ? instrumento.tag + " — " : "" }}{{ instrumento.equipamento }}</h3>
        </div>
        <button @click="$emit('fechar')" class="btn-tap text-slate-400 hover:text-slate-600 text-xl leading-none px-2 shrink-0">✕</button>
      </div>

      <div class="p-5 space-y-4">
        <span class="inline-block text-xs font-bold px-3 py-1 rounded-full" :class="status.cls">{{ status.cor }} {{ status.label }}</span>

        <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          <p><span class="text-slate-400">Modelo:</span> <span class="font-medium text-slate-800">{{ instrumento.modelo || '-' }}</span></p>
          <p><span class="text-slate-400">Nº Série:</span> <span class="font-medium text-slate-800">{{ instrumento.numeroSerie || '-' }}</span></p>
          <p><span class="text-slate-400">Capacidade:</span> <span class="font-medium text-slate-800">{{ instrumento.capacidade || '-' }}</span></p>
          <p><span class="text-slate-400">Tolerância:</span> <span class="font-medium text-slate-800">{{ instrumento.tolerancia || '-' }}</span></p>
          <p><span class="text-slate-400">Setor:</span> <span class="font-medium text-slate-800">{{ instrumento.area || '-' }}</span></p>
          <p><span class="text-slate-400">Responsável:</span> <span class="font-medium text-slate-800">{{ instrumento.responsavel || '-' }}</span></p>
          <p><span class="text-slate-400">Certificado RBC:</span> <span class="font-medium text-slate-800">{{ instrumento.certificadoRbc || '-' }}</span></p>
          <p><span class="text-slate-400">Laboratório:</span> <span class="font-medium text-slate-800">{{ instrumento.laboratorio || '-' }}</span></p>
          <p><span class="text-slate-400">Vencimento Calibração:</span> <span class="font-medium text-slate-800">{{ formatarData(instrumento.dataValidade) }}</span></p>
          <p><span class="text-slate-400">Vencimento Checagem:</span> <span class="font-medium text-slate-800">{{ instrumento.vencimentoChecagem ? formatarData(instrumento.vencimentoChecagem) : '-' }}</span></p>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button @click="$emit('ver-laudo')" class="btn-tap flex items-center justify-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 rounded-lg text-xs">
            📄 Visualizar Laudo
          </button>
          <button @click="$emit('gerar-qr')" class="btn-tap flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-lg text-xs">
            📱 Etiqueta & QR
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
   MÓDULO CALIBRAÇÃO & MEDIÇÃO (aba Calibracoes_Controle — RSG-7601-02)
   ========================================================================== */
const CalibracaoModule = {
  props: { user: Object, abrirId: { type: String, default: null } },
  emits: ["go-home", "abrir-id-consumido"],
  components: { FichaInstrumentoModal, EtiquetaQrModal, LaudoCalibracaoModal, ChecagemModal },
  setup(props, { emit }) {
    const loading = ref(true);
    const erro = ref("");
    const lista = ref([]);
    const salvando = ref(false);
    const filtroArea = ref("todas");
    const filtroStatus = ref("todos");
    const filtroBusca = ref("");
    const formAberto = ref(false);
    const editandoId = ref(null);
    // TAG do instrumento capturada no momento em que o modal de edição é
    // aberto — usada para localizar a linha a atualizar (ver salvar()),
    // porque o "id" de cada item não é estável: sem coluna própria de ID na
    // planilha, normalizeCalibracao gera um uid() novo a cada carregar(),
    // então um reload em segundo plano entre abrir e salvar fazia o find por
    // id falhar e duplicar o instrumento (unshift de uma linha nova).
    const tagOriginalEdicao = ref("");

    const fichaAberta = ref(false);
    const instrumentoFicha = ref(null);
    const qrAberto = ref(false);
    const instrumentoQR = ref(null);
    const laudoAberto = ref(false);
    const instrumentoLaudo = ref(null);
    const checagemAberta = ref(false);
    const instrumentoChecagem = ref(null);
    const salvandoChecagem = ref(false);

    // ===== Gestão Administrativa (Perfil Administrador): excluir instrumento =====
    const souAdmin = computed(() => isAdmin(props.user));
    const excluirInstrumentoAlvo = ref(null);
    const excluindoInstrumento = ref(false);
    function pedirExclusaoInstrumento(c) { excluirInstrumentoAlvo.value = c; }
    function cancelarExclusaoInstrumento() { excluirInstrumentoAlvo.value = null; }
    async function confirmarExclusaoInstrumento() {
      const alvo = excluirInstrumentoAlvo.value;
      if (!alvo) return;
      excluindoInstrumento.value = true;
      try {
        const tagAlvo = (alvo.tag || "").toString().trim();
        const resp = await deleteCalibracaoApi(tagAlvo);
        if (resp && resp.status === "error") throw new Error(resp.message || "Erro ao excluir.");
        lista.value = lista.value.filter(c => (c.tag || "").toString().trim().toUpperCase() !== tagAlvo.toUpperCase());
        pushToast("Equipamento excluído da base com sucesso!", "success");
        excluirInstrumentoAlvo.value = null;
      } catch (err) {
        console.error(err);
        pushToast("Erro ao excluir o equipamento. Tente novamente.", "error");
      } finally {
        excluindoInstrumento.value = false;
      }
    }

    const formVazio = () => ({
      tag: "", equipamento: "", modelo: "", capacidade: "", tolerancia: "", numeroSerie: "",
      area: AREAS[0], responsavel: "", certificadoRbc: "", laboratorio: "",
      dataCalibracao: "", dataValidade: "", urlCertificado: "",
      emCalibracao: false, dataEnvioLaboratorio: "", previsaoRetorno: "",
      dataChecagem: "", vencimentoChecagem: "",
    });
    const form = reactive(formVazio());

    // Se a tela foi aberta via QR Code (deep link #calibracao/<id>, ver
    // App.setup), assim que a lista carrega abre direto a ficha completa do
    // instrumento escaneado.
    function aplicarDeepLinkPendente() {
      if (!props.abrirId) return;
      const alvo = lista.value.find(c => c.id === props.abrirId || c.tag === props.abrirId);
      if (alvo) abrirFicha(alvo);
      emit("abrir-id-consumido");
    }

    async function carregar() {
      loading.value = true;
      erro.value = "";
      try {
        const data = await getInitialData();
        const raw = data.calibracoes || data.Calibracoes_Controle || data.calibracoesControle
          || (data.data && (data.data.calibracoes || data.data.calibracoesControle)) || [];
        lista.value = (Array.isArray(raw) ? raw : []).map(normalizeCalibracao);
      } catch (err) {
        console.error(err);
        erro.value = "Não foi possível carregar os registros de Calibração & Medição.";
      } finally {
        loading.value = false;
      }
      aplicarDeepLinkPendente();
    }
    onMounted(carregar);
    onMounted(() => carregarCadastrosMestres());

    const areas = computed(() => unirAreas(lista.value));
    // Sugestões (datalist) vindas da Central de Cadastros Mestres para os
    // campos livres de Instrumento/Responsável/Laboratório — continuam sendo
    // <input> de texto (não <select>) para não travar o preenchimento quando
    // o cadastro ainda estiver vazio ou o valor salvo não bater com nenhuma
    // opção cadastrada.
    const sugestoesInstrumento = computed(() => nomesCadastro("tiposEquipamento"));
    const sugestoesResponsavel = computed(() => nomesCadastro("pessoas"));
    const sugestoesLaboratorio = computed(() => nomesCadastro("fornecedores"));

    const listaComStatus = computed(() => lista.value.map(c => ({ ...c, status: statusInstrumentoCalibracao(c) })));

    const resumo = computed(() => {
      const r = { noPrazo: 0, atencao: 0, vencidos: 0, emCalibracao: 0 };
      listaComStatus.value.forEach(c => {
        if (c.status.label === "No Prazo") r.noPrazo++;
        else if (c.status.label === "Atenção") r.atencao++;
        else if (c.status.label === "Vencido") r.vencidos++;
        else if (c.status.label === "Em Calibração") r.emCalibracao++;
      });
      return r;
    });

    const listaFiltrada = computed(() => {
      // textoSeguro em cada campo: mesmo já normalizados por normalizeCalibracao,
      // uma segunda blindagem aqui não custa nada e evita que qualquer campo
      // não-string (ex.: TAG numérica tipo 25251329) quebre a busca com
      // "toLowerCase is not a function".
      const termo = textoSeguro(filtroBusca.value).toLowerCase();
      return listaComStatus.value
        .filter(c => filtroArea.value === "todas" || normalizarTexto(c.area) === normalizarTexto(filtroArea.value))
        .filter(c => filtroStatus.value === "todos" || c.status.label === filtroStatus.value)
        .filter(c => !termo
          || textoSeguro(c.equipamento).toLowerCase().includes(termo)
          || textoSeguro(c.tag).toLowerCase().includes(termo)
          || textoSeguro(c.certificadoRbc).toLowerCase().includes(termo)
          || textoSeguro(c.area).toLowerCase().includes(termo)
          || textoSeguro(c.responsavel).toLowerCase().includes(termo)
          || textoSeguro(c.numeroSerie).toLowerCase().includes(termo))
        .sort((a, b) => (a.status.diffDias ?? Infinity) - (b.status.diffDias ?? Infinity));
    });

    function abrirNovo() {
      Object.assign(form, formVazio());
      editandoId.value = null;
      tagOriginalEdicao.value = "";
      formAberto.value = true;
    }
    function abrirEdicao(c) {
      Object.assign(form, {
        tag: c.tag, equipamento: c.equipamento, modelo: c.modelo, capacidade: c.capacidade,
        tolerancia: c.tolerancia, numeroSerie: c.numeroSerie, area: c.area, responsavel: c.responsavel,
        certificadoRbc: c.certificadoRbc, laboratorio: c.laboratorio,
        dataCalibracao: c.dataCalibracao, dataValidade: c.dataValidade, urlCertificado: c.urlCertificado,
        emCalibracao: !!c.emCalibracao, dataEnvioLaboratorio: c.dataEnvioLaboratorio, previsaoRetorno: c.previsaoRetorno,
        dataChecagem: c.dataChecagem, vencimentoChecagem: c.vencimentoChecagem,
      });
      editandoId.value = c.id;
      tagOriginalEdicao.value = textoSeguro(c.tag);
      formAberto.value = true;
      fecharFicha();
    }
    function fecharForm() {
      formAberto.value = false;
    }

    async function salvar() {
      if (!form.equipamento.trim()) {
        pushToast("Informe o nome do instrumento.", "error");
        return;
      }
      if (!form.dataValidade) {
        pushToast("Informe a data de validade da calibração.", "error");
        return;
      }
      salvando.value = true;
      try {
        const id = editandoId.value || "CAL-" + Date.now();
        // TAG (maiúsculo) é enviado junto com "tag" porque o identificador
        // real usado pelo Apps Script para localizar a linha na planilha é a
        // própria TAG do instrumento (não há coluna de ID estável).
        const t = v => (v ?? "").toString().trim();
        const tagValor = t(form.tag);
        // tagOriginal identifica a linha a atualizar mesmo que o usuário
        // tenha renomeado a TAG dentro do próprio formulário — sem isso, o
        // backend tentaria localizar a linha pela TAG NOVA (que ainda não
        // existe na planilha) e não encontraria nada para atualizar.
        const tagOriginalValor = tagOriginalEdicao.value || tagValor;
        // Os nomes internos do formulário (equipamento, area, tolerancia,
        // responsavel, certificadoRbc, laboratorio, urlCertificado,
        // dataValidade) nunca bateram com os parâmetros que o Apps Script
        // realmente lê (descricao, setor, criterio, operador, certificadoRBC,
        // obsChecagem, linkLaudoPDF, vencimentoCalibracao) — essa era a causa
        // raiz real do "salva e reverte sozinho": a checagem de erro abaixo
        // não pegava porque o backend confirmava sucesso normalmente
        // (encontrava a linha pela TAG), só que gravava as colunas certas
        // com valores vazios/indefinidos por não reconhecer os parâmetros.
        const statusCalculado = statusValidadeCalibracao(form.dataValidade).label;
        const resp = await saveCalibracaoApi({
          id, tag: tagValor, TAG: tagValor, tagOriginal: tagOriginalValor,
          descricao: t(form.equipamento), marcaModelo: t(form.modelo), capacidade: t(form.capacidade),
          criterio: t(form.tolerancia), numeroSerie: t(form.numeroSerie), setor: t(form.area),
          operador: t(form.responsavel), certificadoRBC: t(form.certificadoRbc), obsChecagem: t(form.laboratorio),
          linkLaudoPDF: t(form.urlCertificado), dataCalibracao: form.dataCalibracao,
          vencimentoCalibracao: form.dataValidade, status: statusCalculado,
          emCalibracao: form.emCalibracao, dataEnvioLaboratorio: form.dataEnvioLaboratorio,
          previsaoRetorno: form.previsaoRetorno, dataChecagem: form.dataChecagem,
        });
        if (resp && resp.status === "error") throw new Error(resp.message || "Erro ao salvar.");
        const atualizado = normalizeCalibracao({
          ID: id, TAG: form.tag, Instrumento: form.equipamento, Modelo: form.modelo,
          Capacidade: form.capacidade, Tolerancia: form.tolerancia, Numero_Serie: form.numeroSerie,
          Area: form.area, Responsavel: form.responsavel, Certificado_RBC: form.certificadoRbc,
          Laboratorio: form.laboratorio, Data_Calibracao: form.dataCalibracao, Data_Validade: form.dataValidade,
          URL_Certificado: form.urlCertificado, Em_Calibracao: form.emCalibracao,
          Data_Envio_Laboratorio: form.dataEnvioLaboratorio, Previsao_Retorno: form.previsaoRetorno,
          Data_Checagem: form.dataChecagem,
          // Sem isso, o objeto otimista sempre caía no default de
          // normalizeCalibracao ("Prazo - Mais de 45 dias"), piscando um
          // status errado no badge até o próximo carregar() corrigir.
          Status: statusCalculado,
        });
        // Localizar pela TAG (normalizada, maiúscula e sem espaços), não
        // pelo id: o id de um item sem coluna própria de ID na planilha é
        // regerado a cada carregar(), então comparar por id podia falhar
        // (achando -1 e duplicando via unshift) se um reload em segundo
        // plano de um salvamento anterior tivesse acabado de trocar os ids
        // em memória entre o usuário abrir e confirmar esta edição.
        const normalizarChave = v => textoSeguro(v).toUpperCase().replace(/\s+/g, "");
        const idx = lista.value.findIndex(c => normalizarChave(c.tag) === normalizarChave(tagOriginalValor));
        if (idx === -1) lista.value.unshift(atualizado);
        else lista.value[idx] = atualizado;
        pushToast(editandoId.value ? "Calibração atualizada." : "Instrumento cadastrado.", "success");
        formAberto.value = false;
        setTimeout(() => carregar(), 3000);
      } catch (err) {
        console.error(err);
        pushToast("Erro ao salvar. Tente novamente.", "error");
      } finally {
        salvando.value = false;
      }
    }

    function abrirFicha(c) { instrumentoFicha.value = c; fichaAberta.value = true; }
    function fecharFicha() { fichaAberta.value = false; }
    function abrirQR(c) { instrumentoQR.value = c; qrAberto.value = true; }
    function fecharQR() { qrAberto.value = false; }
    function abrirLaudo(c) { instrumentoLaudo.value = c; laudoAberto.value = true; }
    function fecharLaudo() { laudoAberto.value = false; }
    function abrirChecagem(c) { instrumentoChecagem.value = c; checagemAberta.value = true; }
    function fecharChecagem() { checagemAberta.value = false; }

    async function confirmarChecagem(operador) {
      const item = instrumentoChecagem.value;
      if (!item) return;
      salvandoChecagem.value = true;
      try {
        const hoje = formatarDataISO(new Date());
        const vencimento = calcularVencimentoChecagem(hoje);
        const tagValor = textoSeguro(item.TAG || item.tag || item.codigo);
        // Mesmos nomes de parâmetro corrigidos de salvar() — ver comentário lá.
        const resp = await saveCalibracaoApi({
          id: item.id, tag: tagValor, TAG: tagValor, tagOriginal: tagValor,
          descricao: item.equipamento, marcaModelo: item.modelo, capacidade: item.capacidade,
          criterio: item.tolerancia, numeroSerie: item.numeroSerie, setor: item.area,
          operador: item.responsavel, certificadoRBC: item.certificadoRbc, obsChecagem: item.laboratorio,
          linkLaudoPDF: item.urlCertificado, dataCalibracao: item.dataCalibracao,
          vencimentoCalibracao: item.dataValidade, status: statusValidadeCalibracao(item.dataValidade).label,
          emCalibracao: item.emCalibracao, dataEnvioLaboratorio: item.dataEnvioLaboratorio,
          previsaoRetorno: item.previsaoRetorno,
          dataChecagem: hoje, vencimentoChecagem: vencimento, operadorChecagem: operador,
        });
        if (resp && resp.status === "error") throw new Error(resp.message || "Erro ao registrar a checagem.");
        // Localizar pela TAG, não pelo id (ver mesmo comentário em salvar()).
        const normalizarChave = v => textoSeguro(v).toUpperCase().replace(/\s+/g, "");
        const idx = lista.value.findIndex(c => normalizarChave(c.tag) === normalizarChave(tagValor));
        if (idx !== -1) lista.value[idx] = { ...lista.value[idx], dataChecagem: hoje, vencimentoChecagem: vencimento };
        pushToast("Checagem semestral registrada com sucesso.", "success");
        fecharChecagem();
      } catch (err) {
        console.error(err);
        pushToast("Erro ao registrar a checagem. Tente novamente.", "error");
      } finally {
        salvandoChecagem.value = false;
      }
    }

    function formatarData(v) {
      const d = parseDataHoraLocal(v);
      return d ? d.toLocaleDateString("pt-BR") : "-";
    }

    return {
      loading, erro, listaFiltrada, resumo, areas, filtroArea, filtroStatus, filtroBusca,
      formAberto, form, editandoId, salvando, abrirNovo, abrirEdicao, fecharForm, salvar, formatarData,
      nomeInstrumentoModelo, capacidadeTolerancia,
      sugestoesInstrumento, sugestoesResponsavel, sugestoesLaboratorio,
      fichaAberta, instrumentoFicha, abrirFicha, fecharFicha,
      qrAberto, instrumentoQR, abrirQR, fecharQR,
      laudoAberto, instrumentoLaudo, abrirLaudo, fecharLaudo,
      checagemAberta, instrumentoChecagem, abrirChecagem, fecharChecagem, confirmarChecagem, salvandoChecagem,
      souAdmin, excluirInstrumentoAlvo, excluindoInstrumento,
      pedirExclusaoInstrumento, cancelarExclusaoInstrumento, confirmarExclusaoInstrumento,
      usuarioNome: (props.user && props.user.nome) || "",
    };
  },
  template: `
  <div class="space-y-5">
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      <div class="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-2.5">
        <span class="text-2xl">🟢</span>
        <div class="min-w-0">
          <p class="text-2xl font-extrabold text-slate-800 leading-none">{{ resumo.noPrazo }}</p>
          <p class="text-[11px] text-slate-500 font-semibold mt-0.5">No Prazo <span class="text-slate-400 font-normal">(&gt; 45d)</span></p>
        </div>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-2.5">
        <span class="text-2xl">🟡</span>
        <div class="min-w-0">
          <p class="text-2xl font-extrabold text-slate-800 leading-none">{{ resumo.atencao }}</p>
          <p class="text-[11px] text-slate-500 font-semibold mt-0.5">Atenção <span class="text-slate-400 font-normal">(&le; 45d)</span></p>
        </div>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-2.5">
        <span class="text-2xl">🔴</span>
        <div class="min-w-0">
          <p class="text-2xl font-extrabold text-slate-800 leading-none">{{ resumo.vencidos }}</p>
          <p class="text-[11px] text-slate-500 font-semibold mt-0.5">Vencidos</p>
        </div>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-2.5">
        <span class="text-2xl">🟠</span>
        <div class="min-w-0">
          <p class="text-2xl font-extrabold text-slate-800 leading-none">{{ resumo.emCalibracao }}</p>
          <p class="text-[11px] text-slate-500 font-semibold mt-0.5">Em Calibração</p>
        </div>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
      <div class="grid grid-cols-1 sm:grid-cols-5 gap-2">
        <input v-model="filtroBusca" type="text" placeholder="Buscar TAG, instrumento ou certificado..."
          class="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        <select v-model="filtroArea" class="rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
          <option value="todas">Setor: Todos</option>
          <option v-for="a in areas" :key="a" :value="a">{{ a }}</option>
        </select>
        <select v-model="filtroStatus" class="rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
          <option value="todos">Status: Todos</option>
          <option value="No Prazo">🟢 No Prazo</option>
          <option value="Atenção">🟡 Atenção</option>
          <option value="Vencido">🔴 Vencido</option>
          <option value="Em Calibração">🟠 Em Calibração</option>
        </select>
        <button @click="abrirNovo" class="btn-tap flex items-center justify-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg text-sm py-2">
          + Novo Cadastro
        </button>
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-12 text-slate-400">
      <span class="spinner !border-slate-300 !border-t-sky-600"></span>
    </div>
    <div v-else-if="erro" class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{{ erro }}</div>
    <div v-else-if="listaFiltrada.length === 0" class="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-400">
      Nenhum instrumento encontrado para os filtros selecionados.
    </div>
    <div v-else class="bg-white rounded-xl border border-slate-200 overflow-x-auto">
      <table class="text-xs w-full border-collapse">
        <thead>
          <tr class="bg-slate-800 text-white">
            <th class="px-3 py-2 text-left whitespace-nowrap">TAG</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">Instrumento / Modelo</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">Capacidade &amp; Tolerância</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">Nº Série</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">Certificado RBC</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">Setor &amp; Responsável</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">Vencimento Calibração</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">Vencimento Checagem (180d)</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">Status</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in listaFiltrada" :key="c.id" class="border-t border-slate-100 hover:bg-slate-50">
            <td class="px-3 py-2">
              <button @click="abrirFicha(c)" class="btn-tap font-mono font-bold text-sky-700 hover:underline whitespace-nowrap">{{ c.tag || "-" }}</button>
            </td>
            <td class="px-3 py-2 min-w-[140px]">
              <button @click="abrirFicha(c)" class="btn-tap text-left block font-semibold text-slate-800">{{ nomeInstrumentoModelo(c) }}</button>
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-slate-600">{{ capacidadeTolerancia(c) }}</td>
            <td class="px-3 py-2 whitespace-nowrap text-slate-600">{{ c.numeroSerie || "-" }}</td>
            <td class="px-3 py-2 whitespace-nowrap text-slate-600">{{ c.certificadoRbc || "-" }}</td>
            <td class="px-3 py-2 min-w-[120px]">
              <p class="text-slate-700">{{ c.area || "-" }}</p>
              <p class="text-slate-400">{{ c.responsavel || "-" }}</p>
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-slate-600">{{ formatarData(c.dataValidade) }}</td>
            <td class="px-3 py-2 whitespace-nowrap text-slate-600">{{ c.vencimentoChecagem ? formatarData(c.vencimentoChecagem) : "-" }}</td>
            <td class="px-3 py-2">
              <span class="text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap" :class="c.status.cls">{{ c.status.cor }} {{ c.status.label }}</span>
            </td>
            <td class="px-3 py-2">
              <div class="flex items-center gap-1">
                <button @click="abrirQR(c)" title="Gerar Etiqueta & QR Code" class="btn-tap w-7 h-7 flex items-center justify-center rounded-md bg-slate-100 hover:bg-slate-200">📱</button>
                <button @click="abrirLaudo(c)" title="Visualizar Laudo / Certificado RBC" class="btn-tap w-7 h-7 flex items-center justify-center rounded-md bg-slate-100 hover:bg-slate-200">📄</button>
                <button @click="abrirChecagem(c)" title="Registrar Checagem Semestral (180 dias)" class="btn-tap w-7 h-7 flex items-center justify-center rounded-md bg-slate-100 hover:bg-slate-200">✅</button>
                <button @click="abrirEdicao(c)" title="Editar Instrumento" class="btn-tap w-7 h-7 flex items-center justify-center rounded-md bg-slate-100 hover:bg-slate-200">✏️</button>
                <button v-if="souAdmin" @click="pedirExclusaoInstrumento(c)" title="Excluir Instrumento" class="btn-tap w-7 h-7 flex items-center justify-center rounded-md bg-red-50 hover:bg-red-100 text-red-600">🗑️</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="formAberto" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4">
      <div class="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-slate-800">{{ editandoId ? "Editar Instrumento" : "Novo Cadastro de Instrumento" }}</h3>
          <button @click="fecharForm" class="btn-tap text-slate-400 hover:text-slate-600 text-xl leading-none px-2">✕</button>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">TAG</label>
            <input v-model="form.tag" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nº de Série</label>
            <input v-model="form.numeroSerie" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Instrumento *</label>
          <input v-model="form.equipamento" type="text" list="calib-sugestoes-instrumento" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          <datalist id="calib-sugestoes-instrumento">
            <option v-for="s in sugestoesInstrumento" :key="s" :value="s"></option>
          </datalist>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Modelo</label>
          <input v-model="form.modelo" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Capacidade</label>
            <input v-model="form.capacidade" type="text" placeholder="ex: 0-500kg" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Tolerância</label>
            <input v-model="form.tolerancia" type="text" placeholder="ex: ±0,5%" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Setor/Área</label>
            <select v-model="form.area" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option v-for="a in areas" :key="a" :value="a">{{ a }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Responsável</label>
            <input v-model="form.responsavel" type="text" list="calib-sugestoes-responsavel" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            <datalist id="calib-sugestoes-responsavel">
              <option v-for="s in sugestoesResponsavel" :key="s" :value="s"></option>
            </datalist>
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Número do Certificado RBC</label>
          <input v-model="form.certificadoRbc" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Laboratório</label>
          <input v-model="form.laboratorio" type="text" list="calib-sugestoes-laboratorio" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          <datalist id="calib-sugestoes-laboratorio">
            <option v-for="s in sugestoesLaboratorio" :key="s" :value="s"></option>
          </datalist>
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Link do Certificado (PDF)</label>
          <input v-model="form.urlCertificado" type="text" placeholder="https://..." class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Data da Calibração</label>
            <input v-model="form.dataCalibracao" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Validade *</label>
            <input v-model="form.dataValidade" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
        </div>

        <label class="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 cursor-pointer">
          <input v-model="form.emCalibracao" type="checkbox" class="w-4 h-4" />
          <span class="text-sm font-semibold text-orange-700">🟠 Instrumento em trânsito com o laboratório (Em Calibração)</span>
        </label>
        <div v-if="form.emCalibracao" class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Data de Envio</label>
            <input v-model="form.dataEnvioLaboratorio" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Previsão de Retorno</label>
            <input v-model="form.previsaoRetorno" type="date" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
        </div>

        <button @click="salvar" :disabled="salvando" class="btn-tap w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl text-sm">
          <span v-if="salvando" class="spinner"></span>
          <span>{{ salvando ? "Salvando..." : "Salvar" }}</span>
        </button>
      </div>
    </div>

    <ficha-instrumento-modal v-if="fichaAberta" :instrumento="instrumentoFicha" @fechar="fecharFicha"
      @gerar-qr="abrirQR(instrumentoFicha)" @ver-laudo="abrirLaudo(instrumentoFicha)"
      @registrar-checagem="abrirChecagem(instrumentoFicha)" @editar="abrirEdicao(instrumentoFicha)"></ficha-instrumento-modal>

    <etiqueta-qr-modal v-if="qrAberto" :instrumento="instrumentoQR" @fechar="fecharQR"></etiqueta-qr-modal>

    <laudo-calibracao-modal v-if="laudoAberto" :instrumento="instrumentoLaudo" @fechar="fecharLaudo"></laudo-calibracao-modal>

    <checagem-modal v-if="checagemAberta" :instrumento="instrumentoChecagem" :usuario-nome="usuarioNome" :salvando="salvandoChecagem"
      @fechar="fecharChecagem" @confirmar="confirmarChecagem"></checagem-modal>

    <!-- MODAL: confirmação de exclusão (Gestão Administrativa) -->
    <div v-if="excluirInstrumentoAlvo" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="cancelarExclusaoInstrumento">
      <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4">
        <h3 class="font-bold text-slate-800">Excluir equipamento?</h3>
        <p class="text-sm text-slate-600">Esta ação remove definitivamente o equipamento <span class="font-semibold">{{ excluirInstrumentoAlvo.tag }}</span> ({{ nomeInstrumentoModelo(excluirInstrumentoAlvo) }}) da base de dados. Não pode ser desfeita.</p>
        <div class="flex gap-2 pt-1">
          <button @click="cancelarExclusaoInstrumento" :disabled="excluindoInstrumento" class="btn-tap flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-semibold py-2.5 rounded-lg text-sm">
            Cancelar
          </button>
          <button @click="confirmarExclusaoInstrumento" :disabled="excluindoInstrumento" class="btn-tap flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm">
            <span v-if="excluindoInstrumento" class="spinner"></span>
            <span>{{ excluindoInstrumento ? "Excluindo..." : "🗑️ Excluir" }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>`
};
