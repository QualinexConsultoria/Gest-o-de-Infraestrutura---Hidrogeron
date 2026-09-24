/* ==========================================================================
   js/api.js — Camada de Comunicação com Google Apps Script
   ========================================================================== */

const API_URL = "https://script.google.com/macros/s/AKfycbylV6goN4fe0ARJkeqHHaLUgRSYdBK_gVKdSQ7b_yBm12Qpl4vgQ0Vp6_hmzeQoS-1Y/exec";

// Helpers globais para pendencias.js e outros módulos
window.extractCorretivas = function(data) {
  if (!data) return [];
  return data.chamados || data.Chamados_Corretiva || data.corretivas || [];
};

window.extractPreventivas = function(data) {
  if (!data) return [];
  return data.preventivas || data.Preventivas || data.Preventivas_Logs || [];
};

window.extractCalibracoes = function(data) {
  if (!data) return [];
  return data.calibracoes || data.Calibracoes || data.Calibracoes_Controle || [];
};

window.extrairIdCalibracaoDoHash = function() {
  const hash = window.location.hash || "";
  const match = hash.match(/calibracao\/([^\/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
};

window.statusInstrumentoCalibracao = function(dataVenc, statusManual) {
  const sm = String(statusManual || "").toLowerCase();
  if (sm.indexOf("calibra") !== -1) return "Em Calibração";
  if (!dataVenc) return "No Prazo";

  const dVenc = new Date(dataVenc);
  if (isNaN(dVenc.getTime())) return "No Prazo";

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  dVenc.setHours(0, 0, 0, 0);
  const diff = Math.ceil((dVenc.getTime() - hoje.getTime()) / 86400000);

  if (diff < 0) return "Vencido";
  if (diff <= 45) return "Atenção (< 45d)";
  return "No Prazo";
};

const EMPRESA_PADRAO = "HIDROGERON";

// Cache em memória
let memoryCache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30000;

async function apiGet(params = {}) {
  const qs = new URLSearchParams({ ...params, empresaId: EMPRESA_PADRAO, _t: Date.now() });
  const url = `${API_URL}?${qs.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/json" }
  });

  if (!res.ok) {
    throw new Error(`Erro na resposta da rede (HTTP ${res.status})`);
  }

  const data = await res.json();
  if (data.status === "erro") {
    throw new Error(data.erro || "Erro retornado pelo Apps Script");
  }

  return data;
}

async function getInitialData(force = false) {
  const now = Date.now();
  if (!force && memoryCache && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return memoryCache;
  }

  try {
    const data = await apiGet();
    memoryCache = data;
    cacheTimestamp = now;
    window.lastLoadedData = data;
    console.log("Dados Carregados:", data);
    return data;
  } catch (err) {
    if (memoryCache) {
      console.warn("Falha na rede, usando cache em memória:", err);
      return memoryCache;
    }
    throw err;
  }
}

async function postToAppsScript(payload = {}) {
  const bodyData = {
    ...payload,
    empresaId: EMPRESA_PADRAO
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(bodyData)
  });

  if (!res.ok) {
    throw new Error(`Erro no POST (HTTP ${res.status})`);
  }

  const data = await res.json();
  if (data.status === "erro") {
    throw new Error(data.erro || "Erro no salvamento");
  }

  // Invalida cache para a próxima leitura vir fresca
  memoryCache = null;
  return data;
}

window.apiGet = apiGet;
window.getInitialData = getInitialData;
window.postToAppsScript = postToAppsScript;