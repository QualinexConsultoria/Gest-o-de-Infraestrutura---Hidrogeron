/* ==========================================================================
   js/modulos/rpnc.js — Registro de Desvios e Problemas / RNC-RPNC
   (RSG-8301-05)
   Normalização de RNC, detecção de reincidência, sugestão de causa raiz, e
   os componentes Vue: formulário em 3 etapas, laudo individual e Ata
   Executiva de Diretoria. Depende de js/api.js e do núcleo compartilhado
   do index.html.
   ========================================================================== */
/* ==========================================================================
   RNC / RPNC — Registro/Relatório de Produto Não Conforme (RSG-8301-05).
   Backend já expõe a coleção "rncs" e a ação "saveRPNC".
   ========================================================================== */
// Perfis que recebem o alerta automático de RNCs pendentes ao logar —
// funções de linha de frente/qualidade e liderança, não o Colaborador comum.
const PERFIS_ALERTA_RNC = ["Analista", "Coordenador", "Diretor", "Administrador"];
function podeVerAlertaRnc(user) {
  const perfil = normalizarTexto(user && user.perfil);
  return PERFIS_ALERTA_RNC.some(p => normalizarTexto(p) === perfil);
}
const ORIGENS_RNC = ["Teste Funcional", "Processo", "Fornecedor"];
const DISPOSICOES_RNC = ["Trocar", "Devolver", "Retrabalhar", "Aceitar sob Concessão"];
const METODOS_CAUSA_RNC = [
  { value: "5porques", label: "5 Porquês" },
  { value: "ishikawa", label: "Diagrama de Ishikawa 6M" },
  { value: "causaConsequencia", label: "Causa & Consequência" },
];
const CAMPOS_ISHIKAWA = [
  { value: "ishikawaMetodo", label: "Método" },
  { value: "ishikawaMaquina", label: "Máquina" },
  { value: "ishikawaMaoDeObra", label: "Mão de Obra" },
  { value: "ishikawaMaterial", label: "Material" },
  { value: "ishikawaMeioAmbiente", label: "Meio Ambiente" },
  { value: "ishikawaMedicao", label: "Medição" },
];
// Leitura tolerante do item vindo da aba "rncs" — cada campo aceita
// variações de nome de coluna, mesmo princípio já aplicado em
// normalizeCalibracao. Os campos de cada ferramenta de causa raiz (5
// Porquês, Ishikawa 6M, Causa & Consequência) são colunas simples (texto),
// nunca um blob serializado — os helpers de API deste app enviam o payload
// via querystring (URLSearchParams), que não preserva objetos aninhados.
// Cabeçalho real da planilha oficial (colunas com espaço/acento, ex.: "RNC
// Nº", "Cód. Produto") não batia com os nomes assumidos originalmente,
// deixando a tabela em branco mesmo com dados gravados — mesmo problema já
// visto (e corrigido) em normalizeCalibracao. Cada campo aceita a coluna
// literal da planilha, variações antigas/novas e minúsculas.
function normalizeRnc(r) {
  return {
    id: r["RNC Nº"] || r.RNC_No || r.ID || r.Id || r.id || r.idRNC || uid(),
    codigo: r["Cód. Produto"] || r.Cod_Produto || r.Codigo_Produto || r.CodigoProduto || r.codigo_produto || r.Codigo || r.codigo || r.codProduto || "",
    descricao: r["Descrição"] || r.Descricao_Produto || r.DescricaoProduto || r.descricao_produto || r.Descricao || r.descricao || "",
    setor: r["Setor/Departamento"] || r.Setor_Departamento || r.Setor || r.setor || "",
    op: r["Nº OP"] || r.No_OP || r.OP || r.Op || r.op || r.numOP || "",
    quantidadeNc: parseNumeroFlexivel(r["Qtde Não Conforme"] ?? r.Qtde_NC ?? r.Quantidade_NC ?? r.QuantidadeNC ?? r.quantidade_nc ?? r.quantidadeNc ?? r.qtd ?? r.quantidade ?? 0),
    quantidadeRecebida: Number(r.Quantidade_Recebida ?? r.QuantidadeRecebida ?? r.quantidade_recebida ?? r.quantidadeRecebida ?? 0) || 0,
    origem: r["Origem da Ocorrência"] || r.Origem_Ocorrencia || r.Origem || r.origem || "",
    descricaoDefeito: r.Descricao_Defeito || r.DescricaoDefeito || r.descricao_defeito || r.descricaoDefeito || "",
    dataAbertura: r.Data_Abertura || r.DataAbertura || r.data_abertura || r.dataAbertura || "",
    analista: r["Responsável pela Emissão"] || r.Responsavel_Emissao || r.emissor || r.Analista || r.analista || r.Responsavel || r.responsavel || "",
    reincidente: parseBooleanoFlexivel(r["Reincidente"] ?? r.Reincidente ?? r.reincidente),
    metodoCausa: r.Metodo_Causa || r.MetodoCausa || r.metodo_causa || r.metodoCausa || "5porques",
    porque1: r.Porque_1 || r.porque1 || "",
    porque2: r.Porque_2 || r.porque2 || "",
    porque3: r.Porque_3 || r.porque3 || "",
    porque4: r.Porque_4 || r.porque4 || "",
    porque5: r.Porque_5 || r.porque5 || "",
    ishikawaMetodo: r.Ishikawa_Metodo || r.ishikawaMetodo || "",
    ishikawaMaquina: r.Ishikawa_Maquina || r.ishikawaMaquina || "",
    ishikawaMaoDeObra: r.Ishikawa_MaoDeObra || r.ishikawaMaoDeObra || "",
    ishikawaMaterial: r.Ishikawa_Material || r.ishikawaMaterial || "",
    ishikawaMeioAmbiente: r.Ishikawa_MeioAmbiente || r.ishikawaMeioAmbiente || "",
    ishikawaMedicao: r.Ishikawa_Medicao || r.ishikawaMedicao || "",
    causaConsequenciaCausa: r.Causa_Consequencia_Causa || r.causaConsequenciaCausa || "",
    causaConsequenciaConsequencia: r.Causa_Consequencia_Consequencia || r.causaConsequenciaConsequencia || "",
    causaRaiz: r["Causa da Não Conformidade"] || r.Causa_Final || r.Causa_Raiz || r.CausaRaiz || r.causa_raiz || r.causaRaiz || r.causa || "",
    disposicao: r["Disposição para o item não conforme"] || r.Disposicao || r.disposicao || "",
    custoUnitario: parseNumeroFlexivel(r["Custo Produto"] ?? r.Custo_Unitario ?? r.CustoUnitario ?? r.custo_unitario ?? r.custoUnitario ?? r.custo ?? 0),
    reinspecao: r.Reinspecao || r.reinspecao || "",
    racpNecessario: parseBooleanoFlexivel(r.RACP_Necessario ?? r.RacpNecessario ?? r.racpNecessario),
    mapeamentoRisco: parseBooleanoFlexivel(r.Mapeamento_Risco ?? r.MapeamentoRisco ?? r.mapeamentoRisco),
    // Status textual da própria planilha — usado como fonte da verdade do
    // badge (ver statusRnc), no mesmo espírito de classificarStatusPlanilha
    // em Calibração: nunca recalculado por completude de campos no front-end.
    statusBruto: (r["STATUS"] || r.Status || r.status || "CONCLUÍDO").toString().trim(),
  };
}
function prejuizoRnc(r) {
  return (Number(r && r.quantidadeNc) || 0) * (Number(r && r.custoUnitario) || 0);
}
// Badge de status: espelha o texto da coluna Status da planilha em vez de
// recalcular por completude dos campos — "CONCLUÍDO" (ou variação de
// acento/caixa) é verde; "EM ANÁLISE", vazio ou qualquer outro valor é
// âmbar, nunca ficando sem cor.
function statusRnc(r) {
  const bruto = normalizarTexto((r && r.statusBruto) || "");
  if (bruto.includes("concluido")) return { label: "Concluído", cor: "🟢", cls: "bg-emerald-100 text-emerald-800" };
  return { label: "Em Análise", cor: "🟡", cls: "bg-amber-100 text-amber-800" };
}
// Reincidência: mesmo código de produto, ou descrição igual/uma contida na
// outra (contemComoTrecho já protege contra falso-positivo tipo "Bomba 1"
// vs "Bomba 10"). Ignora o próprio registro quando em edição.
function buscarRncsRelacionadas(lista, codigo, descricao, idIgnorar) {
  const codigoNorm = normalizarTexto(codigo);
  const descNorm = normalizarTexto(descricao);
  if (!codigoNorm && !descNorm) return [];
  return (lista || []).filter(r => {
    if (idIgnorar && r.id === idIgnorar) return false;
    const rCodigo = normalizarTexto(r.codigo);
    const rDesc = normalizarTexto(r.descricao);
    if (codigoNorm && rCodigo && rCodigo === codigoNorm) return true;
    if (descNorm && rDesc && (rDesc === descNorm || contemComoTrecho(rDesc, descNorm) || contemComoTrecho(descNorm, rDesc))) return true;
    return false;
  });
}
// Causas mais frequentes entre os registros relacionados (histórico real do
// mesmo item) — nunca uma lista fixa de exemplos: some vazio quando o
// histórico ainda não tem nenhuma causa raiz preenchida.
function sugerirCausasFrequentes(relacionadas) {
  const contagem = {};
  (relacionadas || []).forEach(r => {
    const c = (r.causaRaiz || "").trim();
    if (!c) return;
    contagem[c] = (contagem[c] || 0) + 1;
  });
  return Object.entries(contagem).sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 3);
}
/* ==========================================================================
   LAUDO INDIVIDUAL RNC / RPNC (RSG-8301-05)
   ========================================================================== */
const RSG_RNC_CODIGO = "RSG-8301-05";
const RSG_RNC_TITULO = "RSG-8301-05 - Relatório de Produto Não Conforme (RNC/RPNC)";
const LaudoRncModal = {
  props: { rnc: Object },
  emits: ["fechar"],
  setup(props) {
    const exportandoPdf = ref(false);
    const status = computed(() => statusRnc(props.rnc || {}));
    const prejuizo = computed(() => prejuizoRnc(props.rnc || {}));

    function formatarData(v) {
      const d = parseDataHoraLocal(v);
      return d ? d.toLocaleDateString("pt-BR") : "-";
    }
    function formatarMoeda(v) {
      return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }
    const metodoLabel = computed(() => {
      const m = METODOS_CAUSA_RNC.find(x => x.value === (props.rnc && props.rnc.metodoCausa));
      return m ? m.label : "-";
    });
    const porquesPreenchidos = computed(() => {
      const r = props.rnc || {};
      return [r.porque1, r.porque2, r.porque3, r.porque4, r.porque5]
        .map((p, i) => ({ n: i + 1, texto: p }))
        .filter(p => p.texto);
    });
    const ishikawaPreenchido = computed(() => {
      const r = props.rnc || {};
      return CAMPOS_ISHIKAWA.map(c => ({ label: c.label, texto: r[c.value] })).filter(c => c.texto);
    });

    const nomeArquivo = computed(() => {
      const r = props.rnc || {};
      return `${RSG_RNC_CODIGO}_${sanitizarNomeArquivo(r.codigo || r.id || "rnc")}.pdf`;
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

    return {
      status, prejuizo, formatarData, formatarMoeda, metodoLabel, porquesPreenchidos, ishikawaPreenchido,
      nomeArquivo, imprimir, exportarPDF, exportandoPdf, RSG_RNC_CODIGO, RSG_RNC_TITULO,
    };
  },
  template: `
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4">
    <div class="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] overflow-y-auto">
      <div class="no-print sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
        <h3 class="font-bold text-slate-800">Relatório de Não Conformidade</h3>
        <button @click="$emit('fechar')" class="btn-tap text-slate-400 hover:text-slate-600 text-xl leading-none px-2">✕</button>
      </div>

      <div id="laudo-imprimivel" class="p-5 space-y-4" v-if="rnc">
        <div class="border-b-2 border-slate-800 pb-3">
          <p class="text-xs font-bold text-sky-700 uppercase tracking-wide">Hidrogeron - Sistema de Gestão da Qualidade</p>
          <h2 class="text-lg font-extrabold text-slate-900 mt-0.5">{{ RSG_RNC_TITULO }}</h2>
          <div class="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-500">
            <p><span class="font-semibold text-slate-700">Protocolo:</span> #{{ rnc.id }}</p>
            <p><span class="font-semibold text-slate-700">Data de Abertura:</span> {{ formatarData(rnc.dataAbertura) }}</p>
          </div>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Identificação do Produto</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <p><span class="text-slate-400">Código:</span> <span class="font-medium text-slate-800">{{ rnc.codigo || '-' }}</span></p>
            <p><span class="text-slate-400">OP:</span> <span class="font-medium text-slate-800">{{ rnc.op || '-' }}</span></p>
            <p class="col-span-2"><span class="text-slate-400">Descrição:</span> <span class="font-medium text-slate-800">{{ rnc.descricao || '-' }}</span></p>
            <p><span class="text-slate-400">Setor/Departamento:</span> <span class="font-medium text-slate-800">{{ rnc.setor || '-' }}</span></p>
            <p><span class="text-slate-400">Qtd. Não Conforme:</span> <span class="font-medium text-slate-800">{{ rnc.quantidadeNc }}</span></p>
            <p><span class="text-slate-400">Qtd. Recebida:</span> <span class="font-medium text-slate-800">{{ rnc.quantidadeRecebida || '-' }}</span></p>
            <p><span class="text-slate-400">Origem:</span> <span class="font-medium text-slate-800">{{ rnc.origem || '-' }}</span></p>
            <p><span class="text-slate-400">Analista:</span> <span class="font-medium text-slate-800">{{ rnc.analista || '-' }}</span></p>
            <p class="col-span-2"><span class="text-slate-400">Descrição do Defeito:</span> <span class="font-medium text-slate-800">{{ rnc.descricaoDefeito || '-' }}</span></p>
          </div>
          <p v-if="rnc.reincidente" class="mt-2">
            <span class="text-xs font-bold px-3 py-1 rounded-full bg-orange-50 text-orange-700">🔁 Item Reincidente</span>
          </p>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Investigação de Causa Raiz — {{ metodoLabel }}</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-2 text-sm">
            <template v-if="rnc.metodoCausa === '5porques'">
              <p v-for="p in porquesPreenchidos" :key="p.n"><span class="text-slate-400">Por quê {{ p.n }}:</span> <span class="font-medium text-slate-800">{{ p.texto }}</span></p>
              <p v-if="!porquesPreenchidos.length" class="text-slate-400 italic">Nenhum "porquê" preenchido.</p>
            </template>
            <template v-else-if="rnc.metodoCausa === 'ishikawa'">
              <p v-for="c in ishikawaPreenchido" :key="c.label"><span class="text-slate-400">{{ c.label }}:</span> <span class="font-medium text-slate-800">{{ c.texto }}</span></p>
              <p v-if="!ishikawaPreenchido.length" class="text-slate-400 italic">Nenhuma causa do Ishikawa preenchida.</p>
            </template>
            <template v-else>
              <p><span class="text-slate-400">Causa:</span> <span class="font-medium text-slate-800">{{ rnc.causaConsequenciaCausa || '-' }}</span></p>
              <p><span class="text-slate-400">Consequência:</span> <span class="font-medium text-slate-800">{{ rnc.causaConsequenciaConsequencia || '-' }}</span></p>
            </template>
            <div class="border-t border-dashed border-slate-300 pt-2 mt-2">
              <p><span class="text-slate-400">Causa Raiz Consolidada:</span> <span class="font-medium text-slate-800">{{ rnc.causaRaiz || 'Não preenchida' }}</span></p>
            </div>
          </div>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Disposição & Impacto Financeiro</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <p><span class="text-slate-400">Disposição:</span> <span class="font-medium text-slate-800">{{ rnc.disposicao || '-' }}</span></p>
            <p><span class="text-slate-400">Custo Unitário:</span> <span class="font-medium text-slate-800">{{ formatarMoeda(rnc.custoUnitario) }}</span></p>
            <p class="col-span-2"><span class="text-slate-400">Prejuízo Total:</span> <span class="font-bold text-red-600">{{ formatarMoeda(prejuizo) }}</span></p>
          </div>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Fechamento & Gatilhos ISO 9001</h4>
          <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm"><span class="text-slate-400">Reinspeção:</span> <span class="font-medium text-slate-800">{{ rnc.reinspecao || '-' }}</span></p>
              <span class="text-xs font-bold px-3 py-1 rounded-full" :class="status.cls">{{ status.cor }} {{ status.label }}</span>
            </div>
            <p v-if="rnc.racpNecessario" class="text-xs font-bold text-red-700 bg-red-100 rounded-full px-3 py-1 inline-block mr-1">⚠️ RACP Necessária</p>
            <p v-if="rnc.mapeamentoRisco" class="text-xs font-bold text-indigo-700 bg-indigo-100 rounded-full px-3 py-1 inline-block">🗺️ Incluído no Mapeamento de Riscos</p>
          </div>
        </div>
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
   ATA EXECUTIVA DE REUNIÃO DA DIRETORIA — Análise Crítica do SGQ (RSG-8301-05)
   ========================================================================== */
const AtaDiretoriaModal = {
  props: { lista: { type: Array, default: () => [] } },
  emits: ["fechar"],
  setup(props) {
    const exportandoPdf = ref(false);
    const hojeFormatado = computed(() => new Date().toLocaleDateString("pt-BR"));

    const totalNCs = computed(() => props.lista.length);
    const custoTotal = computed(() => props.lista.reduce((s, r) => s + prejuizoRnc(r), 0));
    const comReinspecao = computed(() => props.lista.filter(r => r.reinspecao));
    const percentualReprovados = computed(() => {
      const total = comReinspecao.value.length;
      if (!total) return null;
      const reprovados = comReinspecao.value.filter(r => normalizarTexto(r.reinspecao) === normalizarTexto("Reprovado")).length;
      return Math.round((reprovados / total) * 100);
    });
    const racpsAbertas = computed(() => props.lista.filter(r => r.racpNecessario).length);
    const comCausaRaiz = computed(() => props.lista.filter(r => r.causaRaiz && r.causaRaiz.trim()));
    const emAnaliseCount = computed(() => props.lista.filter(r => (r.status ? r.status.label : statusRnc(r).label) === "Em Análise").length);
    const itensRiscoMapeamento = computed(() => props.lista.filter(r => r.mapeamentoRisco));
    const rncsFornecedor = computed(() => props.lista.filter(r => normalizarTexto(r.origem) === normalizarTexto("Fornecedor")));

    // Pareto: agrupa por código do produto (ou descrição, na ausência de
    // código), somando ocorrências e prejuízo — inteiramente derivado dos
    // dados reais carregados, nunca um exemplo fixo.
    const paretoItens = computed(() => {
      const grupos = {};
      props.lista.forEach(r => {
        const chave = (r.codigo || r.descricao || "Sem identificação").trim();
        if (!grupos[chave]) grupos[chave] = { chave, descricao: r.descricao, ocorrencias: 0, custo: 0 };
        grupos[chave].ocorrencias++;
        grupos[chave].custo += prejuizoRnc(r);
      });
      return Object.values(grupos).sort((a, b) => b.ocorrencias - a.ocorrencias).slice(0, 5);
    });
    const achadosCriticos = computed(() => paretoItens.value.filter(p => p.ocorrencias >= 2));

    function formatarMoeda(v) {
      return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }
    function formatarPercentual(v) {
      return v === null || v === undefined ? "—" : v + "%";
    }

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
            docFinal.save(`RSG-8301-05_Ata-Diretoria_${formatarDataISO(new Date())}.pdf`);
            exportandoPdf.value = false;
          },
        });
      } catch (err) {
        console.error(err);
        pushToast("Erro ao gerar o PDF da ata.", "error");
        exportandoPdf.value = false;
      }
    }

    return {
      hojeFormatado, totalNCs, custoTotal, percentualReprovados, racpsAbertas,
      comCausaRaiz, emAnaliseCount, itensRiscoMapeamento, rncsFornecedor,
      paretoItens, achadosCriticos, formatarMoeda, formatarPercentual,
      imprimir, exportarPDF, exportandoPdf,
    };
  },
  template: `
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4">
    <div class="bg-white w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[95vh] overflow-y-auto">
      <div class="no-print sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
        <h3 class="font-bold text-slate-800">📑 Ata de Reunião da Diretoria — Análise Crítica do SGQ</h3>
        <button @click="$emit('fechar')" class="btn-tap text-slate-400 hover:text-slate-600 text-xl leading-none px-2">✕</button>
      </div>

      <div id="laudo-imprimivel" class="p-5 space-y-5">
        <div class="border-b-2 border-slate-800 pb-3">
          <p class="text-xs font-bold text-sky-700 uppercase tracking-wide">Hidrogeron - Sistema de Gestão da Qualidade</p>
          <h2 class="text-lg font-extrabold text-slate-900 mt-0.5">RSG-8301-05 - Análise Crítica pela Direção</h2>
          <p class="text-xs text-slate-500 mt-1">Período Analisado: todos os registros carregados até {{ hojeFormatado }} · Documento-Base: RSG-8301-05</p>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Indicadores Consolidados</h4>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
              <p class="text-2xl font-extrabold text-slate-700">{{ totalNCs }}</p>
              <p class="text-[10px] text-slate-500 uppercase font-semibold mt-0.5">Total de NCs</p>
            </div>
            <div class="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
              <p class="text-xl font-extrabold text-red-600">{{ formatarMoeda(custoTotal) }}</p>
              <p class="text-[10px] text-slate-500 uppercase font-semibold mt-0.5">Custo Total de Perdas</p>
            </div>
            <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
              <p class="text-2xl font-extrabold text-amber-600">{{ formatarPercentual(percentualReprovados) }}</p>
              <p class="text-[10px] text-slate-500 uppercase font-semibold mt-0.5">% Reprovados na Reinspeção</p>
            </div>
            <div class="rounded-lg border border-orange-200 bg-orange-50 p-3 text-center">
              <p class="text-2xl font-extrabold text-orange-600">{{ racpsAbertas }}</p>
              <p class="text-[10px] text-slate-500 uppercase font-semibold mt-0.5">RACPs Abertas</p>
            </div>
          </div>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Pareto & Achados Críticos</h4>
          <div v-if="paretoItens.length === 0" class="text-xs text-slate-400 italic">Nenhum registro de RNC no período analisado.</div>
          <table v-else class="text-xs w-full border-collapse">
            <thead>
              <tr class="bg-slate-800 text-white">
                <th class="px-2 py-1.5 text-left">Item / Código</th>
                <th class="px-2 py-1.5 text-left">Ocorrências</th>
                <th class="px-2 py-1.5 text-left">Custo Acumulado</th>
                <th class="px-2 py-1.5 text-left">Situação</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in paretoItens" :key="p.chave" class="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="px-2 py-1.5">{{ p.chave }}<span v-if="p.descricao" class="text-slate-400"> — {{ p.descricao }}</span></td>
                <td class="px-2 py-1.5">{{ p.ocorrencias }}</td>
                <td class="px-2 py-1.5">{{ formatarMoeda(p.custo) }}</td>
                <td class="px-2 py-1.5">
                  <span v-if="p.ocorrencias >= 2" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">🔴 Crônico</span>
                  <span v-else class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Pontual</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="achadosCriticos.length" class="text-xs text-red-700 mt-2">⚠️ {{ achadosCriticos.length }} item(ns) com recorrência crônica (2 ou mais ocorrências) requerem ação corretiva prioritária.</p>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Análise Crítica perante a ISO 9001</h4>
          <div class="space-y-2 text-xs text-slate-700 bg-slate-50 rounded-lg border border-slate-200 p-3">
            <p><span class="font-bold">10.2 Ação Corretiva:</span> {{ totalNCs }} não conformidade(s) registrada(s); {{ comCausaRaiz.length }} com causa raiz identificada e {{ emAnaliseCount }} ainda em investigação.</p>
            <p><span class="font-bold">6.1 Ações para Riscos e Oportunidades:</span> {{ itensRiscoMapeamento.length }} item(ns) sinalizado(s) para inclusão na Matriz de Riscos.</p>
            <p><span class="font-bold">8.7 / 8.4 Saídas Não Conformes / Fornecedores:</span> {{ rncsFornecedor.length }} ocorrência(s) com origem em Fornecedor.</p>
            <p><span class="font-bold">9.1.3 Análise de Dados:</span> base de {{ totalNCs }} registro(s) analisado(s), com {{ formatarPercentual(percentualReprovados) }} de reprovação na reinspeção.</p>
          </div>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Matriz de Riscos — Itens Sinalizados</h4>
          <div v-if="itensRiscoMapeamento.length === 0" class="text-xs text-slate-400 italic">Nenhum item sinalizado para o Mapeamento de Riscos no período.</div>
          <table v-else class="text-xs w-full border-collapse">
            <thead>
              <tr class="bg-slate-800 text-white">
                <th class="px-2 py-1.5 text-left">Código</th>
                <th class="px-2 py-1.5 text-left">Descrição</th>
                <th class="px-2 py-1.5 text-left">Origem</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in itensRiscoMapeamento" :key="r.id" class="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="px-2 py-1.5">{{ r.codigo || '-' }}</td>
                <td class="px-2 py-1.5">{{ r.descricao || '-' }}</td>
                <td class="px-2 py-1.5">{{ r.origem || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Oportunidades e Recomendações</h4>
          <ul class="text-xs text-slate-700 list-disc pl-4 space-y-1">
            <li v-if="achadosCriticos.length">Priorizar investigação aprofundada (8D/Ishikawa) dos {{ achadosCriticos.length }} item(ns) crônico(s) apontados no Pareto acima.</li>
            <li v-if="rncsFornecedor.length">Avaliar auditoria ou reavaliação dos fornecedores responsáveis pelas {{ rncsFornecedor.length }} ocorrência(s) de origem externa.</li>
            <li v-if="emAnaliseCount">Concluir a investigação de causa raiz das {{ emAnaliseCount }} RNC(s) ainda em análise, dentro do prazo definido pelo SGQ.</li>
            <li v-if="!achadosCriticos.length && !rncsFornecedor.length && !emAnaliseCount">Nenhuma recomendação crítica adicional identificada com base nos dados carregados.</li>
          </ul>
        </div>

        <div class="pt-4 border-t border-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs text-slate-500">
          <div>
            <p class="border-t border-slate-400 pt-1 mt-8">Diretor Geral</p>
          </div>
          <div>
            <p class="border-t border-slate-400 pt-1 mt-8">Representante da Direção (RD) — SGQ</p>
          </div>
          <p class="sm:col-span-2">Data da Reunião: ____ / ____ / ________</p>
        </div>
      </div>

      <div class="no-print p-5 pt-0 flex gap-2">
        <button @click="imprimir" class="btn-tap flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg text-sm">🖨️ Imprimir</button>
        <button @click="exportarPDF" :disabled="exportandoPdf" class="btn-tap flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm">
          <span v-if="exportandoPdf" class="spinner !w-3.5 !h-3.5"></span>
          <span>{{ exportandoPdf ? "Gerando..." : "⬇️ Exportar PDF" }}</span>
        </button>
      </div>
    </div>
  </div>`
};
/* ==========================================================================
   MÓDULO RNC / RPNC — Registro de Desvios e Problemas (RSG-8301-05)
   ========================================================================== */
const RncModule = {
  props: { user: Object },
  emits: ["go-home"],
  components: { LaudoRncModal, AtaDiretoriaModal },
  setup(props) {
    const loading = ref(true);
    const erro = ref("");
    const lista = ref([]);
    const salvando = ref(false);
    const filtroStatus = ref("todos");
    const filtroOrigem = ref("todas");
    const filtroBusca = ref("");

    async function carregar() {
      loading.value = true;
      erro.value = "";
      try {
        const data = await getInitialData();
        const raw = data.rncs || data.RNCs || data.RPNCs || data.rpncs
          || (data.data && (data.data.rncs || data.data.rpncs)) || [];
        lista.value = (Array.isArray(raw) ? raw : []).map(normalizeRnc);
      } catch (err) {
        console.error(err);
        erro.value = "Não foi possível carregar os registros de RNC/RPNC.";
      } finally {
        loading.value = false;
      }
    }
    onMounted(carregar);
    onMounted(() => carregarCadastrosMestres());

    // Sugestões (datalist) de Setor/Departamento vindas da Central de
    // Cadastros Mestres — mantém <input> de texto livre (não <select>) para
    // não esconder valores já salvos que não batam com nenhum setor
    // cadastrado (o campo sempre foi texto livre neste módulo).
    const sugestoesSetor = computed(() => unirAreas([]));

    const listaComStatus = computed(() =>
      lista.value.map(r => ({ ...r, status: statusRnc(r), prejuizo: prejuizoRnc(r) }))
    );

    const resumo = computed(() => {
      const l = listaComStatus.value;
      return {
        total: l.length,
        emAnalise: l.filter(r => r.status.label === "Em Análise").length,
        fechadas: l.filter(r => r.status.label === "Concluído").length,
        reincidentes: l.filter(r => r.reincidente).length,
        custoTotal: l.reduce((s, r) => s + r.prejuizo, 0),
      };
    });

    const listaFiltrada = computed(() => {
      const termo = filtroBusca.value.trim().toLowerCase();
      return listaComStatus.value
        .filter(r => filtroStatus.value === "todos" || r.status.label === filtroStatus.value)
        .filter(r => filtroOrigem.value === "todas" || r.origem === filtroOrigem.value)
        .filter(r => !termo || r.codigo.toLowerCase().includes(termo) || r.descricao.toLowerCase().includes(termo))
        .sort((a, b) => {
          const da = parseDataHoraLocal(a.dataAbertura), db = parseDataHoraLocal(b.dataAbertura);
          return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
        });
    });

    // ===== Formulário / wizard de 3 etapas =====
    const formAberto = ref(false);
    const editandoId = ref(null);
    const etapaAtual = ref(1);
    const relacionadas = ref([]);
    const causasSugeridas = ref([]);

    const formVazio = () => ({
      codigo: "", descricao: "", setor: "", op: "", quantidadeNc: null, quantidadeRecebida: null,
      origem: ORIGENS_RNC[0], descricaoDefeito: "", analista: (props.user && props.user.nome) || "",
      dataAbertura: "", reincidente: false, metodoCausa: "5porques",
      porque1: "", porque2: "", porque3: "", porque4: "", porque5: "",
      ishikawaMetodo: "", ishikawaMaquina: "", ishikawaMaoDeObra: "", ishikawaMaterial: "", ishikawaMeioAmbiente: "", ishikawaMedicao: "",
      causaConsequenciaCausa: "", causaConsequenciaConsequencia: "",
      causaRaiz: "", disposicao: "", custoUnitario: null,
      reinspecao: "", racpNecessario: false, mapeamentoRisco: false,
    });
    const form = reactive(formVazio());

    function verificarReincidencia() {
      relacionadas.value = buscarRncsRelacionadas(lista.value, form.codigo, form.descricao, editandoId.value);
      form.reincidente = relacionadas.value.length > 0;
      causasSugeridas.value = sugerirCausasFrequentes(relacionadas.value);
    }
    function aplicarCausaSugerida(causa) {
      form.causaRaiz = causa;
    }

    function abrirNovo() {
      Object.assign(form, formVazio());
      editandoId.value = null;
      etapaAtual.value = 1;
      relacionadas.value = [];
      causasSugeridas.value = [];
      formAberto.value = true;
    }
    function abrirEdicao(r) {
      Object.assign(form, formVazio(), {
        codigo: r.codigo, descricao: r.descricao, setor: r.setor, op: r.op, quantidadeNc: r.quantidadeNc, quantidadeRecebida: r.quantidadeRecebida,
        origem: r.origem, descricaoDefeito: r.descricaoDefeito, analista: r.analista, dataAbertura: r.dataAbertura,
        metodoCausa: r.metodoCausa, porque1: r.porque1, porque2: r.porque2, porque3: r.porque3, porque4: r.porque4, porque5: r.porque5,
        ishikawaMetodo: r.ishikawaMetodo, ishikawaMaquina: r.ishikawaMaquina, ishikawaMaoDeObra: r.ishikawaMaoDeObra,
        ishikawaMaterial: r.ishikawaMaterial, ishikawaMeioAmbiente: r.ishikawaMeioAmbiente, ishikawaMedicao: r.ishikawaMedicao,
        causaConsequenciaCausa: r.causaConsequenciaCausa, causaConsequenciaConsequencia: r.causaConsequenciaConsequencia,
        causaRaiz: r.causaRaiz, disposicao: r.disposicao, custoUnitario: r.custoUnitario,
        reinspecao: r.reinspecao, racpNecessario: r.racpNecessario, mapeamentoRisco: r.mapeamentoRisco,
      });
      editandoId.value = r.id;
      etapaAtual.value = 1;
      verificarReincidencia();
      formAberto.value = true;
    }
    function fecharForm() {
      formAberto.value = false;
    }

    const prejuizoCalculado = computed(() => (Number(form.quantidadeNc) || 0) * (Number(form.custoUnitario) || 0));

    function validarEtapa1() {
      if (!form.codigo.trim()) { pushToast("Informe o código do produto.", "error"); return false; }
      if (!form.descricao.trim()) { pushToast("Informe a descrição do produto.", "error"); return false; }
      if (!form.quantidadeNc || Number(form.quantidadeNc) <= 0) { pushToast("Informe a quantidade não conforme.", "error"); return false; }
      if (!form.origem) { pushToast("Selecione a origem do desvio.", "error"); return false; }
      if (!form.descricaoDefeito.trim()) { pushToast("Descreva o defeito encontrado.", "error"); return false; }
      return true;
    }
    function validarEtapa2() {
      if (!form.disposicao) { pushToast("Selecione a disposição do item.", "error"); return false; }
      if (form.custoUnitario === null || form.custoUnitario === "" || Number(form.custoUnitario) < 0) {
        pushToast("Informe o custo unitário para calcular o prejuízo.", "error");
        return false;
      }
      return true;
    }
    function avancarEtapa() {
      if (etapaAtual.value === 1) {
        verificarReincidencia();
        if (!validarEtapa1()) return;
      }
      if (etapaAtual.value === 2 && !validarEtapa2()) return;
      etapaAtual.value++;
    }
    function voltarEtapa() {
      etapaAtual.value--;
    }

    async function salvar() {
      if (!validarEtapa1() || !validarEtapa2()) return;
      if (!form.reinspecao) { pushToast("Informe o resultado da reinspeção.", "error"); return; }
      if (form.reincidente && !form.racpNecessario) {
        pushToast('Item reincidente: marque "Necessário abertura de RACP?" antes de salvar.', "error");
        return;
      }
      if (form.reincidente && !form.mapeamentoRisco) {
        pushToast('Item reincidente: marque "Incluir no Mapeamento de Riscos?" antes de salvar.', "error");
        return;
      }
      salvando.value = true;
      try {
        const id = editandoId.value || "RNC-" + Date.now();
        const dataAbertura = form.dataAbertura || formatarDataISO(new Date());
        await saveRPNCApi({
          id, Codigo_Produto: form.codigo, Descricao_Produto: form.descricao, Setor_Departamento: form.setor, OP: form.op,
          Quantidade_NC: form.quantidadeNc, Quantidade_Recebida: form.quantidadeRecebida, Origem: form.origem,
          Descricao_Defeito: form.descricaoDefeito, Data_Abertura: dataAbertura, Analista: form.analista,
          Reincidente: form.reincidente, Metodo_Causa: form.metodoCausa,
          Porque_1: form.porque1, Porque_2: form.porque2, Porque_3: form.porque3, Porque_4: form.porque4, Porque_5: form.porque5,
          Ishikawa_Metodo: form.ishikawaMetodo, Ishikawa_Maquina: form.ishikawaMaquina, Ishikawa_MaoDeObra: form.ishikawaMaoDeObra,
          Ishikawa_Material: form.ishikawaMaterial, Ishikawa_MeioAmbiente: form.ishikawaMeioAmbiente, Ishikawa_Medicao: form.ishikawaMedicao,
          Causa_Consequencia_Causa: form.causaConsequenciaCausa, Causa_Consequencia_Consequencia: form.causaConsequenciaConsequencia,
          Causa_Raiz: form.causaRaiz, Disposicao: form.disposicao, Custo_Unitario: form.custoUnitario,
          Reinspecao: form.reinspecao, RACP_Necessario: form.racpNecessario, Mapeamento_Risco: form.mapeamentoRisco,
        });
        const atualizado = normalizeRnc({
          ID: id, Codigo_Produto: form.codigo, Descricao_Produto: form.descricao, Setor_Departamento: form.setor, OP: form.op,
          Quantidade_NC: form.quantidadeNc, Quantidade_Recebida: form.quantidadeRecebida, Origem: form.origem,
          Descricao_Defeito: form.descricaoDefeito, Data_Abertura: dataAbertura, Analista: form.analista,
          Reincidente: form.reincidente, Metodo_Causa: form.metodoCausa,
          Porque_1: form.porque1, Porque_2: form.porque2, Porque_3: form.porque3, Porque_4: form.porque4, Porque_5: form.porque5,
          Ishikawa_Metodo: form.ishikawaMetodo, Ishikawa_Maquina: form.ishikawaMaquina, Ishikawa_MaoDeObra: form.ishikawaMaoDeObra,
          Ishikawa_Material: form.ishikawaMaterial, Ishikawa_MeioAmbiente: form.ishikawaMeioAmbiente, Ishikawa_Medicao: form.ishikawaMedicao,
          Causa_Consequencia_Causa: form.causaConsequenciaCausa, Causa_Consequencia_Consequencia: form.causaConsequenciaConsequencia,
          Causa_Raiz: form.causaRaiz, Disposicao: form.disposicao, Custo_Unitario: form.custoUnitario,
          Reinspecao: form.reinspecao, RACP_Necessario: form.racpNecessario, Mapeamento_Risco: form.mapeamentoRisco,
        });
        const idx = lista.value.findIndex(r => r.id === id);
        if (idx === -1) lista.value.unshift(atualizado);
        else lista.value[idx] = atualizado;
        pushToast(editandoId.value ? "RNC atualizada." : "RNC registrada.", "success");
        formAberto.value = false;
        setTimeout(() => carregar(), 3000);
      } catch (err) {
        console.error(err);
        pushToast("Erro ao salvar. Tente novamente.", "error");
      } finally {
        salvando.value = false;
      }
    }

    // ===== Laudo individual (RSG-8301-05) =====
    const laudoAberto = ref(false);
    const rncLaudo = ref(null);
    function abrirLaudo(r) { rncLaudo.value = r; laudoAberto.value = true; }
    function fecharLaudo() { laudoAberto.value = false; }

    // ===== Ata Executiva de Diretoria =====
    const ataAberta = ref(false);
    function abrirAta() { ataAberta.value = true; }
    function fecharAta() { ataAberta.value = false; }

    function formatarData(v) {
      const d = parseDataHoraLocal(v);
      return d ? d.toLocaleDateString("pt-BR") : "-";
    }
    function formatarMoeda(v) {
      return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

    return {
      loading, erro, resumo, listaFiltrada, listaComStatus, filtroStatus, filtroOrigem, filtroBusca, origens: ORIGENS_RNC,
      formAberto, form, editandoId, etapaAtual, relacionadas, causasSugeridas, salvando,
      metodosCausa: METODOS_CAUSA_RNC, camposIshikawa: CAMPOS_ISHIKAWA, disposicoes: DISPOSICOES_RNC,
      abrirNovo, abrirEdicao, fecharForm, avancarEtapa, voltarEtapa, salvar,
      verificarReincidencia, aplicarCausaSugerida, prejuizoCalculado,
      laudoAberto, rncLaudo, abrirLaudo, fecharLaudo,
      ataAberta, abrirAta, fecharAta,
      formatarData, formatarMoeda, sugestoesSetor,
    };
  },
  template: `
  <div class="space-y-5">
    <div class="flex justify-end">
      <button @click="abrirAta" class="btn-tap flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm shadow-sm">
        📑 Gerar Ata de Reunião da Diretoria
      </button>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
      <div class="rounded-xl border p-4 shadow-sm bg-slate-50 border-slate-500">
        <p class="text-xs text-slate-500 font-semibold uppercase">Total de RNCs</p>
        <p class="text-3xl font-extrabold text-slate-600 mt-1">{{ resumo.total }}</p>
      </div>
      <div class="rounded-xl border p-4 shadow-sm bg-amber-50 border-amber-500">
        <p class="text-xs text-slate-500 font-semibold uppercase">🟡 Em Análise</p>
        <p class="text-3xl font-extrabold text-amber-600 mt-1">{{ resumo.emAnalise }}</p>
      </div>
      <div class="rounded-xl border p-4 shadow-sm bg-emerald-50 border-emerald-500">
        <p class="text-xs text-slate-500 font-semibold uppercase">🟢 Concluídas</p>
        <p class="text-3xl font-extrabold text-emerald-600 mt-1">{{ resumo.fechadas }}</p>
      </div>
      <div class="rounded-xl border p-4 shadow-sm bg-orange-50 border-orange-500">
        <p class="text-xs text-slate-500 font-semibold uppercase">🔁 Reincidentes</p>
        <p class="text-3xl font-extrabold text-orange-600 mt-1">{{ resumo.reincidentes }}</p>
      </div>
      <div class="rounded-xl border p-4 shadow-sm bg-red-50 border-red-500">
        <p class="text-xs text-slate-500 font-semibold uppercase">💰 Custo Total</p>
        <p class="text-xl font-extrabold text-red-600 mt-1">{{ formatarMoeda(resumo.custoTotal) }}</p>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm space-y-2">
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input v-model="filtroBusca" type="text" placeholder="Buscar código ou descrição..."
          class="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        <select v-model="filtroStatus" class="rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
          <option value="todos">Status: Todos</option>
          <option value="Em Análise">🟡 Em Análise</option>
          <option value="Concluído">🟢 Concluído</option>
        </select>
        <select v-model="filtroOrigem" class="rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
          <option value="todas">Origem: Todas</option>
          <option v-for="o in origens" :key="o" :value="o">{{ o }}</option>
        </select>
      </div>
      <button @click="abrirNovo" class="btn-tap w-full flex items-center justify-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg text-sm py-2">
        + Nova RNC
      </button>
    </div>

    <div v-if="loading" class="flex justify-center py-12 text-slate-400">
      <span class="spinner !border-slate-300 !border-t-sky-600"></span>
    </div>
    <div v-else-if="erro" class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{{ erro }}</div>
    <div v-else-if="listaFiltrada.length === 0" class="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-400">
      Nenhuma RNC encontrada para os filtros selecionados.
    </div>
    <div v-else class="bg-white rounded-xl border border-slate-200 overflow-x-auto">
      <table class="text-xs w-full border-collapse">
        <thead>
          <tr class="bg-slate-800 text-white">
            <th class="px-3 py-2 text-left whitespace-nowrap">Código</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">Descrição</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">Setor</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">OP</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">Origem</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">Qtd. NC</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">Reincidente</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">Status</th>
            <th class="px-3 py-2 text-left whitespace-nowrap">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in listaFiltrada" :key="r.id" class="border-t border-slate-100 hover:bg-slate-50">
            <td class="px-3 py-2">
              <button @click="abrirEdicao(r)" class="btn-tap font-mono font-bold text-sky-700 hover:underline whitespace-nowrap">{{ r.codigo || "-" }}</button>
            </td>
            <td class="px-3 py-2 min-w-[140px] text-slate-700">{{ r.descricao || "-" }}</td>
            <td class="px-3 py-2 whitespace-nowrap text-slate-600">{{ r.setor || "-" }}</td>
            <td class="px-3 py-2 whitespace-nowrap text-slate-600">{{ r.op || "-" }}</td>
            <td class="px-3 py-2 whitespace-nowrap text-slate-600">{{ r.origem || "-" }}</td>
            <td class="px-3 py-2 whitespace-nowrap text-slate-600">{{ r.quantidadeNc }}</td>
            <td class="px-3 py-2 whitespace-nowrap">
              <span v-if="r.reincidente" class="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700">🔁 Sim</span>
              <span v-else class="text-xs text-slate-400">Não</span>
            </td>
            <td class="px-3 py-2">
              <span class="text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap" :class="r.status.cls">{{ r.status.cor }} {{ r.status.label }}</span>
            </td>
            <td class="px-3 py-2">
              <div class="flex items-center gap-1">
                <button @click="abrirEdicao(r)" title="Ver / Editar" class="btn-tap w-7 h-7 flex items-center justify-center rounded-md bg-slate-100 hover:bg-slate-200">✏️</button>
                <button @click="abrirLaudo(r)" title="Imprimir RSG-8301-05" class="btn-tap w-7 h-7 flex items-center justify-center rounded-md bg-slate-100 hover:bg-slate-200">🖨️</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Wizard de 3 etapas -->
    <div v-if="formAberto" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4">
      <div class="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h3 class="font-bold text-slate-800">{{ editandoId ? "Editar RNC" : "Nova RNC / RPNC" }}</h3>
            <p class="text-xs text-slate-400 mt-0.5">
              Passo {{ etapaAtual }} de 3 —
              <span v-if="etapaAtual === 1">Chão de Fábrica</span>
              <span v-else-if="etapaAtual === 2">Investigação de Causa Raiz</span>
              <span v-else>Fechamento & Gatilhos ISO 9001</span>
            </p>
          </div>
          <button @click="fecharForm" class="btn-tap text-slate-400 hover:text-slate-600 text-xl leading-none px-2">✕</button>
        </div>

        <div class="p-5 space-y-4">
          <!-- ===== PASSO 1 ===== -->
          <template v-if="etapaAtual === 1">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Código do Produto *</label>
                <input v-model="form.codigo" @input="verificarReincidencia" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">OP</label>
                <input v-model="form.op" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Descrição do Produto *</label>
              <input v-model="form.descricao" @input="verificarReincidencia" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Setor/Departamento</label>
              <input v-model="form.setor" type="text" list="rnc-sugestoes-setor" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              <datalist id="rnc-sugestoes-setor">
                <option v-for="s in sugestoesSetor" :key="s" :value="s"></option>
              </datalist>
            </div>

            <div v-if="relacionadas.length" class="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-1.5">
              <p class="text-xs font-bold text-orange-700">🔁 Reincidente: SIM — {{ relacionadas.length }} ocorrência(s) anterior(es) encontrada(s)</p>
              <p v-for="rel in relacionadas" :key="rel.id" class="text-xs text-orange-700">RNC #{{ rel.id }} em {{ formatarData(rel.dataAbertura) }}</p>
              <p v-if="causasSugeridas.length" class="text-xs text-orange-700 pt-1">
                Causas frequentes no histórico: <span class="font-semibold">{{ causasSugeridas.join(", ") }}</span>
              </p>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Quantidade NC *</label>
                <input v-model.number="form.quantidadeNc" type="number" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Quantidade Recebida</label>
                <input v-model.number="form.quantidadeRecebida" type="number" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Origem *</label>
              <select v-model="form.origem" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
                <option v-for="o in origens" :key="o" :value="o">{{ o }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Descrição do Defeito *</label>
              <textarea v-model="form.descricaoDefeito" rows="3" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"></textarea>
            </div>
          </template>

          <!-- ===== PASSO 2 ===== -->
          <template v-if="etapaAtual === 2">
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Método de Investigação</label>
              <div class="grid grid-cols-3 gap-2">
                <button v-for="m in metodosCausa" :key="m.value" type="button" @click="form.metodoCausa = m.value"
                  class="btn-tap rounded-lg border-2 py-2 text-xs font-bold transition-colors"
                  :class="form.metodoCausa === m.value ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-600'">
                  {{ m.label }}
                </button>
              </div>
            </div>

            <template v-if="form.metodoCausa === '5porques'">
              <div v-for="n in 5" :key="n">
                <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Por quê {{ n }}?</label>
                <input v-model="form['porque' + n]" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
            </template>
            <template v-else-if="form.metodoCausa === 'ishikawa'">
              <div v-for="c in camposIshikawa" :key="c.value">
                <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{{ c.label }}</label>
                <textarea v-model="form[c.value]" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"></textarea>
              </div>
            </template>
            <template v-else>
              <div>
                <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Causa</label>
                <textarea v-model="form.causaConsequenciaCausa" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"></textarea>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Consequência</label>
                <textarea v-model="form.causaConsequenciaConsequencia" rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"></textarea>
              </div>
            </template>

            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Causa Raiz Consolidada</label>
              <textarea v-model="form.causaRaiz" rows="2" placeholder="Resumo da causa raiz identificada..." class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"></textarea>
              <div v-if="causasSugeridas.length" class="flex flex-wrap gap-1.5 mt-1.5">
                <button v-for="c in causasSugeridas" :key="c" type="button" @click="aplicarCausaSugerida(c)"
                  class="btn-tap text-xs bg-orange-50 hover:bg-orange-50 text-orange-700 font-semibold px-2.5 py-1 rounded-full border border-orange-200">
                  Usar: "{{ c }}"
                </button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Disposição do Item *</label>
              <div class="grid grid-cols-2 gap-2">
                <button v-for="d in disposicoes" :key="d" type="button" @click="form.disposicao = d"
                  class="btn-tap rounded-lg border-2 py-2 text-xs font-bold transition-colors"
                  :class="form.disposicao === d ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-600'">
                  {{ d }}
                </button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Custo Unitário (R$) *</label>
              <input v-model.number="form.custoUnitario" type="number" min="0" step="0.01" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div class="bg-slate-50 rounded-lg border border-slate-200 p-3 flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-500 uppercase">Prejuízo Calculado</span>
              <span class="text-lg font-extrabold text-red-600">{{ formatarMoeda(prejuizoCalculado) }}</span>
            </div>
          </template>

          <!-- ===== PASSO 3 ===== -->
          <template v-if="etapaAtual === 3">
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Reinspeção *</label>
              <select v-model="form.reinspecao" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
                <option value="">Selecione...</option>
                <option value="Aprovado">Aprovado</option>
                <option value="Reprovado">Reprovado</option>
              </select>
            </div>

            <div v-if="form.reincidente" class="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
              <p class="text-xs font-bold text-red-700">⚠️ Item reincidente — gatilhos obrigatórios do SGQ</p>
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="form.racpNecessario" type="checkbox" class="w-4 h-4" />
                <span class="text-sm text-slate-700">Necessário abertura de RACP? <span class="font-bold">[SIM]</span></span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="form.mapeamentoRisco" type="checkbox" class="w-4 h-4" />
                <span class="text-sm text-slate-700">Incluir no Mapeamento de Riscos? <span class="font-bold">[SIM]</span></span>
              </label>
            </div>
          </template>
        </div>

        <div class="sticky bottom-0 bg-white border-t border-slate-200 p-5 flex gap-2">
          <button v-if="etapaAtual > 1" @click="voltarEtapa" class="btn-tap flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg text-sm">
            ← Voltar
          </button>
          <button v-if="etapaAtual < 3" @click="avancarEtapa" class="btn-tap flex-1 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 rounded-lg text-sm">
            Avançar →
          </button>
          <button v-else @click="salvar" :disabled="salvando" class="btn-tap flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm">
            <span v-if="salvando" class="spinner"></span>
            <span>{{ salvando ? "Salvando..." : "Salvar RNC" }}</span>
          </button>
        </div>
      </div>
    </div>

    <laudo-rnc-modal v-if="laudoAberto" :rnc="rncLaudo" @fechar="fecharLaudo"></laudo-rnc-modal>
    <ata-diretoria-modal v-if="ataAberta" :lista="listaComStatus" @fechar="fecharAta"></ata-diretoria-modal>
  </div>`
};
