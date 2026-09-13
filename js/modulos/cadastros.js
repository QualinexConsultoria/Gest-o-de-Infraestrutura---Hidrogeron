/* ==========================================================================
   js/modulos/cadastros.js — Central de Cadastros Mestres
   Novo módulo unificado para Setores, Processos, Pessoas, Fornecedores e
   Tipos de Documentos — dados de apoio consultados pelos demais módulos
   (hoje cada módulo ainda usa suas próprias listas locais, ex.: AREAS em
   Calibração/Corretiva/Preventiva; a migração desses selects para consumir
   este cadastro fica como evolução futura, fora do escopo desta task).
   Depende de js/api.js (saveCadastroApi/deleteCadastroApi) e do núcleo
   compartilhado do index.html (isAdmin, pushToast, uid).
   ========================================================================== */
const TIPOS_CADASTRO = [
  { chave: "setores", label: "Setores", singular: "Setor", artigo: "o", icon: "🏭" },
  { chave: "processos", label: "Processos", singular: "Processo", artigo: "o", icon: "🔄" },
  { chave: "pessoas", label: "Pessoas", singular: "Pessoa", artigo: "a", icon: "👤" },
  { chave: "fornecedores", label: "Fornecedores", singular: "Fornecedor", artigo: "o", icon: "🚚" },
  { chave: "tiposDocumento", label: "Tipos de Documentos", singular: "Tipo de Documento", artigo: "o", icon: "📄" },
];

function normalizeCadastroItem(c) {
  return {
    id: c.ID || c.Id || c.id || uid(),
    nome: c.Nome || c.nome || c["Descrição"] || c.Descricao || c.descricao || "",
    ativo: parseBooleanoFlexivel(c.Ativo ?? c.ativo ?? true),
  };
}

// getInitialData() ainda não retorna estas coleções no backend atual — cada
// chave cai num array vazio até o Apps Script expor
// setores/processos/pessoas/fornecedores/tiposDocumento, mesmo padrão
// tolerante (PascalCase/camelCase/data.data) usado pelos demais extractX.
function extractCadastro(data, chave) {
  const chaveCapitalizada = chave.charAt(0).toUpperCase() + chave.slice(1);
  const raw = (data && (data[chave] || data[chaveCapitalizada] || (data.data && (data.data[chave] || data.data[chaveCapitalizada])))) || [];
  return (Array.isArray(raw) ? raw : []).map(normalizeCadastroItem);
}

const CadastrosMestresModule = {
  props: { user: Object },
  setup(props) {
    const abaAtiva = ref(TIPOS_CADASTRO[0].chave);
    const listas = reactive(Object.fromEntries(TIPOS_CADASTRO.map(t => [t.chave, []])));
    const loading = ref(true);
    const erro = ref("");
    const novoNome = ref("");
    const salvando = ref(false);
    const souAdmin = computed(() => isAdmin(props.user));

    async function carregar() {
      loading.value = true;
      erro.value = "";
      try {
        const data = await getInitialData();
        TIPOS_CADASTRO.forEach(t => { listas[t.chave] = extractCadastro(data, t.chave); });
      } catch (err) {
        console.error(err);
        erro.value = "Não foi possível carregar os cadastros mestres.";
      } finally {
        loading.value = false;
      }
    }
    onMounted(carregar);

    const tipoAtivo = computed(() => TIPOS_CADASTRO.find(t => t.chave === abaAtiva.value));
    const listaAtiva = computed(() => listas[abaAtiva.value] || []);

    async function adicionar() {
      const nome = novoNome.value.trim();
      if (!nome) {
        pushToast(`Informe o nome d${tipoAtivo.value.artigo} ${tipoAtivo.value.singular.toLowerCase()}.`, "error");
        return;
      }
      salvando.value = true;
      try {
        const id = "CAD-" + Date.now();
        const resp = await saveCadastroApi(abaAtiva.value, { id, nome, ativo: true });
        if (resp && resp.status === "error") throw new Error(resp.message || "Erro ao salvar.");
        listas[abaAtiva.value] = [...listas[abaAtiva.value], { id, nome, ativo: true }];
        novoNome.value = "";
        pushToast(`${tipoAtivo.value.singular} cadastrado com sucesso!`, "success");
      } catch (err) {
        console.error(err);
        pushToast("Erro ao salvar. Tente novamente.", "error");
      } finally {
        salvando.value = false;
      }
    }

    const excluirAlvo = ref(null);
    const excluindo = ref(false);
    function pedirExclusao(item) { excluirAlvo.value = item; }
    function cancelarExclusao() { excluirAlvo.value = null; }
    async function confirmarExclusao() {
      const alvo = excluirAlvo.value;
      if (!alvo) return;
      excluindo.value = true;
      try {
        const resp = await deleteCadastroApi(abaAtiva.value, alvo.id);
        if (resp && resp.status === "error") throw new Error(resp.message || "Erro ao excluir.");
        listas[abaAtiva.value] = listas[abaAtiva.value].filter(i => i.id !== alvo.id);
        pushToast(`${tipoAtivo.value.singular} excluído com sucesso!`, "success");
        excluirAlvo.value = null;
      } catch (err) {
        console.error(err);
        pushToast("Erro ao excluir. Tente novamente.", "error");
      } finally {
        excluindo.value = false;
      }
    }

    return {
      TIPOS_CADASTRO, abaAtiva, listas, loading, erro, novoNome, salvando, tipoAtivo, listaAtiva,
      adicionar, souAdmin, excluirAlvo, excluindo, pedirExclusao, cancelarExclusao, confirmarExclusao, carregar,
    };
  },
  template: `
  <div>
    <div class="mb-6">
      <h1 class="text-xl sm:text-2xl font-extrabold text-slate-800">Central de Cadastros Mestres</h1>
      <p class="text-slate-500 text-sm mt-1">Setores, Processos, Pessoas, Fornecedores e Tipos de Documentos usados nos demais módulos.</p>
    </div>

    <div class="flex gap-2 flex-wrap mb-4">
      <button v-for="t in TIPOS_CADASTRO" :key="t.chave" @click="abaAtiva = t.chave"
        class="btn-tap px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5"
        :class="abaAtiva === t.chave ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-600'">
        <span>{{ t.icon }}</span><span>{{ t.label }}</span>
      </button>
    </div>

    <div v-if="souAdmin" class="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex gap-2">
      <input v-model="novoNome" type="text" :placeholder="'Nome d' + tipoAtivo.artigo + ' ' + tipoAtivo.singular.toLowerCase()" @keyup.enter="adicionar"
        class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
      <button @click="adicionar" :disabled="salvando"
        class="btn-tap bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg text-sm whitespace-nowrap">
        {{ salvando ? "Salvando..." : "+ Adicionar" }}
      </button>
    </div>

    <div v-if="loading" class="flex justify-center py-8 text-slate-400">
      <span class="spinner !border-slate-300 !border-t-sky-600"></span>
    </div>
    <div v-else-if="erro" class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{{ erro }}</div>
    <div v-else-if="listaAtiva.length === 0" class="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-400">
      Nenhum{{ tipoAtivo.artigo === 'a' ? 'a' : '' }} {{ tipoAtivo.singular.toLowerCase() }} cadastrad{{ tipoAtivo.artigo === 'a' ? 'a' : 'o' }} ainda.
    </div>
    <div v-else class="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
      <div v-for="item in listaAtiva" :key="item.id" class="px-4 py-3 flex items-center justify-between gap-2">
        <span class="text-sm text-slate-700">{{ item.nome }}</span>
        <button v-if="souAdmin" @click="pedirExclusao(item)" title="Excluir" class="btn-tap w-7 h-7 flex items-center justify-center rounded-md bg-red-50 hover:bg-red-100 text-red-600 shrink-0">🗑️</button>
      </div>
    </div>

    <div v-if="excluirAlvo" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="cancelarExclusao">
      <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4">
        <h3 class="font-bold text-slate-800">Excluir {{ tipoAtivo.singular.toLowerCase() }}?</h3>
        <p class="text-sm text-slate-600">Esta ação remove definitivamente <span class="font-semibold">{{ excluirAlvo.nome }}</span> da base de dados. Não pode ser desfeita.</p>
        <div class="flex gap-2 pt-1">
          <button @click="cancelarExclusao" :disabled="excluindo" class="btn-tap flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-semibold py-2.5 rounded-lg text-sm">Cancelar</button>
          <button @click="confirmarExclusao" :disabled="excluindo" class="btn-tap flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm">
            <span v-if="excluindo" class="spinner"></span><span>{{ excluindo ? "Excluindo..." : "🗑️ Excluir" }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>`
};
