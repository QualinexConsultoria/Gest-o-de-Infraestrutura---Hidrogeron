/* ==========================================================================
   js/modulos/cadastros.js — Central de Cadastros Mestres
   Módulo unificado para Setores/Áreas, Tipos de Equipamentos/Instrumentos,
   Fornecedores/Laboratórios de Calibração e Responsáveis/Pessoas — dados de
   apoio consultados pelos demais módulos (Calibração, Preventiva, Corretiva
   e RNC leem `cadastrosMestresState` para sugerir Setor/Instrumento/
   Responsável/Laboratório nos formulários, sempre com fallback para as
   listas locais já existentes quando o cadastro ainda estiver vazio).
   Depende de js/api.js (getInitialData/saveCadastroApi/deleteCadastroApi) e
   do núcleo compartilhado do index.html (isAdmin, pushToast, uid,
   normalizarTexto, parseBooleanoFlexivel).
   ========================================================================== */
const TIPOS_CADASTRO = [
  {
    chave: "setores", label: "Setores / Áreas", singular: "Setor", artigo: "o", icon: "🏭",
    campos: [],
  },
  {
    chave: "tiposEquipamento", label: "Tipos de Equipamentos", singular: "Tipo de Equipamento", artigo: "o", icon: "🔧",
    campos: [],
  },
  {
    chave: "fornecedores", label: "Fornecedores / Laboratórios", singular: "Fornecedor", artigo: "o", icon: "🚚",
    campos: [
      { chave: "contato", label: "Contato", tipo: "text", placeholder: "Nome ou telefone do contato" },
      { chave: "email", label: "E-mail", tipo: "email", placeholder: "contato@fornecedor.com" },
    ],
  },
  {
    chave: "pessoas", label: "Responsáveis / Pessoas", singular: "Pessoa", artigo: "a", icon: "👤",
    campos: [
      { chave: "cargo", label: "Cargo / Função", tipo: "text", placeholder: "ex: Técnico de Manutenção" },
      { chave: "email", label: "E-mail", tipo: "email", placeholder: "nome@hidrogeron.com" },
      { chave: "pin", label: "PIN de Acesso", tipo: "text", placeholder: "Somente se esta pessoa também acessar o sistema" },
    ],
  },
];

// Estado central dos cadastros mestres — populado uma única vez (memoizado)
// e reutilizado por Calibração/Preventiva/Corretiva/RNC para sugerir
// Setor/Instrumento/Responsável/Laboratório sem duplicar chamadas de rede.
const cadastrosMestresState = reactive(
  Object.fromEntries(TIPOS_CADASTRO.map(t => [t.chave, []]))
);
let cadastrosMestresPromise = null;

function normalizeCadastroItem(c, tipo) {
  const item = {
    id: c.ID || c.Id || c.id || uid(),
    nome: c.Nome || c.nome || c["Descrição"] || c.Descricao || c.descricao || "",
    ativo: parseBooleanoFlexivel(c.Ativo ?? c.ativo ?? true),
  };
  const tipoInfo = TIPOS_CADASTRO.find(t => t.chave === tipo);
  (tipoInfo ? tipoInfo.campos : []).forEach(campo => {
    const chaveCapitalizada = campo.chave.charAt(0).toUpperCase() + campo.chave.slice(1);
    item[campo.chave] = c[campo.chave] || c[chaveCapitalizada] || "";
  });
  return item;
}

// getInitialData() ainda não retorna estas coleções no backend atual — cada
// chave cai num array vazio até o Apps Script expor
// setores/tiposEquipamento/fornecedores/pessoas, mesmo padrão tolerante
// (PascalCase/camelCase/data.data) usado pelos demais extractX.
function extractCadastro(data, chave) {
  const chaveCapitalizada = chave.charAt(0).toUpperCase() + chave.slice(1);
  const raw = (data && (data[chave] || data[chaveCapitalizada] || (data.data && (data.data[chave] || data.data[chaveCapitalizada])))) || [];
  return (Array.isArray(raw) ? raw : []).map(c => normalizeCadastroItem(c, chave));
}

// Carrega (uma única vez, com memoização) as listas de cadastros mestres a
// partir de getInitialData(). Chamado tanto pela própria tela de Cadastros
// quanto no onMounted de Calibração/Preventiva/Corretiva/RNC, para que os
// selects desses módulos já apareçam preenchidos mesmo que o usuário nunca
// tenha aberto a Central de Cadastros Mestres nesta sessão.
async function carregarCadastrosMestres(forcar) {
  if (cadastrosMestresPromise && !forcar) return cadastrosMestresPromise;
  cadastrosMestresPromise = (async () => {
    const data = await getInitialData();
    TIPOS_CADASTRO.forEach(t => { cadastrosMestresState[t.chave] = extractCadastro(data, t.chave); });
    return data;
  })();
  return cadastrosMestresPromise;
}

// Lista de nomes ativos de um tipo de cadastro, pronta para popular um
// select/datalist — usada pelos demais módulos como fonte de sugestões.
function nomesCadastro(chave) {
  return (cadastrosMestresState[chave] || []).filter(i => i.ativo !== false).map(i => i.nome);
}

const CadastroFormModal = {
  props: { tipo: Object, itemEditando: Object, salvando: Boolean },
  emits: ["salvar", "fechar"],
  setup(props, { emit }) {
    const formVazio = () => {
      const base = { nome: "", ativo: true };
      (props.tipo.campos || []).forEach(c => { base[c.chave] = ""; });
      return base;
    };
    const form = reactive(props.itemEditando ? { ...formVazio(), ...props.itemEditando } : formVazio());

    function confirmar() {
      if (!form.nome.trim()) {
        pushToast(`Informe o nome d${props.tipo.artigo} ${props.tipo.singular.toLowerCase()}.`, "error");
        return;
      }
      emit("salvar", { ...form, nome: form.nome.trim() });
    }

    return { form, confirmar };
  },
  template: `
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="$emit('fechar')">
    <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
      <h3 class="font-bold text-slate-800">{{ itemEditando ? 'Editar' : 'Novo Cadastro' }}: {{ tipo.singular }}</h3>

      <div>
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nome *</label>
        <input v-model="form.nome" type="text" @keyup.enter="confirmar"
          class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
      </div>

      <div v-for="campo in tipo.campos" :key="campo.chave">
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{{ campo.label }}</label>
        <input v-model="form[campo.chave]" :type="campo.tipo" :placeholder="campo.placeholder || ''" @keyup.enter="confirmar"
          class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
      </div>

      <div v-if="itemEditando">
        <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Status</label>
        <select v-model="form.ativo" class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
          <option :value="true">Ativo</option>
          <option :value="false">Inativo</option>
        </select>
      </div>

      <div class="flex gap-2 pt-1">
        <button @click="$emit('fechar')" :disabled="salvando" class="btn-tap flex-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-semibold py-2.5 rounded-lg text-sm">Cancelar</button>
        <button @click="confirmar" :disabled="salvando" class="btn-tap flex-1 flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm">
          <span v-if="salvando" class="spinner"></span><span>{{ salvando ? "Salvando..." : "Salvar" }}</span>
        </button>
      </div>
    </div>
  </div>`
};

const CadastrosMestresModule = {
  components: { CadastroFormModal },
  props: { user: Object },
  setup(props) {
    const abaAtiva = ref(TIPOS_CADASTRO[0].chave);
    const loading = ref(true);
    const erro = ref("");
    const salvando = ref(false);
    const filtroBusca = ref("");
    const souAdmin = computed(() => isAdmin(props.user));

    async function carregar() {
      loading.value = true;
      erro.value = "";
      try {
        await carregarCadastrosMestres(true);
      } catch (err) {
        console.error(err);
        erro.value = "Não foi possível carregar os cadastros mestres.";
      } finally {
        loading.value = false;
      }
    }
    onMounted(carregar);

    const tipoAtivo = computed(() => TIPOS_CADASTRO.find(t => t.chave === abaAtiva.value));
    const listaAtiva = computed(() => cadastrosMestresState[abaAtiva.value] || []);
    const listaFiltrada = computed(() => {
      const termo = normalizarTexto(filtroBusca.value.trim());
      if (!termo) return listaAtiva.value;
      return listaAtiva.value.filter(item => {
        const campos = [item.nome, ...(tipoAtivo.value.campos || []).map(c => item[c.chave])];
        return campos.some(v => normalizarTexto(String(v || "")).includes(termo));
      });
    });
    function trocarAba(chave) {
      abaAtiva.value = chave;
      filtroBusca.value = "";
    }

    // ===== Modal de criação/edição =====
    const modalAberto = ref(false);
    const itemEditando = ref(null);
    function abrirNovo() {
      itemEditando.value = null;
      modalAberto.value = true;
    }
    function abrirEdicao(item) {
      itemEditando.value = item;
      modalAberto.value = true;
    }
    function fecharModal() {
      modalAberto.value = false;
      itemEditando.value = null;
    }

    async function salvarItem(dadosForm) {
      salvando.value = true;
      try {
        const editando = itemEditando.value;
        const id = editando ? editando.id : "CAD-" + Date.now();
        const payload = { id, ...dadosForm };
        const resp = await saveCadastroApi(abaAtiva.value, payload);
        if (resp && resp.status === "error") throw new Error(resp.message || "Erro ao salvar.");
        if (editando) {
          const idx = cadastrosMestresState[abaAtiva.value].findIndex(i => i.id === editando.id);
          if (idx !== -1) cadastrosMestresState[abaAtiva.value][idx] = { ...payload };
        } else {
          cadastrosMestresState[abaAtiva.value] = [...cadastrosMestresState[abaAtiva.value], { ...payload }];
        }
        pushToast(`${tipoAtivo.value.singular} ${editando ? "atualizado" : "cadastrado"} com sucesso!`, "success");
        fecharModal();
      } catch (err) {
        console.error(err);
        pushToast("Erro ao salvar. Tente novamente.", "error");
      } finally {
        salvando.value = false;
      }
    }

    // ===== Exclusão =====
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
        cadastrosMestresState[abaAtiva.value] = cadastrosMestresState[abaAtiva.value].filter(i => i.id !== alvo.id);
        pushToast(`${tipoAtivo.value.singular} excluído com sucesso!`, "success");
        excluirAlvo.value = null;
      } catch (err) {
        console.error(err);
        pushToast("Erro ao excluir. Tente novamente.", "error");
      } finally {
        excluindo.value = false;
      }
    }

    // ===== Inativar / Reativar (sem excluir o registro) =====
    async function alternarAtivo(item) {
      const novoAtivo = !item.ativo;
      try {
        const resp = await saveCadastroApi(abaAtiva.value, { ...item, ativo: novoAtivo });
        if (resp && resp.status === "error") throw new Error(resp.message || "Erro ao atualizar status.");
        item.ativo = novoAtivo;
        pushToast(`${tipoAtivo.value.singular} ${novoAtivo ? "reativado" : "inativado"}.`, "success");
      } catch (err) {
        console.error(err);
        pushToast("Erro ao atualizar status. Tente novamente.", "error");
      }
    }

    return {
      TIPOS_CADASTRO, abaAtiva, loading, erro, salvando, tipoAtivo, listaAtiva, listaFiltrada, filtroBusca,
      trocarAba, souAdmin, excluirAlvo, excluindo, pedirExclusao, cancelarExclusao, confirmarExclusao, carregar,
      modalAberto, itemEditando, abrirNovo, abrirEdicao, fecharModal, salvarItem, alternarAtivo,
    };
  },
  template: `
  <div>
    <div class="mb-6">
      <h1 class="text-xl sm:text-2xl font-extrabold text-slate-800">Central de Cadastros Mestres</h1>
      <p class="text-slate-500 text-sm mt-1">Setores, Tipos de Equipamentos, Fornecedores/Laboratórios e Responsáveis usados nos demais módulos.</p>
    </div>

    <div class="flex gap-2 flex-wrap mb-4">
      <button v-for="t in TIPOS_CADASTRO" :key="t.chave" @click="trocarAba(t.chave)"
        class="btn-tap px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5"
        :class="abaAtiva === t.chave ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-600'">
        <span>{{ t.icon }}</span><span>{{ t.label }}</span>
      </button>
    </div>

    <div class="flex flex-col sm:flex-row gap-2 mb-4">
      <div class="relative flex-1">
        <input v-model="filtroBusca" type="text" placeholder="Buscar..."
          class="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M18 10.5a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z"/>
        </svg>
      </div>
      <button v-if="souAdmin" @click="abrirNovo"
        class="btn-tap bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm whitespace-nowrap">
        + Novo Cadastro
      </button>
    </div>

    <div v-if="loading" class="flex justify-center py-8 text-slate-400">
      <span class="spinner !border-slate-300 !border-t-sky-600"></span>
    </div>
    <div v-else-if="erro" class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{{ erro }}</div>
    <div v-else-if="listaFiltrada.length === 0" class="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-400">
      {{ filtroBusca ? "Nenhum resultado para a busca." : ("Nenhum" + (tipoAtivo.artigo === 'a' ? 'a' : '') + " " + tipoAtivo.singular.toLowerCase() + " cadastrad" + (tipoAtivo.artigo === 'a' ? 'a' : 'o') + " ainda.") }}
    </div>
    <div v-else class="bg-white rounded-xl border border-slate-200 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
          <tr>
            <th class="px-4 py-2.5 text-left">Nome</th>
            <th v-for="campo in tipoAtivo.campos" :key="campo.chave" class="px-4 py-2.5 text-left whitespace-nowrap">{{ campo.label }}</th>
            <th class="px-4 py-2.5 text-left">Status</th>
            <th v-if="souAdmin" class="px-4 py-2.5 text-right">Ações</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="item in listaFiltrada" :key="item.id">
            <td class="px-4 py-3 font-medium text-slate-800">{{ item.nome }}</td>
            <td v-for="campo in tipoAtivo.campos" :key="campo.chave" class="px-4 py-3 text-slate-600">{{ item[campo.chave] || "-" }}</td>
            <td class="px-4 py-3">
              <span class="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                :class="item.ativo !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'">
                {{ item.ativo !== false ? "Ativo" : "Inativo" }}
              </span>
            </td>
            <td v-if="souAdmin" class="px-4 py-3">
              <div class="flex items-center justify-end gap-1.5">
                <button @click="abrirEdicao(item)" title="Editar" class="btn-tap w-7 h-7 flex items-center justify-center rounded-md bg-sky-50 hover:bg-sky-100 text-sky-600 shrink-0">✏️</button>
                <button @click="alternarAtivo(item)" :title="item.ativo !== false ? 'Inativar' : 'Reativar'" class="btn-tap w-7 h-7 flex items-center justify-center rounded-md bg-amber-50 hover:bg-amber-100 text-amber-600 shrink-0">{{ item.ativo !== false ? "⏸️" : "▶️" }}</button>
                <button @click="pedirExclusao(item)" title="Excluir" class="btn-tap w-7 h-7 flex items-center justify-center rounded-md bg-red-50 hover:bg-red-100 text-red-600 shrink-0">🗑️</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <cadastro-form-modal v-if="modalAberto" :tipo="tipoAtivo" :item-editando="itemEditando" :salvando="salvando"
      @salvar="salvarItem" @fechar="fecharModal"></cadastro-form-modal>

    <div v-if="excluirAlvo" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="cancelarExclusao">
      <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4">
        <h3 class="font-bold text-slate-800">Excluir {{ tipoAtivo.singular.toLowerCase() }}?</h3>
        <p class="text-sm text-slate-600">Esta ação remove definitivamente <span class="font-semibold">{{ excluirAlvo.nome }}</span> da base de dados. Não pode ser desfeita. Para apenas suspender o uso sem perder o histórico, use "Inativar".</p>
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
