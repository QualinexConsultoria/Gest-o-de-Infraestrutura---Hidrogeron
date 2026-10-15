/* ==========================================================================
   js/modulos/calibracao.js — Módulo de Calibração & Medição
   Controle Metrológico, Certificados RBC, Vencimentos e Filtros
   ========================================================================== */

const CalibracaoModule = {
  props: { user: Object },
  emits: ["go-home"],
  setup(props) {
    const instrumentos = ref([]);
    const loading = ref(true);
    const erro = ref("");

    // Filtros
    const busca = ref("");
    const filtroSetor = ref("todos");
    const filtroStatus = ref("todos");

    // Modal
    const modalCadastroAberto = ref(false);
    const gravando = ref(false);

    // Formulário de Cadastro / Edição
    const formInstrumento = reactive({
      tag: "",
      instrumento: "",
      modelo: "",
      capacidade: "",
      criterioAceitacao: "",
      numeroSerie: "",
      certificadoRbc: "",
      laboratorio: "",
      setor: "TESTE",
      operador: "",
      dataCalibracao: "",
      vencimentoCalibracao: "",
      dataChecagem: "",
      vencimentoChecagem: "",
      status: "NO PRAZO",
      observacoes: "",
      anexoUrl: "",
      anexoNome: "",
      anexoBase64: ""
    });

    function calcularStatus(dataVenc, statusManual) {
      if (typeof window.statusInstrumentoCalibracao === "function") {
        return window.statusInstrumentoCalibracao(dataVenc, statusManual);
      }
      const sm = String(statusManual || "").toLowerCase();
      if (sm.includes("calibra")) return "Em Calibração";
      if (!dataVenc) return "No Prazo";
      const dv = new Date(dataVenc);
      if (isNaN(dv.getTime())) return "No Prazo";
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      dv.setHours(0, 0, 0, 0);
      const diff = Math.ceil((dv.getTime() - hoje.getTime()) / 86400000);
      if (diff < 0) return "Vencido";
      if (diff <= 45) return "Atenção (< 45d)";
      return "No Prazo";
    }

    async function carregarDados(force = false) {
      loading.value = true;
      erro.value = "";
      try {
        const raw = await getInitialData(force);
        const base = (raw && raw.data) ? raw.data : (raw || {});

        const lista = base.calibracoes || base.Calibracoes || base.Calibracoes_Controle || [];
        instrumentos.value = (Array.isArray(lista) ? lista : []).map(item => {
          const dtVenc = item.Vencimento_Calibracao || item.vencimentoCalibracao || item.Vencimento || item.vencimento || "";
          const dtCal = item.Data_Calibracao || item.dataCalibracao || item.Data || item.data || "";
          const statusCalculado = calcularStatus(dtVenc, item.Status || item.status);
          const linkLaudo = item.Anexo_Laudo || item.anexoUrl || item.Certificado_Link || item.Link_Certificado || item.Link || "";

          return {
            ...item,
            tag: item.TAG || item.tag || item.Codigo || item.ID || "",
            instrumento: item.Descricao || item.Instrumento || item.instrumento || item.Nome || "",
            modelo: item.Marca_Modelo || item.Modelo || item.modelo || "",
            capacidade: item.Capacidade || item.capacidade || "",
            criterio: item.Criterio_Aceitacao || item.criterioAceitacao || item.Criterio || "",
            numeroSerie: item.Numero_Serie || item.numeroSerie || item.Serie || "",
            certificadoRbc: item.Certificado_RBC || item.certificadoRbc || item.Certificado || "",
            laboratorio: item.Laboratorio || item.laboratorio || item.Fornecedor || "",
            setor: item.Setor || item.setor || item.Area || item.area || "Geral",
            operador: item.Operador_Responsavel || item.operador || item.Responsavel || "",
            dataCalibracao: dtCal ? String(dtCal).slice(0, 10) : "",
            vencimento: dtVenc ? String(dtVenc).slice(0, 10) : "",
            dataChecagem: item.Data_Checagem ? String(item.Data_Checagem).slice(0, 10) : (item.dataChecagem ? String(item.dataChecagem).slice(0, 10) : ""),
            vencimentoChecagem: item.Vencimento_Checagem ? String(item.Vencimento_Checagem).slice(0, 10) : (item.vencimentoChecagem ? String(item.vencimentoChecagem).slice(0, 10) : ""),
            observacoes: item.Observacoes || item.observacoes || "",
            anexoUrl: linkLaudo,
            statusCalculado
          };
        });

      } catch (err) {
        console.warn("Aviso ao carregar calibração:", err);
        erro.value = "Não foi possível carregar os registros de Calibração & Medição.";
      } finally {
        loading.value = false;
      }
    }

    const setoresDisponiveis = computed(() => {
      const s = new Set();
      instrumentos.value.forEach(i => {
        if (i.setor) s.add(String(i.setor).trim());
      });
      return Array.from(s).sort();
    });

    const contadores = computed(() => {
      let noPrazo = 0;
      let atencao = 0;
      let vencidos = 0;
      let emCalibracao = 0;

      instrumentos.value.forEach(i => {
        const st = i.statusCalculado;
        if (st === "No Prazo") noPrazo++;
        else if (st === "Atenção (< 45d)") atencao++;
        else if (st === "Vencido") vencidos++;
        else if (st === "Em Calibração") emCalibracao++;
      });

      return { noPrazo, atencao, vencidos, emCalibracao };
    });

    const instrumentosFiltrados = computed(() => {
      let lista = instrumentos.value;

      const b = busca.value.trim().toLowerCase();
      if (b) {
        lista = lista.filter(i => {
          const combo = `${i.tag} ${i.instrumento} ${i.modelo} ${i.setor} ${i.operador} ${i.certificadoRbc}`.toLowerCase();
          return combo.includes(b);
        });
      }

      if (filtroSetor.value !== "todos") {
        lista = lista.filter(i => i.setor === filtroSetor.value);
      }

      if (filtroStatus.value !== "todos") {
        lista = lista.filter(i => i.statusCalculado === filtroStatus.value);
      }

      return lista;
    });

    function manipularUploadArquivo(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      if (file.size > 15 * 1024 * 1024) {
        pushToast("O arquivo é maior que 15MB. Utilize o link direto do Google Drive.", "error");
        return;
      }

      formInstrumento.anexoNome = file.name;
      const reader = new FileReader();
      reader.onload = (event) => {
        formInstrumento.anexoBase64 = event.target.result;
      };
      reader.readAsDataURL(file);
    }

    function abrirModalCadastro(inst = null) {
      if (inst) {
        formInstrumento.tag = inst.tag;
        formInstrumento.instrumento = inst.instrumento;
        formInstrumento.modelo = inst.modelo;
        formInstrumento.capacidade = inst.capacidade;
        formInstrumento.criterioAceitacao = inst.criterio;
        formInstrumento.numeroSerie = inst.numeroSerie;
        formInstrumento.certificadoRbc = inst.certificadoRbc;
        formInstrumento.laboratorio = inst.laboratorio;
        formInstrumento.setor = inst.setor;
        formInstrumento.operador = inst.operador;
        formInstrumento.dataCalibracao = inst.dataCalibracao;
        formInstrumento.vencimentoCalibracao = inst.vencimento;
        formInstrumento.dataChecagem = inst.dataChecagem;
        formInstrumento.vencimentoChecagem = inst.vencimentoChecagem;
        formInstrumento.status = inst.statusCalculado || "NO PRAZO";
        formInstrumento.observacoes = inst.observacoes;
        formInstrumento.anexoUrl = inst.anexoUrl || "";
        formInstrumento.anexoNome = inst.anexoUrl ? "Certificado Vinculado" : "";
        formInstrumento.anexoBase64 = "";
      } else {
        Object.keys(formInstrumento).forEach(k => formInstrumento[k] = "");
        formInstrumento.setor = "TESTE";
        formInstrumento.status = "NO PRAZO";
      }
      modalCadastroAberto.value = true;
    }

    async function salvarInstrumento() {
      if (!formInstrumento.tag || !formInstrumento.instrumento) {
        pushToast("Preencha a TAG e o Nome do Instrumento.", "error");
        return;
      }

      gravando.value = true;
      try {
        const payload = {
          action: "saveCadastro",
          tipo: "calibracao_instrumento",
          tag: formInstrumento.tag.trim().toUpperCase(),
          instrumento: formInstrumento.instrumento.trim().toUpperCase(),
          modelo: formInstrumento.modelo.trim().toUpperCase(),
          capacidade: formInstrumento.capacidade.trim().toUpperCase(),
          criterioAceitacao: formInstrumento.criterioAceitacao.trim().toUpperCase(),
          numeroSerie: formInstrumento.numeroSerie.trim().toUpperCase(),
          certificadoRbc: formInstrumento.certificadoRbc.trim().toUpperCase(),
          laboratorio: formInstrumento.laboratorio.trim().toUpperCase(),
          setor: formInstrumento.setor.trim().toUpperCase(),
          operador: formInstrumento.operador.trim().toUpperCase(),
          dataCalibracao: formInstrumento.dataCalibracao,
          vencimentoCalibracao: formInstrumento.vencimentoCalibracao,
          dataChecagem: formInstrumento.dataChecagem,
          vencimentoChecagem: formInstrumento.vencimentoChecagem,
          status: formInstrumento.status,
          observacoes: formInstrumento.observacoes.trim().toUpperCase(),
          anexoUrl: formInstrumento.anexoUrl,
          anexoNome: formInstrumento.anexoNome,
          anexoBase64: formInstrumento.anexoBase64
        };

        const resp = await postToAppsScript(payload);

        // Atualização reativa imediata na tabela
        const idx = instrumentos.value.findIndex(i => i.tag.toUpperCase() === payload.tag);
        const itemAtualizado = {
          tag: payload.tag,
          instrumento: payload.instrumento,
          modelo: payload.modelo,
          capacidade: payload.capacidade,
          criterio: payload.criterioAceitacao,
          numeroSerie: payload.numeroSerie,
          certificadoRbc: payload.certificadoRbc,
          laboratorio: payload.laboratorio,
          setor: payload.setor,
          operador: payload.operador,
          dataCalibracao: payload.dataCalibracao,
          vencimento: payload.vencimentoCalibracao,
          dataChecagem: payload.dataChecagem,
          vencimentoChecagem: payload.vencimentoChecagem,
          observacoes: payload.observacoes,
          anexoUrl: resp.linkCertificado || payload.anexoUrl,
          statusCalculado: calcularStatus(payload.vencimentoCalibracao, payload.status)
        };

        if (idx !== -1) {
          instrumentos.value[idx] = { ...instrumentos.value[idx], ...itemAtualizado };
        } else {
          instrumentos.value.unshift(itemAtualizado);
        }

        pushToast("Instrumento gravado com sucesso!", "success");
        modalCadastroAberto.value = false;

        // Recarrega em segundo plano
        carregarDados(true);
      } catch (err) {
        console.error("Erro ao salvar:", err);
        pushToast("Erro ao gravar instrumento. Tente utilizar o link do Drive se o arquivo for muito grande.", "error");
      } finally {
        gravando.value = false;
      }
    }

    onMounted(carregarDados);

    return {
      instrumentos, loading, erro, busca, filtroSetor, filtroStatus,
      setoresDisponiveis, contadores, instrumentosFiltrados,
      modalCadastroAberto, formInstrumento, gravando,
      abrirModalCadastro, salvarInstrumento, manipularUploadArquivo, carregarDados
    };
  },
  template: `
  <div class="space-y-4">
    <!-- CARDS DE STATUS -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div class="flex items-center gap-2 mb-1">
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wide">No Prazo (> 45d)</span>
        </div>
        <p class="text-2xl font-black text-slate-800">{{ contadores.noPrazo }}</p>
      </div>

      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div class="flex items-center gap-2 mb-1">
          <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wide">Atenção (≤ 45d)</span>
        </div>
        <p class="text-2xl font-black text-amber-600">{{ contadores.atencao }}</p>
      </div>

      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div class="flex items-center gap-2 mb-1">
          <span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wide">Vencidos</span>
        </div>
        <p class="text-2xl font-black text-rose-600">{{ contadores.vencidos }}</p>
      </div>

      <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div class="flex items-center gap-2 mb-1">
          <span class="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wide">Em Calibração</span>
        </div>
        <p class="text-2xl font-black text-sky-600">{{ contadores.emCalibracao }}</p>
      </div>
    </div>

    <!-- BARRA DE BUSCA, FILTROS E AÇÃO -->
    <div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm flex flex-col sm:flex-row gap-2 items-center justify-between">
      <div class="flex-1 w-full sm:w-auto">
        <input v-model="busca" type="text" placeholder="Buscar por TAG, instrumento, modelo, setor ou operador..."
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none" />
      </div>

      <div class="flex flex-wrap gap-2 w-full sm:w-auto items-center">
        <select v-model="filtroSetor" class="rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white">
          <option value="todos">Setor: Todos</option>
          <option v-for="s in setoresDisponiveis" :key="s" :value="s">{{ s }}</option>
        </select>

        <select v-model="filtroStatus" class="rounded-lg border border-slate-300 px-2.5 py-2 text-xs bg-white">
          <option value="todos">Status: Todos</option>
          <option value="No Prazo">No Prazo</option>
          <option value="Atenção (< 45d)">Atenção (≤ 45d)</option>
          <option value="Vencido">Vencido</option>
          <option value="Em Calibração">Em Calibração</option>
        </select>

        <button @click="abrirModalCadastro()" class="btn-tap px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm">
          + Novo Cadastro
        </button>
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-12"><span class="spinner"></span></div>
    <div v-if="erro" class="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl text-xs font-semibold">{{ erro }}</div>

    <!-- TABELA DE INSTRUMENTOS -->
    <div v-if="!loading" class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-xs text-left">
          <thead class="bg-slate-50 text-slate-500 border-b border-slate-200 text-[10px] uppercase font-bold tracking-wide">
            <tr>
              <th class="p-3">TAG</th>
              <th class="p-3">Instrumento / Modelo</th>
              <th class="p-3">Capacidade / Critério</th>
              <th class="p-3">Setor</th>
              <th class="p-3">Operador</th>
              <th class="p-3">Data Calibração</th>
              <th class="p-3">Vencimento</th>
              <th class="p-3 text-center">Laudo</th>
              <th class="p-3 text-center">Status</th>
              <th class="p-3 text-center w-20">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="inst in instrumentosFiltrados" :key="inst.tag" class="hover:bg-slate-50/80">
              <td class="p-3 font-mono font-bold text-sky-900 bg-sky-50/50">{{ inst.tag }}</td>
              <td class="p-3">
                <p class="font-bold text-slate-800">{{ inst.instrumento }}</p>
                <p class="text-[10px] text-slate-400">{{ inst.modelo || 'Padrão' }} • RBC: {{ inst.certificadoRbc || 'S/N' }}</p>
              </td>
              <td class="p-3">
                <p class="text-slate-700">{{ inst.capacidade || '—' }}</p>
                <p class="text-[10px] text-slate-400">Critério: {{ inst.criterio || '—' }}</p>
              </td>
              <td class="p-3 text-slate-600 font-medium">{{ inst.setor }}</td>
              <td class="p-3 text-slate-600">{{ inst.operador || '—' }}</td>
              <td class="p-3 font-mono text-slate-600">{{ inst.dataCalibracao || '—' }}</td>
              <td class="p-3 font-mono font-bold" :class="inst.statusCalculado === 'Vencido' ? 'text-rose-600' : 'text-slate-800'">
                {{ inst.vencimento || '—' }}
              </td>
              <td class="p-3 text-center">
                <a v-if="inst.anexoUrl" :href="inst.anexoUrl" target="_blank" class="px-2 py-1 rounded bg-sky-50 text-sky-700 hover:bg-sky-100 font-bold text-[10px] inline-flex items-center gap-1 border border-sky-200">
                  📄 Ver
                </a>
                <span v-else class="text-slate-300 text-[10px]">Sem anexo</span>
              </td>
              <td class="p-3 text-center">
                <span v-if="inst.statusCalculado === 'No Prazo'" class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  No Prazo
                </span>
                <span v-else-if="inst.statusCalculado === 'Atenção (< 45d)'" class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  Atenção
                </span>
                <span v-else-if="inst.statusCalculado === 'Vencido'" class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
                  Vencido
                </span>
                <span v-else class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                  {{ inst.statusCalculado }}
                </span>
              </td>
              <td class="p-3 text-center">
                <button @click="abrirModalCadastro(inst)" class="text-sky-600 hover:text-sky-800 font-bold text-[11px]">
                  Editar
                </button>
              </td>
            </tr>
            <tr v-if="instrumentosFiltrados.length === 0">
              <td colspan="10" class="p-8 text-center text-slate-400">Nenhum instrumento de medição encontrado com os filtros atuais.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- MODAL CADASTRO / EDIÇÃO COM ANEXO DE CERTIFICADO -->
    <div v-if="modalCadastroAberto" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" @click.self="modalCadastroAberto = false">
      <div class="bg-white w-full max-w-xl rounded-2xl shadow-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto text-xs">
        <div class="flex items-center justify-between border-b pb-3">
          <div>
            <h3 class="font-extrabold text-slate-800 text-sm">
              {{ formInstrumento.tag ? 'Editar Instrumento' : 'Novo Instrumento de Medição' }}
            </h3>
            <p class="text-[11px] text-slate-400 mt-0.5">Controle Metrológico e Monitoramento</p>
          </div>
          <button @click="modalCadastroAberto = false" class="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-600 mb-1">TAG / Código *</label>
            <input v-model="formInstrumento.tag" type="text" placeholder="Ex: CAL-031" class="w-full border border-slate-300 rounded-lg p-2 uppercase" />
          </div>
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Instrumento *</label>
            <input v-model="formInstrumento.instrumento" type="text" placeholder="Ex: TERMÔMETRO DIGITAL" class="w-full border border-slate-300 rounded-lg p-2 uppercase" />
          </div>
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Marca / Modelo</label>
            <input v-model="formInstrumento.modelo" type="text" placeholder="Ex: MINIPA MT-320B" class="w-full border border-slate-300 rounded-lg p-2 uppercase" />
          </div>
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Capacidade</label>
            <input v-model="formInstrumento.capacidade" type="text" placeholder="Ex: 600°C" class="w-full border border-slate-300 rounded-lg p-2 uppercase" />
          </div>
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Critério de Aceitação</label>
            <input v-model="formInstrumento.criterioAceitacao" type="text" placeholder="Ex: ±6%" class="w-full border border-slate-300 rounded-lg p-2 uppercase" />
          </div>
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Número de Série</label>
            <input v-model="formInstrumento.numeroSerie" type="text" placeholder="Ex: 1858956" class="w-full border border-slate-300 rounded-lg p-2 uppercase" />
          </div>
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Certificado RBC</label>
            <input v-model="formInstrumento.certificadoRbc" type="text" placeholder="Ex: 2627/26" class="w-full border border-slate-300 rounded-lg p-2 uppercase" />
          </div>
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Laboratório / Fornecedor</label>
            <input v-model="formInstrumento.laboratorio" type="text" placeholder="Ex: RBC / MSMI - MEDICAO" class="w-full border border-slate-300 rounded-lg p-2 uppercase" />
          </div>
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Setor</label>
            <select v-model="formInstrumento.setor" class="w-full border border-slate-300 rounded-lg p-2 bg-white uppercase">
              <option value="TESTE">TESTE</option>
              <option value="OFICINA">OFICINA</option>
              <option value="PREPARAÇÃO">PREPARAÇÃO</option>
              <option value="COATING">COATING</option>
              <option value="METALMECÂNICA">METALMECÂNICA</option>
              <option value="HIDRÁULICA">HIDRÁULICA</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Operador Responsável</label>
            <input v-model="formInstrumento.operador" type="text" placeholder="Ex: CARLOS" class="w-full border border-slate-300 rounded-lg p-2 uppercase" />
          </div>
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Data Calibração</label>
            <input v-model="formInstrumento.dataCalibracao" type="date" class="w-full border border-slate-300 rounded-lg p-2" />
          </div>
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Vencimento Calibração</label>
            <input v-model="formInstrumento.vencimentoCalibracao" type="date" class="w-full border border-slate-300 rounded-lg p-2 font-bold" />
          </div>
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Data da Checagem</label>
            <input v-model="formInstrumento.dataChecagem" type="date" class="w-full border border-slate-300 rounded-lg p-2" />
          </div>
          <div>
            <label class="block font-semibold text-slate-600 mb-1">Vencimento da Checagem</label>
            <input v-model="formInstrumento.vencimentoChecagem" type="date" class="w-full border border-slate-300 rounded-lg p-2" />
          </div>
        </div>

        <!-- SEÇÃO DE ANEXO DO CERTIFICADO / LAUDO DE CALIBRAÇÃO -->
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
          <div class="flex items-center justify-between">
            <label class="block font-bold text-slate-700 uppercase text-[10px] tracking-wide">
              📎 Certificado / Laudo de Calibração (RBC)
            </label>
            <span v-if="formInstrumento.anexoUrl" class="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
              Certificado Vinculado
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] text-slate-500 mb-1 font-semibold">Subir Arquivo (PDF ou Imagem):</label>
              <input type="file" @change="manipularUploadArquivo" accept=".pdf,image/*" 
                class="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-sky-600 file:text-white hover:file:bg-sky-700 cursor-pointer" />
              <p v-if="formInstrumento.anexoNome" class="text-[10px] text-sky-800 font-semibold mt-1">
                Arquivo: {{ formInstrumento.anexoNome }}
              </p>
            </div>
            <div>
              <label class="block text-[10px] text-slate-500 mb-1 font-semibold">Ou Link Direto (Google Drive / URL):</label>
              <input v-model="formInstrumento.anexoUrl" type="url" placeholder="https://..." 
                class="w-full border border-slate-300 rounded-lg p-2 bg-white text-xs" />
            </div>
          </div>

          <div v-if="formInstrumento.anexoUrl" class="pt-1">
            <a :href="formInstrumento.anexoUrl" target="_blank" class="text-xs text-sky-700 hover:text-sky-900 font-bold underline inline-flex items-center gap-1">
              ↗ Visualizar Certificado em Nova Aba
            </a>
          </div>
        </div>

        <div>
          <label class="block font-semibold text-slate-600 mb-1">Observações</label>
          <textarea v-model="formInstrumento.observacoes" rows="2" placeholder="Observações do instrumento..." class="w-full border border-slate-300 rounded-lg p-2 uppercase"></textarea>
        </div>

        <div class="flex justify-end gap-2 border-t pt-3">
          <button @click="modalCadastroAberto = false" class="btn-tap px-4 py-2 rounded-lg bg-slate-100 text-slate-600 font-semibold">Cancelar</button>
          <button @click="salvarInstrumento" :disabled="gravando" class="btn-tap px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-md">
            {{ gravando ? 'Gravando...' : 'Gravar Instrumento' }}
          </button>
        </div>
      </div>
    </div>
  </div>`
};

window.CalibracaoModule = CalibracaoModule;