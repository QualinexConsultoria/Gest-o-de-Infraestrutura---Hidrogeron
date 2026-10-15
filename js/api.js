/* ==========================================================================
   js/api.js — Camada de Comunicação com Google Apps Script
   Sincronização de Dados, Resiliência e Cache
   ========================================================================== */

// COLE A SUA URL ATIVA GERADA DO APPS SCRIPT ENTRE AS ASPAS ABAIXO:
const API_URL = "https://script.google.com/macros/s/AKfycby1V6goN4fe0ARJKeqHhAlUgRSYdBK_gVKdSQ7b_yBm12Qpl4vgQ0Vp6_hmzeQoS-iY/exec";

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
  const match = hash.match(/calibracao\/([^/?#]+)/i);
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

// Requisições HTTP
async function apiGet(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API_URL}?${query}` : API_URL;

  const res = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/json" }
  });

  if (!res.ok) {
    throw new Error(`Erro na API: HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.status === "erro") {
    throw new Error(json.erro || "Erro retornado pelo backend.");
  }
  return json;
}

async function getInitialData(force = false) {
  const LOCAL_STORAGE_KEY = "hidrogeron_cache_payload";

  if (!force) {
    const salvo = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (salvo) {
      try {
        const parsed = JSON.parse(salvo);
        window.lastLoadedData = parsed;

        apiGet({ _t: Date.now() }).then(dadosNovos => {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dadosNovos));
          window.lastLoadedData = dadosNovos;
        }).catch(err => console.warn("Atualização em background adiada:", err));

        return parsed;
      } catch (e) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
  }

  const dados = await apiGet({ _t: Date.now() });
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dados));
  } catch (e) {
    console.warn("Falha ao salvar no localStorage.");
  }
  window.lastLoadedData = dados;
  return dados;
}

async function postToAppsScript(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Erro na requisição POST: HTTP ${res.status}`);
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { status: "sucesso", respostaTexto: text };
  }
}