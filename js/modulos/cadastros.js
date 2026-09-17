/* ==========================================================================
   js/modulos/cadastros.js — Central de Cadastros Mestres & Gestão de Usuários
   Inclui: Setores, Equipamentos, Fornecedores, Pessoas, Usuários e RBAC (Grupos & Permissões)
   ========================================================================== */

const MODULOS_SISTEMA = [
  { id: "dashboard", nome: "Dashboard Geral", permiteEditar: false, permiteBaixar: true },
  { id: "preventiva", nome: "Manutenção Preventiva", permiteEditar: true, permiteBaixar: true },
  { id: "corretiva", nome: "Manutenção Corretiva", permiteEditar: true, permiteBaixar: true },
  { id: "ativos", nome: "Gestão de Ativos", permiteEditar: true, permiteBaixar: true },
  { id: "calibracao", nome: "Calibração & Medição", permiteEditar: true, permiteBaixar: true },
  { id: "kpis", nome: "Indicadores (KPIs)", permiteEditar: false, permiteBaixar: true },
  { id: "rpnc", nome: "Registro de Desvios (RNC)", permiteEditar: true, permiteBaixar: true },
  { id: "cadastros", nome: "Central de Cadastros", permiteEditar: true, permiteBaixar: false }
];

// Estado global em memória para prover dados rápidos a outros módulos
window._cacheCadastrosMestres = window._cacheCadastrosMestres || {
  setores: [],
  tiposEquipamento: [],
  fornecedores: [],
  pessoas: [],
  usuarios: [],
  grupos: []
};

// Função global de sincronização chamada pelos módulos dependentes
window.carregarCadastrosMestres = async function(forcar) {
  try {
    if (!forcar && window._cacheCadastrosMestres.setores && window._cacheCadastrosMestres.setores.length > 0) {
      return window._cacheCadastrosMestres;
    }
    const data = await getInitialData();
    window._cacheCadastrosMestres.setores = data.setores || [];
    window._cacheCadastrosMestres.tiposEquipamento = data.tiposEquipamento || [];
    window._cacheCadastrosMestres.fornecedores = data.fornecedores || [];
    window._cacheCadastrosMestres.pessoas = data.pessoas || [];
    window._cacheCadastrosMestres.usuarios = data.usuarios || [];
    return window._cacheCadastrosMestres;
  } catch (e) {
    console.error("Falha ao sincronizar carregarCadastrosMestres:", e);
    return window._cacheCadastrosMestres;
  }
};

const CadastrosMestresModule = {
  props: { user: Object },
  emits: ["go-home"],
  setup(props) {
    const abaAtiva = ref("setores");
    const busca = ref("");
    const loading = ref(false);
    const salvando = ref(false);

    // Listas locais
    const setores = ref([]);
    const tiposEquipamento = ref([]);
    const fornecedores = ref([]);
    const pessoas = ref([]);
    const usuarios = ref([]);
    const grupos = ref([]);

    // Modal Usuário (Cadastro & Edição)
    const modalUsuarioAberta = ref(false);
    const modoEdicaoUsuario = ref(false);
    const usuarioForm = reactive({
      id: "",
      nome: "",
      email: "",
      cargo: "",
      setor: "",
      perfil: "COLABORADOR",
      pin: "",
      ativo: true
    });

    // Modal Alterar PIN
    const modalPinAberta = ref(false);
    const pinForm = reactive({ id: "", nome: "", novoPin: "" });
    const pinsVisiveis = reactive({});

    // Modal Grupos & Permissões (RBAC)
    const modalGrupoAberta = ref(false);
    const grupoForm = reactive({
      id: "",
      nome: "",
      descricao: "",
      permissoes: {}
    });

    const isAdmin = computed(() => {
      const p = (props.user && props.user.perfil || props.user?.Funcao || "").toUpperCase();
      return p === "ADMINISTRADOR" || p === "ADMIN";
    });

    const totalAdminsAtivos = computed(() => {
      return usuarios.value.filter(u => {
        const p = (u.Funcao || u.perfil || u.Cargo || "").toUpperCase();
        return (p === "ADMINISTRADOR" || p === "ADMIN") && u.ativo !== false;
      }).length;
    });

    async function carregarTudo() {
      loading.value = true;
      try {
        const data = await getInitialData();
        setores.value = data.setores || [];
        tiposEquipamento.value = data.tiposEquipamento || [];
        fornecedores.value = data.fornecedores || [];
        pessoas.value = data.pessoas || [];
        usuarios.value = (data.usuarios || []).map(u => ({
          ...u,
          id: u.PIN || u.id || u.ID,
          nome: u.Nome || u.Usuario || "",
          email: u.Email || "",
          cargo: u.Cargo || u.Funcao || "Colaborador",
          setor: u.Setor || "Uso Geral",
          perfil: (u.Funcao || u.perfil || u.Cargo || "COLABORADOR").toUpperCase(),
          ativo: u.Status !== "Inativo" && u.ativo !== false,
          pin: u.PIN || "",
          ultimaModificacao: u.Ultima_Modificacao || u.ultimaModificacao || ""
        }));

        // Atualiza cache global
        window._cacheCadastrosMestres.setores = setores.value;
        window._cacheCadastrosMestres.tiposEquipamento = tiposEquipamento.value;
        window._cacheCadastrosMestres.fornecedores = fornecedores.value;
        window._cacheCadastrosMestres.pessoas = pessoas.value;
        window._cacheCadastrosMestres.usuarios = usuarios.value;

        // Carrega grupos de permissão da Config_Cadastros
        const cadastros = data.cadastros || [];
        grupos.value = cadastros
          .filter(c => String(c.Categoria || c.tipo).toLowerCase() === "grupos_permissoes")
          .map(g => {
            let perms = {};
            try { perms = typeof g.Detalhes_JSON === "string" ? JSON.parse(g.Detalhes_JSON) : (g.Detalhes_JSON || {}); } catch(e) {}
            return {
              id: g.ID || g.id,
              nome: g.Nome || "",
              permissoes: perms.permissoes || {},
              atualizadoPor: perms.atualizadoPor || "",
              atualizadoEm: perms.atualizadoEm || ""
            };
          });
      } catch (err) {
        console.error("Erro ao carregar cadastros:", err);
        if (typeof pushToast === "function") pushToast("Erro ao sincronizar base de cadastros.", "error");
      } finally {
        loading.value = false;
      }
    }

    onMounted(carregarTudo);

    // ==================== CONTROLE DE USUÁRIOS ====================
    function abrirNovoUsuario() {
      modoEdicaoUsuario.value = false;
      Object.assign(usuarioForm, {
        id: "USR-" + Date.now(),
        nome: "",
        email: "",
        cargo: "",
        setor: setores.value[0] ? (setores.value[0].Nome || setores.value[0].nome) : "Uso Geral",
        perfil: "COLABORADOR",
        pin: "",
        ativo: true
      });
      modalUsuarioAberta.value = true;
    }

    function abrirEditarUsuario(u) {
      if (!isAdmin.value) return;
      modoEdicaoUsuario.value = true;
      Object.assign(usuarioForm, {
        id: u.id || u.PIN,
        nome: u.nome,
        email: u.email,
        cargo: u.cargo,
        setor: u.setor || "Uso Geral",
        perfil: u.perfil || "COLABORADOR",
        pin: "",
        ativo: u.ativo
      });
      modalUsuarioAberta.value = true;
    }

    async function salvarUsuario() {
      if (!usuarioForm.nome.trim()) return pushToast && pushToast("Informe o nome completo.", "error");
      if (!usuarioForm.email.trim()) return pushToast && pushToast("Informe o e-mail.", "error");
      if (!modoEdicaoUsuario.value && !usuarioForm.pin) return pushToast && pushToast("Defina o PIN inicial de 4 a 6 dígitos.", "error");

      if (modoEdicaoUsuario.value && usuarioForm.perfil !== "ADMINISTRADOR") {
        const itemOriginal = usuarios.value.find(u => u.id === usuarioForm.id);
        if (itemOriginal && (itemOriginal.perfil === "ADMINISTRADOR" || itemOriginal.perfil === "ADMIN") && totalAdminsAtivos.value <= 1) {
          return pushToast && pushToast("Ação bloqueada: o sistema precisa manter ao menos 1 Administrador ativo.", "error");
        }
      }

      salvando.value = true;
      try {
        const payload = {
          action: "saveUsuario",
          id: usuarioForm.id,
          PIN: usuarioForm.pin ? usuarioForm.pin : undefined,
          Nome: usuarioForm.nome.trim(),
          Email: usuarioForm.email.trim().toLowerCase(),
          Cargo: usuarioForm.cargo.trim(),
          Setor: usuarioForm.setor,
          Funcao: usuarioForm.perfil,
          Status: usuarioForm.ativo ? "Ativo" : "Inativo",
          Ultima_Modificacao: `${new Date().toLocaleDateString("pt-BR")} por ${props.user?.nome || props.user?.Nome || "Admin"}`
        };

        await apiPost(payload);
        if (typeof pushToast === "function") {
          pushToast(modoEdicaoUsuario.value ? "Colaborador atualizado com sucesso!" : "Novo colaborador cadastrado!", "success");
        }
        modalUsuarioAberta.value = false;
        await carregarTudo();
      } catch (err) {
        console.error(err);
        if (typeof pushToast === "function") pushToast("Erro ao gravar dados do colaborador.", "error");
      } finally {
        salvando.value = false;
      }
    }

    async function alternarStatusUsuario(u) {
      if (!isAdmin.value) return;
      if (u.ativo && (u.perfil === "ADMINISTRADOR" || u.perfil === "ADMIN") && totalAdminsAtivos.value <= 1) {
        return pushToast && pushToast("Não é permitido inativar o único Administrador ativo do sistema.", "error");
      }

      const novoStatus = !u.ativo;
      try {
        await apiPost({
          action: "saveUsuario",
          id: u.id || u.PIN,
          Status: novoStatus ? "Ativo" : "Inativo",
          Ultima_Modificacao: `${new Date().toLocaleDateString("pt-BR")} por ${props.user?.nome || props.user?.Nome || "Admin"}`
        });
        u.ativo = novoStatus;
        if (typeof pushToast === "function") pushToast(`Status de ${u.nome} atualizado.`, "success");
      } catch (e) {
        if (typeof pushToast === "function") pushToast("Erro ao alterar status.", "error");
      }
    }

    function abrirAlterarPin(u) {
      Object.assign(pinForm, { id: u.id || u.PIN, nome: u.nome, novoPin: "" });
      modalPinAberta.value = true;
    }

    async function salvarPin() {
      if (!pinForm.novoPin || pinForm.novoPin.length < 4) {
        return pushToast && pushToast("O PIN deve ter no mínimo 4 dígitos numéricos.", "error");
      }
      salvando.value = true;
      try {
        await apiPost({ action: "saveUsuario", id: pinForm.id, PIN: pinForm.novoPin });
        if (typeof pushToast === "function") pushToast("PIN redefinido com sucesso!", "success");
        modalPinAberta.value = false;
        await carregarTudo();
      } catch (e) {
        if (typeof pushToast === "function") pushToast("Erro ao atualizar PIN.", "error");
      } finally {
        salvando.value = false;
      }
    }

    function toggleVerPin(id) {
      pinsVisiveis[id] = !pinsVisiveis[id];
    }

    // ==================== GRUPOS & PERMISSÕES (RBAC) ====================
    function abrirNovoGrupo() {
      const permsIniciais = {};
      MODULOS_SISTEMA.forEach(m => {
        permsIniciais[m.id] = { ver: true, editar: false, baixar: false };
      });
      Object.assign(grupoForm, {
        id: "GRP-" + Date.now(),
        nome: "",
        permissoes: permsIniciais
      });
      modalGrupoAberta.value = true;
    }

    function abrirEditarGrupo(g) {
      const perms = {};
      MODULOS_SISTEMA.forEach(m => {
        perms[m.id] = {
          ver: g.permissoes?.[m.id]?.ver ?? true,
          editar: g.permissoes?.[m.id]?.editar ?? false,
          baixar: g.permissoes?.[m.id]?.baixar ?? false
        };
      });
      Object.assign(grupoForm, {
        id: g.id,
        nome: g.nome,
        permissoes: perms
      });
      modalGrupoAberta.value = true;
    }

    async function salvarGrupo() {
      if (!grupoForm.nome.trim()) return pushToast && pushToast("Dê um nome ao grupo de permissões.", "error");
      salvando.value = true;
      try {
        const payload = {
          action: "saveCadastro",
          tipo: "grupos_permissoes",
          id: grupoForm.id,
          nome: grupoForm.nome.trim(),
          permissoes: grupoForm.permissoes,
          atualizadoPor: props.user?.nome || props.user?.Nome || "Admin",
          atualizadoEm: new Date().toISOString()
        };
        await apiPost(payload);
        if (typeof pushToast === "function") pushToast("Matriz de permissões salva!", "success");
        modalGrupoAberta.value = false;
        await carregarTudo();
      } catch (err) {
        console.error(err);
        if (typeof pushToast === "function") pushToast("Erro ao gravar permissões.", "error");
      } finally {
        salvando.value = false;
      }
    }

    const listaUsuariosFiltrada = computed(() => {
      const t = busca.value.toLowerCase().trim();
      if (!t) return usuarios.value;
      return usuarios.value.filter(u => u.nome.toLowerCase().includes(t) || u.email.toLowerCase().includes(t));
    });

    return {
      abaAtiva, busca, loading, salvando, isAdmin, totalAdminsAtivos,
      setores, tiposEquipamento, fornecedores, pessoas, usuarios, grupos,
      listaUsuariosFiltrada, modulosSistema: MODULOS_SISTEMA,
      modalUsuarioAberta, modoEdicaoUsuario, usuarioForm, abrirNovoUsuario, abrirEditarUsuario, salvarUsuario, alternarStatusUsuario,
      modalPinAberta, pinForm, pinsVisiveis, abrirAlterarPin, salvarPin, toggleVerPin,
      modalGrupoAberta, grupoForm, abrirNovoGrupo, abrirEditarGrupo, salvarGrupo
    };
  },
  template: `
  <div class="space-y-5">
    <!-- Abas de Navegação -->
    <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
      <button @click="abaAtiva = 'setores'" class="btn-tap px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all"
        :class="abaAtiva === 'setores' ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'">
        Setores / Áreas
      </button>
      <button @click="abaAtiva = 'equipamentos'" class="btn-tap px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all"
        :class="abaAtiva === 'equipamentos' ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'">
        Tipos de Equipamentos
      </button>
      <button @click="abaAtiva = 'fornecedores'" class="btn-tap px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all"
        :class="abaAtiva === 'fornecedores' ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'">
        Fornecedores / Laboratórios
      </button>
      <button @click="abaAtiva = 'usuarios'" class="btn-tap px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all"
        :class="abaAtiva === 'usuarios' ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'">
        Usuários / Acessos
      </button>
      <button @click="abaAtiva = 'grupos'" class="btn-tap px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all"
        :class="abaAtiva === 'grupos' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'">
        🛡️ Grupos & Permissões
      </button>
    </div>

    <!-- ==================== ABA: USUÁRIOS / ACESSOS ==================== -->
    <div v-if="abaAtiva === 'usuarios'" class="space-y-4">
      <div class="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <input v-model="busca" type="text" placeholder="Buscar por nome ou e-mail..."
          class="w-full sm:max-w-md rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500" />
        <button v-if="isAdmin" @click="abrirNovoUsuario" class="btn-tap w-full sm:w-auto bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-sm flex items-center justify-center gap-1.5">
          + Novo Colaborador
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div v-for="u in listaUsuariosFiltrada" :key="u.id" class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
          <div class="flex items-start justify-between">
            <div>
              <h4 class="font-extrabold text-slate-800 text-sm">{{ u.nome }}</h4>
              <p class="text-xs text-slate-400">{{ u.email }}</p>
              <div class="flex items-center gap-2 mt-1">
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{{ u.cargo }}</span>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">{{ u.setor }}</span>
              </div>
            </div>
            <div class="text-right space-y-1">
              <span class="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase"
                :class="u.perfil === 'ADMINISTRADOR' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'">
                {{ u.perfil }}
              </span>
              <div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" :checked="u.ativo" @change="alternarStatusUsuario(u)" :disabled="!isAdmin" class="sr-only peer">
                  <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>
          </div>

          <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <div class="flex items-center gap-2">
              <span class="text-slate-400">PIN:</span>
              <span class="font-mono font-bold text-slate-700">{{ pinsVisiveis[u.id] ? u.pin : '••••' }}</span>
              <button @click="toggleVerPin(u.id)" class="text-[10px] text-sky-600 hover:underline">
                {{ pinsVisiveis[u.id] ? 'Ocultar' : 'Mostrar' }}
              </button>
            </div>
            <div class="flex items-center gap-2">
              <button v-if="isAdmin" @click="abrirEditarUsuario(u)" class="btn-tap text-xs font-semibold text-slate-600 hover:text-sky-600 flex items-center gap-1">
                ✏️ Editar
              </button>
              <button v-if="isAdmin" @click="abrirAlterarPin(u)" class="btn-tap text-xs font-semibold text-sky-600 hover:text-sky-700">
                🔑 Alterar PIN
              </button>
            </div>
          </div>
          <p v-if="u.ultimaModificacao" class="text-[10px] text-slate-400 italic">Modificado: {{ u.ultimaModificacao }}</p>
        </div>
      </div>
    </div>

    <!-- ==================== ABA: GRUPOS & PERMISSÕES (RBAC) ==================== -->
    <div v-if="abaAtiva === 'grupos'" class="space-y-4">
      <div class="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h3 class="font-bold text-slate-800 text-sm">Matriz de Perfis & Privilégios (RBAC)</h3>
          <p class="text-xs text-slate-400">Defina os níveis de visualização, edição e download para cada perfil.</p>
        </div>
        <button v-if="isAdmin" @click="abrirNovoGrupo" class="btn-tap bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-sm">
          + Criar Novo Grupo
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div v-for="g in grupos" :key="g.id" class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
          <div class="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h4 class="font-extrabold text-slate-800 text-sm">{{ g.nome }}</h4>
              <p v-if="g.atualizadoEm" class="text-[10px] text-slate-400">Atualizado por {{ g.atualizadoPor }}</p>
            </div>
            <button v-if="isAdmin" @click="abrirEditarGrupo(g)" class="btn-tap text-xs text-indigo-600 hover:underline font-bold">
              Configurar Permissões
            </button>
          </div>

          <table class="w-full text-xs">
            <thead>
              <tr class="text-slate-400 border-b border-slate-100 text-[10px]">
                <th class="text-left py-1">Módulo</th>
                <th class="text-center py-1">Ver</th>
                <th class="text-center py-1">Editar</th>
                <th class="text-center py-1">Exportar</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in modulosSistema" :key="m.id" class="border-b border-slate-50">
                <td class="py-1.5 font-medium text-slate-700">{{ m.nome }}</td>
                <td class="text-center">{{ g.permissoes?.[m.id]?.ver ? '✅' : '❌' }}</td>
                <td class="text-center">{{ m.permiteEditar ? (g.permissoes?.[m.id]?.editar ? '✅' : '❌') : '—' }}</td>
                <td class="text-center">{{ m.permiteBaixar ? (g.permissoes?.[m.id]?.baixar ? '✅' : '❌') : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ==================== OUTRAS ABAS (SETORES, EQUIPAMENTOS, FORNECEDORES) ==================== -->
    <div v-if="abaAtiva === 'setores'" class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <h4 class="font-bold text-slate-800 text-sm mb-3">Setores Cadastrados</h4>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div v-for="s in setores" :key="s.id || s.Nome" class="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
          {{ s.Nome || s.nome }}
        </div>
      </div>
    </div>

    <div v-if="abaAtiva === 'equipamentos'" class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <h4 class="font-bold text-slate-800 text-sm mb-3">Tipos de Equipamento</h4>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div v-for="t in tiposEquipamento" :key="t.id || t.Nome" class="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
          {{ t.Nome || t.nome }}
        </div>
      </div>
    </div>

    <div v-if="abaAtiva === 'fornecedores'" class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <h4 class="font-bold text-slate-800 text-sm mb-3">Fornecedores / Laboratórios de Calibração</h4>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div v-for="f in fornecedores" :key="f.id || f.Nome" class="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
          {{ f.Nome || f.nome }}
        </div>
      </div>
    </div>

    <!-- ==================== MODAL: NOVO / EDITAR COLABORADOR ==================== -->
    <div v-if="modalUsuarioAberta" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="font-bold text-slate-800">{{ modoEdicaoUsuario ? 'Editar Colaborador' : 'Novo Colaborador' }}</h3>
          <button @click="modalUsuarioAberta = false" class="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Nome Completo *</label>
            <input v-model="usuarioForm.nome" type="text" class="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label class="block font-semibold text-slate-600 mb-1">E-mail Corporativo *</label>
            <input v-model="usuarioForm.email" type="email" class="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-2 focus:ring-sky-500" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Cargo</label>
              <input v-model="usuarioForm.cargo" type="text" class="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Setor / Área</label>
              <select v-model="usuarioForm.setor" class="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-2 focus:ring-sky-500">
                <option v-for="s in setores" :key="s.id || s.Nome" :value="s.Nome || s.nome">{{ s.Nome || s.nome }}</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Perfil de Acesso</label>
              <select v-model="usuarioForm.perfil" class="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-2 focus:ring-sky-500">
                <option value="COLABORADOR">Colaborador</option>
                <option value="MANUTENTOR">Manutentor</option>
                <option value="QUALIDADE">Qualidade</option>
                <option value="ADMINISTRADOR">Administrador</option>
              </select>
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">
                {{ modoEdicaoUsuario ? 'Redefinir PIN (Opcional)' : 'PIN Inicial *' }}
              </label>
              <input v-model="usuarioForm.pin" type="password" maxlength="6" :placeholder="modoEdicaoUsuario ? 'Manter atual' : '4 a 6 dígitos'"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-2 focus:ring-sky-500" />
            </div>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button @click="modalUsuarioAberta = false" class="btn-tap px-4 py-2 rounded-lg bg-slate-100 text-slate-600 font-semibold text-xs">Cancelar</button>
          <button @click="salvarUsuario" :disabled="salvando" class="btn-tap px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center gap-1">
            <span v-if="salvando" class="spinner !w-3 !h-3"></span>
            <span>{{ salvando ? 'Gravando...' : (modoEdicaoUsuario ? 'Salvar Alterações' : 'Cadastrar') }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ==================== MODAL: CONFIGURAR GRUPO (RBAC) ==================== -->
    <div v-if="modalGrupoAberta" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div class="bg-white w-full max-w-xl rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="font-bold text-slate-800">Permissões de Acesso por Módulo</h3>
          <button @click="modalGrupoAberta = false" class="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">Nome do Perfil / Grupo *</label>
          <input v-model="grupoForm.nome" type="text" placeholder="Ex: Técnico de Campo, Auditor ISO"
            class="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div class="space-y-2 border border-slate-200 rounded-xl p-3">
          <table class="w-full text-xs">
            <thead>
              <tr class="text-slate-500 border-b border-slate-200 text-left">
                <th class="py-2">Módulo</th>
                <th class="py-2 text-center">Visualizar</th>
                <th class="py-2 text-center">Editar / Gravar</th>
                <th class="py-2 text-center">Exportar PDF</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in modulosSistema" :key="m.id" class="border-b border-slate-100">
                <td class="py-2.5 font-medium text-slate-700">{{ m.nome }}</td>
                <td class="py-2.5 text-center">
                  <input type="checkbox" v-model="grupoForm.permissoes[m.id].ver" class="w-4 h-4 rounded text-indigo-600" />
                </td>
                <td class="py-2.5 text-center">
                  <input v-if="m.permiteEditar" type="checkbox" v-model="grupoForm.permissoes[m.id].editar" class="w-4 h-4 rounded text-indigo-600" />
                  <span v-else class="text-slate-300">—</span>
                </td>
                <td class="py-2.5 text-center">
                  <input v-if="m.permiteBaixar" type="checkbox" v-model="grupoForm.permissoes[m.id].baixar" class="w-4 h-4 rounded text-indigo-600" />
                  <span v-else class="text-slate-300">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button @click="modalGrupoAberta = false" class="btn-tap px-4 py-2 rounded-lg bg-slate-100 text-slate-600 font-semibold text-xs">Cancelar</button>
          <button @click="salvarGrupo" :disabled="salvando" class="btn-tap px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1">
            <span v-if="salvando" class="spinner !w-3 !h-3"></span>
            <span>{{ salvando ? 'Gravando...' : 'Salvar Matriz de Permissões' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ==================== MODAL: ALTERAR PIN ==================== -->
    <div v-if="modalPinAberta" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div class="bg-white w-full max-w-xs rounded-2xl shadow-2xl p-5 space-y-4">
        <h3 class="font-bold text-slate-800 text-sm">Alterar PIN: {{ pinForm.nome }}</h3>
        <div>
          <label class="block text-xs font-semibold text-slate-600 mb-1">Novo PIN (4 a 6 dígitos)</label>
          <input v-model="pinForm.novoPin" type="password" maxlength="6" class="w-full rounded-lg border border-slate-300 p-2 text-center font-mono text-base focus:ring-2 focus:ring-sky-500" />
        </div>
        <div class="flex items-center justify-end gap-2 pt-2">
          <button @click="modalPinAberta = false" class="btn-tap px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs">Cancelar</button>
          <button @click="salvarPin" :disabled="salvando" class="btn-tap px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs">
            {{ salvando ? 'Salvando...' : 'Confirmar' }}
          </button>
        </div>
      </div>
    </div>
  </div>`
};

// ============================================================================
// REGISTRO GLOBAL DE COMPONENTES E COMPATIBILIDADE DE ROTAS
// ============================================================================
window.CadastrosMestresModule = CadastrosMestresModule;
window.CadastrosModule = CadastrosMestresModule;

// Utilitário para os módulos extraírem listas de nomes
window.nomesCadastro = function(lista, campo) {
  if (!Array.isArray(lista)) return [];
  var chave = campo || "Nome";
  return lista.map(function(item) {
    if (typeof item === "string") return item.trim();
    if (!item || typeof item !== "object") return "";
    return (item[chave] || item.Nome || item.nome || item.descricao || item.ID || "").trim();
  }).filter(function(v) { return v.length > 0; });
};

// Funções de resolução individual
window.obterNomeSetor = function(idOuNome, setores) {
  if (!Array.isArray(setores)) return idOuNome || "";
  var item = setores.find(function(x) {
    return String(x.id || x.ID || x.Nome || x.nome || "").trim().toLowerCase() === String(idOuNome || "").trim().toLowerCase();
  });
  return item ? (item.Nome || item.nome || idOuNome) : (idOuNome || "");
};

window.obterNomeResponsavel = function(idOuPin, pessoas) {
  if (!Array.isArray(pessoas)) return idOuPin || "";
  var item = pessoas.find(function(x) {
    return String(x.id || x.PIN || x.ID || x.Nome || x.nome || "").trim().toLowerCase() === String(idOuPin || "").trim().toLowerCase();
  });
  return item ? (item.Nome || item.nome || idOuPin) : (idOuPin || "");
};