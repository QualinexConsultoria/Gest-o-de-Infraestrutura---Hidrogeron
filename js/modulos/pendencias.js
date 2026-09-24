/* ==========================================================================if (typeof statusInstrumentoCalibracao === "undefined") {
  window.statusInstrumentoCalibracao = function(dataVenc, statusManual) {
    if (String(statusManual || "").toLowerCase().indexOf("calibra") !== -1) return "Em Calibração";
    if (!dataVenc) return "No Prazo";
    var diff = Math.ceil((new Date(dataVenc).getTime() - new Date().setHours(0,0,0,0)) / 86400000);
    return diff < 0 ? "Vencido" : (diff <= 45 ? "Atenção (< 45d)" : "No Prazo");
  };
  var statusInstrumentoCalibracao = window.statusInstrumentoCalibracao;
}
   js/modulos/pendencias.js — Cockpit da página inicial (HomeHub)
   Menu modular pós-login com KPIs operacionais (chamados em aberto,
   calibrações vencidas, RNCs pendentes) e o alerta automático de RNC no
   login. Carrega por ÚLTIMO entre os módulos porque consome helpers de
   calibração, manutenção e RNC (normalizeCalibracao, extractCorretivas,
   normalizeRnc/statusRnc) para montar seus indicadores.
   ========================================================================== */
/* ==========================================================================
   HUB PRINCIPAL (tela inicial pós-login)
   ========================================================================== */
// Estrutura de dados única para os 5 painéis da tela inicial — cada item
// descreve um cartão em linguagem simples (sem sigla/jargão de qualidade
// não explicado). "rota" ou "tipo" indicam um item com link funcional;
// itens sem nenhum dos dois são apenas informativos (fase de planejamento).
const SECOES_HOME = [
  {
    key: "planejamento",
    icon: "🎯",
    titulo: "Gestão & Planejamento Estratégico",
    badgeSecao: "Fase de Planejamento",
    abertoPadrao: false,
    itens: [
      { icon: "🔍", titulo: "Visão do Negócio e Cenários", desc: "Análise de forças, fraquezas, oportunidades e ameaças da empresa." },
      { icon: "🎯", titulo: "Objetivos e Metas", desc: "Metas anuais e compromissos de desempenho por setor." },
      { icon: "🛡️", titulo: "Prevenção de Riscos e Oportunidades", desc: "Mapeamento de pontos críticos para evitar falhas e paradas." },
      { icon: "📌", titulo: "Projetos e Iniciativas", desc: "Acompanhamento de planos de ação e melhorias em andamento." },
    ],
  },
  {
    key: "indicadores",
    icon: "📊",
    titulo: "Indicadores de Desempenho & Melhorias",
    abertoPadrao: true,
    itens: [
      { icon: "📊", titulo: "Dashboard Geral da Fábrica", desc: "Painel com a visão geral do funcionamento da fábrica em tempo real.", rota: "dashboard" },
      { icon: "📈", titulo: "Métricas de Manutenção (KPIs)", desc: "Tempo médio entre falhas, tempo de reparo e cumprimento de prazos.", rota: "indicadores" },
      { icon: "🚨", titulo: "Registro de Desvios e Problemas (RNC)", desc: "Controle de falhas ocorridas e investigação do que causou o problema.", rota: "rnc" },
      { icon: "✅", titulo: "Planos de Ação e Melhorias", desc: "O que fazer para resolver problemas e evitar que aconteçam de novo.", emBreve: true },
    ],
  },
  {
    key: "documentos",
    icon: "📄",
    titulo: "Gestão de Documentos & Processos",
    badgeSecao: "Fase de Planejamento",
    abertoPadrao: false,
    itens: [
      { icon: "📋", titulo: "Procedimentos e Instruções de Trabalho", desc: "Passo a passo de como executar cada atividade da empresa com segurança e padrão." },
      { icon: "🗂️", titulo: "Histórico e Consulta de Documentos", desc: "Documentos aprovados, versões atualizadas e lista de leitura obrigatória." },
      { icon: "📜", titulo: "Licenças, Laudos e Alvarás", desc: "Controle de documentos legais, laudos de segurança e autorizações ambientais com alerta de vencimento." },
      { icon: "🔗", titulo: "Mapeamento de Atividades", desc: "Como cada setor funciona, o que recebe e o que entrega." },
      { icon: "🗃️", titulo: "Central de Cadastros Mestres", desc: "Setores, Processos, Pessoas, Fornecedores e Tipos de Documentos usados nos demais módulos.", rota: "cadastros", apenasAdmin: true, selo: "Apenas Administrador" },
    ],
  },
  {
    key: "operacao",
    icon: "⚙️",
    titulo: "Operação Industrial & Manutenção",
    abertoPadrao: true,
    itens: [
      { icon: "🟢", titulo: "Manutenção Preventiva", desc: "Checklists periódicos de checagem para evitar que as máquinas quebrem.", rota: "preventiva" },
      { icon: "🟠", titulo: "Manutenção Corretiva", desc: "Abertura e fechamento de chamados rápidos quando uma máquina para ou apresenta defeito.", rota: "corretiva" },
      { icon: "📐", titulo: "Calibração de Instrumentos", desc: "Controle de balanças, termômetros e instrumentos de medição com validades e certificados.", rota: "calibracao" },
      { icon: "🏭", titulo: "Gestão do Parque de Máquinas", desc: "Cadastro, informações técnicas e status das máquinas ativas/inativas da fábrica.", rota: "ativos" },
    ],
  },
  {
    key: "comunicacao",
    icon: "📲",
    titulo: "Canais de Comunicação, Perfil & Acesso",
    abertoPadrao: true,
    itens: [
      { icon: "💬", titulo: "Contato Direto via WhatsApp", desc: "Botões rápidos para falar direto com Produção, Qualidade, Diretoria e Compras.", tipo: "whatsapp" },
      { icon: "👥", titulo: "Gestão de Usuários e Acessos", desc: "Cadastro de colaboradores, consulta/alteração de senhas e bloqueio de acessos.", rota: "usuarios", apenasAdmin: true, selo: "Apenas Administrador" },
      { icon: "👤", titulo: "Meu Perfil e Troca de Senha", desc: "Área para consultar seus dados e alterar o seu próprio PIN de acesso.", tipo: "perfil", selo: "Todos" },
    ],
  },
];
const HomeHub = {
  props: { user: Object },
  emits: ["navigate", "abrir-perfil"],
  setup(props, { emit }) {
    const abertosCount = ref(null); // null enquanto carrega
    const vencidosCalibracaoCount = ref(null);
    const rncsPendentesCount = ref(null);
    const contatos = ref(CONTATOS_WHATSAPP_FALLBACK);
    // Banner do alerta de RNCs pendentes: fechado manualmente some pelo
    // restante da visita à Home (não é persistido — reaparece ao logar de
    // novo enquanto o pendente continuar existindo, por desenho).
    const bannerRncFechado = ref(false);

    async function carregarResumo() {
      try {
        const data = await getInitialData();
        abertosCount.value = extractCorretivas(data).filter(c => isStatusChamadoAberto(c.status)).length;
        const rawCalibracoes = data.calibracoes || data.Calibracoes_Controle || (data.data && data.data.calibracoes) || [];
        vencidosCalibracaoCount.value = (Array.isArray(rawCalibracoes) ? rawCalibracoes : [])
          .map(normalizeCalibracao)
          .filter(c => statusInstrumentoCalibracao(c).label === "Vencido").length;
        const rawRncs = data.rncs || data.RNCs || data.RPNCs || data.rpncs || (data.data && (data.data.rncs || data.data.rpncs)) || [];
        rncsPendentesCount.value = (Array.isArray(rawRncs) ? rawRncs : [])
          .map(normalizeRnc)
          .filter(r => statusRnc(r).label === "Em Análise" || !(r.causaRaiz && r.causaRaiz.trim())).length;
        contatos.value = extractContatosWhatsApp(data);
      } catch (err) {
        console.error(err);
        abertosCount.value = null;
        vencidosCalibracaoCount.value = null;
        rncsPendentesCount.value = null;
      }
    }

    onMounted(carregarResumo);

    const mostrarBannerRnc = computed(() =>
      !bannerRncFechado.value && podeVerAlertaRnc(props.user) && !!rncsPendentesCount.value
    );
    function fecharBannerRnc() {
      bannerRncFechado.value = true;
    }
    function abrirRncDoBanner() {
      emit("navigate", "rnc");
    }

    // Estado de aberto/fechado de cada painel — inicializado a partir de
    // "abertoPadrao" de cada seção (Planejamento e Documentos recolhidos;
    // Indicadores, Operação e Comunicação abertos).
    const secoesAbertas = reactive(
      Object.fromEntries(SECOES_HOME.map(s => [s.key, s.abertoPadrao]))
    );
    function alternarSecao(key) {
      secoesAbertas[key] = !secoesAbertas[key];
    }

    // Item de Gestão de Usuários só aparece para Administrador — mesma regra
    // de acesso já aplicada na rota (App.navigate bloqueia mesmo assim).
    const secoes = computed(() =>
      SECOES_HOME.map(s => ({
        ...s,
        itens: s.itens.filter(i => !i.apenasAdmin || isAdmin(props.user)),
      }))
    );

    function badgeOperacional(item) {
      if (item.rota === "corretiva") {
        if (abertosCount.value) return { texto: `${abertosCount.value} em aberto`, cls: "bg-rose-50 text-rose-700" };
        if (abertosCount.value === 0) return { texto: "Tudo em dia", cls: "bg-emerald-50 text-emerald-700" };
      }
      if (item.rota === "calibracao" && vencidosCalibracaoCount.value) {
        return { texto: `${vencidosCalibracaoCount.value} vencido(s)`, cls: "bg-rose-50 text-rose-700" };
      }
      if (item.rota === "rnc" && rncsPendentesCount.value) {
        return { texto: `${rncsPendentesCount.value} pendente(s)`, cls: "bg-rose-50 text-rose-700" };
      }
      return null;
    }

    function itemClicavel(item) {
      return !!item.rota || item.tipo === "perfil";
    }
    function abrirItem(item) {
      if (!itemClicavel(item)) return;
      if (item.tipo === "perfil") emit("abrir-perfil");
      else emit("navigate", item.rota);
    }

    return {
      secoes, secoesAbertas, alternarSecao, badgeOperacional, itemClicavel, abrirItem,
      contatos, abrirWhatsApp,
      primeiroNome: (props.user.nome || "").split(" ")[0],
      rncsPendentesCount, mostrarBannerRnc, fecharBannerRnc, abrirRncDoBanner,
    };
  },
  template: `
  <div>
    <div v-if="mostrarBannerRnc" class="mb-4 bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
      <span class="text-xl shrink-0">⚠️</span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-amber-800">
          Atenção: Existem {{ rncsPendentesCount }} Não Conformidade{{ rncsPendentesCount === 1 ? '' : 's' }} pendente{{ rncsPendentesCount === 1 ? '' : 's' }} de Investigação de Causa Raiz e Disposição.
        </p>
        <button @click="abrirRncDoBanner" class="btn-tap text-xs font-bold text-amber-800 underline mt-1">Ver Registro de Desvios e Problemas (RNC) →</button>
      </div>
      <button @click="fecharBannerRnc" class="btn-tap text-amber-500 hover:text-amber-700 text-lg leading-none shrink-0">✕</button>
    </div>

    <div class="mb-6">
      <h1 class="text-xl sm:text-2xl font-extrabold text-slate-800">Olá, {{ primeiroNome }} 👋</h1>
      <p class="text-slate-500 text-sm mt-1">Selecione um módulo para começar.</p>
    </div>

    <div class="space-y-3">
      <section v-for="s in secoes" :key="s.key" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button @click="alternarSecao(s.key)"
          class="btn-tap w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-4 text-left">
          <span class="flex items-center gap-3 min-w-0">
            <span class="text-2xl shrink-0">{{ s.icon }}</span>
            <span class="font-bold text-slate-800 text-sm sm:text-base truncate">{{ s.titulo }}</span>
            <span v-if="s.badgeSecao" class="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
              {{ s.badgeSecao }}
            </span>
          </span>
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-slate-400 shrink-0 transition-transform duration-300"
            :class="secoesAbertas[s.key] ? 'rotate-180' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>

        <div class="grid transition-all duration-300 ease-in-out" :class="secoesAbertas[s.key] ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'">
          <div class="overflow-hidden">
            <div class="px-4 sm:px-5 pb-5 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div v-for="item in s.itens" :key="item.titulo"
                @click="abrirItem(item)"
                class="group relative rounded-xl border p-4 transition-all duration-200"
                :class="itemClicavel(item)
                  ? 'bg-white border-slate-200 hover:border-sky-300 hover:shadow-md cursor-pointer btn-tap'
                  : 'bg-slate-50 border-dashed border-slate-300 opacity-80'">
                <span v-if="item.emBreve" class="absolute top-2.5 right-2.5 text-[9px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full">
                  Em Breve
                </span>
                <span v-else-if="item.selo" class="absolute top-2.5 right-2.5 text-[9px] font-bold uppercase tracking-wide bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-full">
                  {{ item.selo }}
                </span>
                <span v-else-if="badgeOperacional(item)" class="absolute top-2.5 right-2.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full" :class="badgeOperacional(item).cls">
                  {{ badgeOperacional(item).texto }}
                </span>
                <div class="flex items-start gap-3">
                  <span class="text-xl shrink-0">{{ item.icon }}</span>
                  <div class="min-w-0">
                    <p class="font-bold text-slate-800 text-sm mb-0.5">{{ item.titulo }}</p>
                    <p class="text-xs text-slate-500 leading-snug">{{ item.desc }}</p>
                  </div>
                </div>

                <!-- Contato Direto via WhatsApp: botões inline, não é um link de navegação -->
                <div v-if="item.tipo === 'whatsapp'" class="flex flex-wrap gap-1.5 mt-3">
                  <button v-for="c in contatos" :key="c.cargo" @click.stop="abrirWhatsApp(c.numero, 'Olá, ' + c.cargo + '! ')"
                    class="btn-tap flex items-center gap-1 bg-emerald-50 hover:bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-1.5 rounded-full text-xs border border-emerald-200">
                    💬 {{ c.cargo }}
                  </button>
                </div>

                <span v-if="itemClicavel(item)" class="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 group-hover:gap-1.5 transition-all mt-3">
                  Abrir <span aria-hidden="true">→</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>`
};
