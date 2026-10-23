// =====================================================================
// MAIN — estado global, integração globo ↔ UI ↔ player, atalhos
// =====================================================================
import { CONFIG } from "./config.js?v=2";
import { loadCountries, loadCategory, loadCountryChannels, flagOf, flagImgHtml } from "./data.js?v=2";
import { initGlobe, setMarkers, focusCountry, resetGlobeView } from "./globe.js";
import * as player from "./player.js?v=2";
import * as ui from "./ui.js?v=2";

const $ = sel => document.querySelector(sel);

let playGen = 0; // invalida resultados truncados quando o modo/tela muda
let meterTimer = null;
let ccCb = null; // trilha de legenda ativa (ou null desligada)

// ---------------- painel/status ----------------
function setPanelStatus(text, cls = "") {
  const p = $("#panel-status");
  p.textContent = text;
  p.className = "panel-status " + cls;
  $("#panel-empty").classList.toggle("hidden", !!text || !!ui.state.currentChannel);
}

function updateFavBtn() {
  const btn = $("#fav-toggle");
  if (!ui.state.currentChannel) return;
  btn.classList.toggle("is-fav", ui.isFav(ui.state.currentChannel, ui.state.mode));
}

function onPlaySettled(ok) {
  $("#panel").classList.toggle("playing", ok);
}

// ---------------- media helpers ----------------
function wipeMedia() {
  player.stop();
  $("#np-bar").classList.add("hidden");
  setPanelStatus("");
}

// ---------------- ações ----------------
function onModeChange(mode) {
  if (mode === ui.state.mode) { ui.placeThumb(); return; }
  playGen++;
  ui.state.mode = mode;
  ui.state.currentCategory = null;
  ui.state.currentChannel = null;
  ui.state.view = "countries";
  wipeMedia();
  ui.renderHeader();
  ui.refreshDrawer();
  ui.renderCountries();
  resetGlobeView();
  loadCountries(mode).then(setMarkers).catch(() => {});
}

async function onChannelPick(ch, _countryName, flag) {
  const r = await playNow(ch, flag);
  onPlaySettled(r.ok);
  updateFavBtn();
}

/** Reproduz e atualiza/noifica UI; retorna { ok } p/ reintentos automáticos */
async function playNow(ch, flag) {
  const gen = ++playGen;
  ui.state.currentChannel = null;
  ui.closeModals();
  setPanelStatus(ch.geoBlocked ? `${ch.name} — sujeito a bloqueio regional ⚠` : `Conectando em ${ch.name}…`, ch.geoBlocked ? "warn" : "loading");
  $("#np-flag").innerHTML = flagImgHtml(ch.country) || "";
  $("#np-flag").classList.add("has-img");
  $("#np-name").textContent = ch.name;
  $("#np-mode").textContent = CONFIG.modes[ui.state.mode].label;
  $("#np-bar").classList.remove("hidden");

  const res = await player.play(ch, ui.state.mode, {
    onStatus: s => setPanelStatus(s, "loading")
  });
  if (gen !== playGen) return { ok: false, stale: true };
  if (res.ok) {
    ui.state.currentChannel = ch;
    setPanelStatus(ch.geoBlocked ? "Reproduzindo (pode estar bloqueado na sua região ⚠)" : "", ch.geoBlocked ? "warn" : "");
    ui.pushHistory(ch, ui.state.mode);
    ui.toast(`${ch.name} — reproduzindo`, "ok");
    // legendas: mostra o botão CC somente se o stream tinha trilhas
    const ccBtn = $("#cc-toggle");
    ccCb = null;
    const trs = player.subtitleTracks();
    if (trs.length) {
      ccBtn.classList.remove("hidden");
      ccBtn.title = "Legendas: " + trs[0].name;
      const ptIdx = trs.findIndex(t => /^pt\b|^por\b/i.test(t.lang || t.name || ""));
      if (ptIdx >= 0) { ccCb = ptIdx; player.setSubtitle(ptIdx); }
    } else {
      ccBtn.classList.add("hidden");
    }
  } else {
    setPanelStatus(`Falha na reprodução de "${ch.name}".`, "error");
    ui.toast("Não foi possível reproduzir este canal", "fail");
  }
  return { ok: res.ok };
}

async function onCountryPick(iso) {
  playGen++;
  ui.state.currentIso = iso;
  ui.state.view = "channels";
  ui.state.currentCategory = null;
  const meta = await loadCountries(ui.state.mode);
  const c = meta.find(x => x.iso === iso);
  focusCountry(iso);
  await ui.renderCountryChannels(iso, c ? c.name : iso);
  ui.refreshDrawer();
}

function onBackToCountries() {
  playGen++;
  ui.state.view = "countries";
  ui.state.currentCategory = null;
  ui.renderCountries();
  ui.refreshDrawer();
}

async function onCategoryPick(slug) {
  if (slug === "all") { onBackToCountries(); return; }
  playGen++;
  ui.state.currentCategory = slug;
  ui.state.view = "category";
  const label = (CONFIG.categories[ui.state.mode] || {})[slug] || slug;
  await ui.renderCategory(slug, label);
  ui.refreshDrawer();
}

let lastRandomIso = null;
const randIdx = list => Math.floor(Math.random() * list.length);

async function randomCountry() {
  const eligible = (await loadCountries(ui.state.mode)).filter(c => c.count > 0);
  if (!eligible.length) return null;
  let c = eligible[randIdx(eligible)];
  let n = 0;
  while (lastRandomIso && c.iso === lastRandomIso && n < 6) {
    c = eligible[randIdx(eligible)];
    n++;
  }
  lastRandomIso = c.iso;
  return c;
}

async function onRandom() {
  ui.closeModals();
  setPanelStatus("Sorteando…", "loading");
  // Tenta até 4 sorteios; se um canal/país não estiver aceso, sorteia outro
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      let list;
      if (ui.state.currentCategory && ui.state.currentCategory !== "all") {
        list = await loadCategory(ui.state.mode, ui.state.currentCategory);
        if (!list.length) break;
        const item = list[randIdx(list)];
        const r = await playNow(item, flagOf(item.country));
        onPlaySettled(r.ok); updateFavBtn();
        if (r.ok) return;
        continue;
      }
      if (ui.state.view === "channels" && ui.state.currentIso) {
        list = await loadCountryChannels(ui.state.mode, ui.state.currentIso);
        if (!list.length) break;
        const item = list[randIdx(list)];
        const r = await playNow(item, flagOf(item.country));
        onPlaySettled(r.ok); updateFavBtn();
        if (r.ok) return;
        if (list.length < 2) { ui.state.view = "countries"; ui.state.currentIso = null; }
        continue;
      }
      const c = await randomCountry();
      if (!c) break;
      focusCountry(c.iso);
      await ui.renderCountryChannels(c.iso, c.name);
      ui.state.view = "channels";
      ui.state.currentIso = c.iso;
      list = await loadCountryChannels(ui.state.mode, c.iso);
      if (!list.length) continue;
      const item = list[randIdx(list)];
      const r = await playNow(item, flagOf(c.iso));
      onPlaySettled(r.ok); updateFavBtn();
      if (r.ok) return;
    } catch {
      continue;
    }
  }
  setPanelStatus("Nenhum canal alternativo está tocando agora. Tente outro país.", "error");
}

function onFavorites() {
  playGen++;
  ui.state.view = "favorites";
  ui.renderFavorites();
}

const events = { onModeChange, onCountryPick, onCategoryPick, onChannelPick, onBackToCountries, onRandom, onFavorites };

// ---------------- atalhos de teclado ----------------
function initShortcuts() {
  document.addEventListener("keydown", e => {
    const t = e.target;
    if (t && typeof t.matches === "function" && t.matches("input, textarea")) {
      if (e.key === "Escape") t.blur();
      return;
    }
    if (e.key === "/") { e.preventDefault(); ui.toggleDrawer(false); $("#search-input").focus(); }
    else if (e.key.toLowerCase() === "r" || e.key.toLowerCase() === "R") { events.onRandom(); }
    else if (e.key.toLowerCase() === "f" || e.key.toLowerCase() === "F") { events.onFavorites(); }
    else if (e.key === "Escape") { player.exitZen(); ui.closeModals(); ui.toggleDrawer(false); }
  });
}

// ---------------- boot ----------------
async function boot() {
  // Aviso claro se abrir com file:// (módulos ES não funcionam sem servidor)
  if (location.protocol === "file:") {
    document.body.insertAdjacentHTML("beforeend", `
      <div style="position:fixed;inset:0;z-index:200;background:#070b16;color:#eaf0fb;
        display:flex;align-items:center;justify-content:center;text-align:center;
        font-family:system-ui;padding:24px;flex-direction:column;gap:14px;">
        <div style="font-size:2rem">🌍</div>
        <strong style="font-size:1.2rem">Abra pelo servidor local</strong>
        <p style="max-width:480px;line-height:1.6;color:#91a0c0">
          Módulos ES não funcionam com <code>file://</code>.<br>
          Dê dois cliques em <b>Iniciar TV Mundo.bat</b> ou execute
          <code>serve.ps1</code> / <code>python -m http.server 8080</code><br>
          e abra <code>http://localhost:8080</code>.
        </p>
      </div>`);
    return;
  }

  player.init();
  ui.initChrome();
  ui.bindEventMap(events);
  ui.initRipple();

  // controles do player
  const vol = $("#vol-slider");
  vol.value = localStorage.getItem("tvmundo.vol") ?? 1;
  player.setVolume(parseFloat(vol.value));
  vol.addEventListener("input", () => {
    player.setVolume(parseFloat(vol.value));
    localStorage.setItem("tvmundo.vol", vol.value);
  });
  $("#mute-toggle").addEventListener("click", () => {
    const muted = player.toggleMute();
    $("#mute-toggle").textContent = muted ? "🔇" : "🔊";
  });
  // botão CC: nada -> trilha -> próxima trilha (desligada no fim)
  $("#cc-toggle").addEventListener("click", () => {
    const trs = player.subtitleTracks();
    if (!trs.length) { ccCb = null; return; }
    if (ccCb == null) {
      const pt = trs.findIndex(t => /^pt\b|^por\b/i.test(t.lang || t.name || ""));
      ccCb = pt >= 0 ? pt : 0;
    } else if (ccCb < trs.length - 1) {
      ccCb += 1;
    } else {
      ccCb = null;
    }
    player.setSubtitle(ccCb == null ? -1 : ccCb);
    const nome = ccCb == null ? "desligadas" : trs[ccCb].name;
    $("#cc-toggle").title = `Legendas: ${nome}`;
    ui.toast(ccCb == null ? "Legendas desligadas" : `Legendas: ${nome}`);
  });
  $("#fav-toggle").addEventListener("click", () => {
    if (!ui.state.currentChannel) return;
    const fav = ui.toggleFavorite(ui.state.currentChannel, ui.state.mode);
    ui.toast(fav ? "Adicionado aos favoritos ♥" : "Removido dos favoritos", fav ? "ok" : "");
    updateFavBtn();
  });
  $("#zen-toggle").addEventListener("click", () => {
    player.toggleZen();
    $("#zen-toggle").textContent = document.body.classList.contains("zen") ? "⤡" : "⛶";
  });

  initShortcuts();

  // medidor de cache: mostra o buffer à frente e a banda medida em tempo real
  const target = CONFIG.stream.maxBufferLength;
  meterTimer = setInterval(() => {
    const box = $("#buffer-meter");
    if (!box) return;
    const s = player.getStats();
    const idle = !$(".panel").classList.contains("playing") && !ui.state.currentChannel;
    if (!s || idle) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    const pct = Math.max(4, Math.min(100, (s.ahead / target) * 100));
    const bar = box.querySelector("i");
    bar.style.width = `${pct}%`;
    box.classList.toggle("low", s.ahead < 2.5);
    const bits = [`${s.ahead.toFixed(1)}s em cache`];
    if (s.bwKbps != null) bits.push(`${(s.bwKbps / 1000).toFixed(2)} Mbps`);
    if (s.px) bits.push(`${s.px}p`);
    if (s.dropped) bits.push(`${s.dropped} frames perdidos`);
    box.title = "Streaming: " + bits.join(" · ");
  }, 1000);

  await initGlobe($("#globe"), { onCountryPick: onCountryPick });
  setPanelStatus("");
  await ui.renderCountries();
  try { setMarkers(await loadCountries(ui.state.mode)); } catch {}
}

boot().catch(err => {
  console.error("[boot]", err);
  document.body.innerHTML = `<div style="font-family:sans-serif;color:#fff;padding:2rem">
    Erro ao iniciar: ${err.message}<br>Confirme que os arquivos estão sendo servidos via HTTP.
  </div>`;
});
