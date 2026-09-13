/* ==========================================================================
   js/auth.js — Sessão, autenticação e perfis (Hidrogeron)
   Tela de login (validação de e-mail/PIN contra a aba "Usuarios"), isAdmin
   (gate de RBAC usado em toda a aplicação) e a lista de perfis atribuíveis
   a um usuário. Depende de js/api.js (getInitialData) e do núcleo
   compartilhado do index.html (normalizarTexto, pushToast).
   ========================================================================== */
const STORAGE_USER_KEY = "hidrogeron_user";
/* ==========================================================================
   TELA DE LOGIN
   ========================================================================== */
const LoginScreen = {
  emits: ["login-success"],
  setup(_, { emit }) {
    const email = ref("");
    const pin = ref("");
    const loading = ref(false);
    const errorMsg = ref("");

    async function handleLogin() {
      errorMsg.value = "";
      if (!email.value.trim() || !pin.value.trim()) {
        errorMsg.value = "Informe e-mail e PIN.";
        return;
      }
      loading.value = true;
      try {
        const data = await getInitialData();
        if (!data || data.status === "error") {
          throw new Error((data && data.message) || "Não foi possível carregar os dados iniciais.");
        }
        const usuarios = data.usuarios || data.Usuarios || (data.data && data.data.usuarios) || [];
        console.log(usuarios);

        const inputEmail = email.value.trim().toLowerCase();
        const inputPin = pin.value.trim().toString();

        const found = usuarios.find(u =>
          (u.Email || u.email || "").toString().trim().toLowerCase() === inputEmail &&
          (u.Senha_PIN || u.Senha || u.senha || u.PIN || u.pin || "").toString().trim() === inputPin
        );

        if (!found) {
          errorMsg.value = "E-mail ou PIN inválidos.";
          loading.value = false;
          return;
        }

        const user = {
          nome: found.Nome || found.nome || found.Name || "Usuário",
          email: found.Email || found.email,
          cargo: found.Cargo || found.cargo || found.Funcao || found.funcao || "",
          area: found.Area || found.area || "",
          perfil: found.Perfil || found.perfil || "Colaborador",
        };
        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
        pushToast(`Bem-vindo, ${user.nome}!`, "success");
        emit("login-success", user);
      } catch (err) {
        console.error(err);
        errorMsg.value = err && err.message
          ? err.message
          : "Erro ao conectar com o servidor. Verifique sua conexão e tente novamente.";
      } finally {
        loading.value = false;
      }
    }

    return { email, pin, loading, errorMsg, handleLogin };
  },
  template: `
  <div class="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <div class="mx-auto w-16 h-16 rounded-2xl bg-sky-500 flex items-center justify-center shadow-lg mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-9 h-9 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11 21h2m-2-3h2M4 21V9a1 1 0 011-1h3V4a1 1 0 011-1h6a1 1 0 011 1v4h3a1 1 0 011 1v12M9 8h6M9 12h6M9 16h2"/>
          </svg>
        </div>
        <h1 class="text-2xl font-extrabold text-white tracking-tight">Hidrogeron</h1>
        <p class="text-slate-300 text-sm mt-1">Gestão de Manutenção Preventiva e Corretiva</p>
      </div>

      <form @submit.prevent="handleLogin" class="bg-white rounded-2xl shadow-2xl p-6 space-y-4">
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">E-mail</label>
          <input v-model="email" type="email" autocomplete="username" placeholder="seuemail@hidrogeron.com"
            class="w-full rounded-xl border border-slate-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">PIN</label>
          <input v-model="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="••••"
            class="w-full rounded-xl border border-slate-300 px-4 py-3 text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent" />
        </div>

        <p v-if="errorMsg" class="text-red-600 text-sm font-medium">{{ errorMsg }}</p>

        <button type="submit" :disabled="loading"
          class="btn-tap w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl shadow-md transition-colors">
          <span v-if="loading" class="spinner"></span>
          <span>{{ loading ? "Entrando..." : "Entrar" }}</span>
        </button>
      </form>
      <p class="text-center text-slate-400 text-xs mt-6">© {{ new Date().getFullYear() }} Hidrogeron — Sistema Interno de Manutenção</p>
    </div>
  </div>`
};
// Gest\u00e3o Administrativa: s\u00f3 usu\u00e1rios com Perfil "Administrador" (tabela
// Usuarios) veem os bot\u00f5es de Editar/Excluir em Preventivas e Corretivas.
function isAdmin(user) {
  return normalizarTexto(user && user.perfil) === "administrador";
}
/* ==========================================================================
   MÓDULO GESTÃO DE USUÁRIOS (apenas Administrador)
   ========================================================================== */
const PERFIS_USUARIO = ["Administrador", "Colaborador", "Analista", "Coordenador", "Diretor"];
