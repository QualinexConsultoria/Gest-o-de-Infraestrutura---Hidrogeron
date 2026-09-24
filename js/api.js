/* ==========================================================================
   js/api.js — Camada de rede (Hidrogeron)
   Centraliza API_URL, o wrapper genérico apiGet e todas as funções
   save/delete/update que falam com o Apps Script. Toda requisição sai
   com o parâmetro empresaId (preparação para múltiplos tenants no mesmo
   backend — hoje só existe a empresa HIDROGERON).
   ========================================================================== */
cconst API_URL = "https://script.google.com/macros/s/SEU_ID_DO_SCRIPT_AQUI/exec";
window.extrairIdCalibracaoDoHash = function() {
  var hash = window.location.hash || "";
  var match = hash.match(/calibracao\/([^\/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
};

window.statusInstrumentoCalibracao = function(dataVenc, statusManual) {
  var sm = String(statusManual || "").toLowerCase();
  if (sm.indexOf("calibra") !== -1) return "Em Calibração";
  if (!dataVenc) return "No Prazo";
  var diff = Math.ceil((new Date(dataVenc).getTime() - new Date().setHours(0,0,0,0)) / 86400000);
  return diff < 0 ? "Vencido" : (diff <= 45 ? "Atenção (< 45d)" : "No Prazo");
};

var extrairIdCalibracaoDoHash = window.extrairIdCalibracaoDoHash;
var statusInstrumentoCalibracao = window.statusInstrumentoCalibracao;
// Preparação para múltiplas empresas (tenants) no mesmo backend: hoje só
// existe a Hidrogeron, mas toda requisição já viaja com empresaId, para que
// o Apps Script possa futuramente rotear/filtrar por empresa sem exigir uma
// nova rodada de mudanças no front-end. auth.js chama definirEmpresaAtiva()
// quando (e se) uma tela de seleção de empresa for implementada.
const EMPRESA_PADRAO = "HIDROGERON";
let empresaAtual = EMPRESA_PADRAO;
function definirEmpresaAtiva(id) {
  empresaAtual = (id || EMPRESA_PADRAO).toString().trim().toUpperCase();
}

async function handleApiResponse(res) {
  if (!res.ok) {
    throw new Error("Falha na comunicação com o servidor (HTTP " + res.status + ")");
  }
  try {
    return await res.json();
  } catch (e) {
    throw new Error("Resposta inválida do servidor (não é um JSON válido).");
  }
}

// Wrapper genérico para qualquer ação via GET.
// _t=Date.now() + cache: "no-store" quebram o cache do navegador: sem isso,
// requisições idênticas (mesma URL/querystring) podem voltar com uma resposta
// antiga em cache, escondendo uma escrita que já foi salva na planilha.
async function apiGet(params) {
  const qs = new URLSearchParams({ empresaId: empresaAtual, ...params, _t: Date.now() }).toString();
  let res;
  try {
    res = await fetch(`${API_URL}?${qs}`, { method: "GET", redirect: "follow", cache: "no-store" });
  } catch (networkErr) {
    console.error("Erro de rede/CORS no GET:", networkErr);
    throw new Error("Não foi possível conectar ao servidor (rede ou CORS).");
  }
  return handleApiResponse(res);
}

// Chamada explícita usada para autenticação e carga inicial de dados.
// GET simples (sem headers customizados) + cache: "no-store" + _t de
// quebra de cache: nunca deve disparar preflight nem voltar uma resposta
// antiga em cache do navegador.
async function getInitialData() {
  const url = `${API_URL}?action=getInitialData&empresaId=${encodeURIComponent(empresaAtual)}&_t=${Date.now()}`;
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });
  } catch (networkErr) {
    console.error("Erro de rede/CORS no getInitialData:", networkErr);
    throw new Error("Não foi possível conectar ao servidor (rede ou CORS).");
  }
  if (!response.ok) {
    throw new Error("Erro na resposta da rede (HTTP " + response.status + ")");
  }
  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error("Resposta inválida do servidor (não é um JSON válido).");
  }
  console.log("Dados Carregados:", data);
  return data;
}

// Envia dados ao Apps Script em mode: "no-cors" para eliminar 100% do risco
// de bloqueio de CORS/preflight. Trade-off: a resposta fica "opaque" — o
// navegador não permite ler status nem corpo dela, então NÃO é possível saber
// se o Apps Script processou o payload com sucesso a partir deste retorno.
// Por isso os fluxos que chamam esta função tratam a UI de forma otimista
// (assumem sucesso ao enviar) e resincronizam os dados reais depois, em
// segundo plano, via um novo getInitialData().
async function postToAppsScript(payload) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      // text/plain evita requisição preliminar OPTIONS (CORS preflight) no Apps Script
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    const resposta = await res.json();
    console.log("Resposta da gravação no Apps Script:", resposta);
    return resposta;
  } catch (err) {
    console.error("Erro ao salvar no Apps Script:", err);
    // Fallback: tenta envio form-urlencoded se o fetch direto for barrado
    try {
      await fetch(API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "payload=" + encodeURIComponent(JSON.stringify(payload))
      });
      console.log("Enviado via fallback no-cors");
    } catch (e2) {
      console.error("Falha no fallback de gravação:", e2);
    }
  }
}

// saveCorretiva e closeCorretiva vão via GET + query params: assim como
// getInitialData, é uma requisição "simples" (sem preflight) e cuja resposta
// o navegador consegue ler de verdade — diferente do POST em mode: "no-cors",
// aqui dá para confirmar sucesso/erro reportado pelo próprio Apps Script.
async function saveCorretivaApi(payload) {
  const params = new URLSearchParams({ action: "saveCorretiva", empresaId: empresaAtual, ...payload, _t: Date.now() });
  let res;
  try {
    res = await fetch(`${API_URL}?${params.toString()}`, { method: "GET", redirect: "follow", cache: "no-store" });
  } catch (networkErr) {
    console.error("Erro de rede/CORS no saveCorretiva:", networkErr);
    throw new Error("Não foi possível conectar ao servidor (rede ou CORS).");
  }
  return handleApiResponse(res);
}
async function closeCorretivaApi(idChamado, resolucao, tecnico, extra) {
  const params = new URLSearchParams({
    action: "closeCorretiva",
    empresaId: empresaAtual,
    idChamado: idChamado,
    resolucao: resolucao,
    tecnico: tecnico,
    dataFechamento: formatarDataHoraLocalISO(),
    ...(extra || {}),
    _t: Date.now(),
  });
  let res;
  try {
    res = await fetch(`${API_URL}?${params.toString()}`, { method: "GET", redirect: "follow", cache: "no-store" });
  } catch (networkErr) {
    console.error("Erro de rede/CORS no closeCorretiva:", networkErr);
    throw new Error("Não foi possível conectar ao servidor (rede ou CORS).");
  }
  return handleApiResponse(res);
}

// payload: { idLog, dataHora, area, equipamento, usuario, statusInspecao, observacoes }
// idLog/dataHora vêm prontos de quem chama (em vez de gerados aqui dentro) para
// que a UI otimista use exatamente os mesmos valores enviados ao servidor.
async function savePreventivaApi(payload) {
  const params = new URLSearchParams({
    action: "savePreventiva",
    empresaId: empresaAtual,
    idLog: payload.idLog,
    dataHora: payload.dataHora,
    area: payload.area,
    equipamento: payload.equipamento,
    usuario: payload.usuario,
    statusInspecao: payload.statusInspecao,
    observacoes: payload.observacoes || "",
    _t: Date.now(),
  });
  let res;
  try {
    res = await fetch(`${API_URL}?${params.toString()}`, { method: "GET", redirect: "follow", cache: "no-store" });
  } catch (networkErr) {
    console.error("Erro de rede/CORS no savePreventiva:", networkErr);
    throw new Error("Não foi possível conectar ao servidor (rede ou CORS).");
  }
  return handleApiResponse(res);
}

// Gestão Administrativa (Perfil Administrador): exclusão e edição de
// registros de Preventiva/Corretiva. tipo: "preventiva" | "corretiva".
async function deleteRecordApi(tipo, id) {
  const params = new URLSearchParams({ action: "deleteRecord", empresaId: empresaAtual, tipo, id, _t: Date.now() });
  let res;
  try {
    res = await fetch(`${API_URL}?${params.toString()}`, { method: "GET", redirect: "follow", cache: "no-store" });
  } catch (networkErr) {
    console.error("Erro de rede/CORS no deleteRecord:", networkErr);
    throw new Error("Não foi possível conectar ao servidor (rede ou CORS).");
  }
  return handleApiResponse(res);
}
async function updateRecordApi(tipo, id, campos) {
  const params = new URLSearchParams({ action: "updateRecord", empresaId: empresaAtual, tipo, id, ...campos, _t: Date.now() });
  let res;
  try {
    res = await fetch(`${API_URL}?${params.toString()}`, { method: "GET", redirect: "follow", cache: "no-store" });
  } catch (networkErr) {
    console.error("Erro de rede/CORS no updateRecord:", networkErr);
    throw new Error("Não foi possível conectar ao servidor (rede ou CORS).");
  }
  return handleApiResponse(res);
}

// ===== Módulos de Gestão (Calibração, Ativos, Usuários) — mesmo padrão GET
// dos demais saves: sem preflight de CORS e com resposta legível. =====
async function saveCalibracaoApi(payload) {
  return apiGet({ action: "saveCalibracao", ...payload });
}
// Calibração é identificada pela TAG do instrumento na planilha (não há
// coluna de ID estável) — mesma razão pela qual saveCalibracao usa tag/TAG
// como chave, em vez do "id" sintético que deleteRecordApi usa para
// Preventiva/Corretiva.
async function deleteCalibracaoApi(tag) {
  return apiGet({ action: "deleteRecord", tipo: "calibracao", tag });
}
async function saveEquipamentoApi(payload) {
  return apiGet({ action: "saveEquipamento", ...payload });
}
async function updateUserPinApi(payload) {
  return apiGet({ action: "updateUserPin", ...payload });
}
async function saveUsuarioApi(payload) {
  return apiGet({ action: "saveUsuario", ...payload });
}
async function saveRPNCApi(payload) {
  return apiGet({ action: "saveRPNC", ...payload });
}

// ===== Central de Cadastros Mestres (Setores, Processos, Pessoas,
// Fornecedores, Tipos de Documentos) — tipo identifica a categoria; o
// backend usa o mesmo padrão de ação genérica das demais gestões. =====
async function saveCadastroApi(tipo, payload) {
  return apiGet({ action: "saveCadastro", tipo, ...payload });
}
async function deleteCadastroApi(tipo, id) {
  return apiGet({ action: "deleteRecord", tipo: "cadastro_" + tipo, id });
}
// ============================================================================
// Utilitários Globais de Cálculo e Normalização (Cross-Module)
// ============================================================================
window.calcularVencimentoChecagem = function(dataChecagem, periodicidade) {
  if (!dataChecagem) return "";
  var d = new Date(dataChecagem);
  if (isNaN(d.getTime())) return "";
  
  var p = String(periodicidade || "").trim().toLowerCase();
  var dias = 180;
  if (p === "mensal") dias = 30;
  else if (p === "bimestral") dias = 60;
  else if (p === "trimestral") dias = 90;
  else if (p === "semestral") dias = 180;
  else if (p === "anual") dias = 365;

  var venc = new Date(d.getTime() + (dias * 24 * 60 * 60 * 1000));
  return venc.toISOString().slice(0, 10);
};

// Aliases globais de segurança
var calcularVencimentoChecagem = window.calcularVencimentoChecagem;
