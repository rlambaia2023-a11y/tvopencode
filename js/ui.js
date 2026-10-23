// =====================================================================
// UI — sidebar, chips, drawer, favoritos, histórico, toasts, modais
// =====================================================================
import { CONFIG } from "./config.js";
import { loadCountries, loadCountryChannels, loadCategory, flagOf, localTime, flagImgHtml, enrichChannels, clearCache } from "./data.js";

const $ = sel => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** nó de bandeira: imagem real; fallback = emoji */
function flagNode(iso, cls = "flag") {
  const s = el("span", cls);
  const img = flagImgHtml(iso);
  if (img) s.innerHTML = img;
  else s.textContent = flagOf(iso);
  return s;
}

/** avatar do canal: logo> >thumb> >letra com gradiente */
function avaNode(ch) {
  const a = el("span", "ava");
  const letterize = () => {
    const words = (ch.name || "").replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean);
    a.textContent = words.slice(0, 2).map(w => w[0].toUpperCase()).join("") || "◎";
    let h = 0;
    for (const c of ch.name || "") h = (h * 31 + c.codePointAt(0)) >>> 0;
    a.style.background = `linear-gradient(135deg, hsl(${h % 360} 55% 45%), hsl(${(h + 40) % 360} 60% 35%))`;
  };
  if (ch.logo) {
    const im = document.createElement("img");
    im.src = ch.logo; im.loading = "lazy"; im.alt = "";
    im.onerror = () => { im.remove(); letterize(); };
    a.classList.add("logo");
    a.appendChild(im);
  } else if (ch.thumb) {
    const im = document.createElement("img");
    im.src = ch.thumb; im.loading = "lazy"; im.alt = "";
    im.onerror = () => { im.remove(); letterize(); };
    a.classList.add("thumb");
    a.appendChild(im);
  } else {
    letterize();
  }
  return a;
}

// token de renderização de país — invalida re-render do enriquecimento se navegar
let renderStamp = 0;

export const state = {
  mode: "tv",
  view: "countries",     // countries | channels | category | favorites | history
  currentIso: null,
  currentCategory: null,
  currentChannel: null,
  favorites: loadJson("tvmundo.favorites", []),
  history: loadJson("tvmundo.history", [])
};

function loadJson(k, fallback) {
  try { return JSON.parse(localStorage.getItem(k) || "null") ?? fallback; } catch { return fallback; }
}
function persist() {
  localStorage.setItem("tvmundo.favorites", JSON.stringify(state.favorites));
  localStorage.setItem("tvmundo.history", JSON.stringify(state.history.slice(0, 40)));
}

let events = {};
export function bindEventMap(map) { events = { ...events, ...map }; }

// ---------------- toasts ----------------
export function toast(msg, type = "") {
  const box = $("#toasts");
  const t = el("div", `toast ${type}`, msg);
  box.appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, 2600);
}

// ---------------- ripple global ----------------
export function initRipple() {
  document.addEventListener("pointerdown", ev => {
    const btn = ev.target.closest(".header-button, .icon-button, .chip, .drawer-button, .cat-button, .seg-item, .country-item, .channel-item");
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 1.1;
    const rip = el("span", "ripple");
    rip.style.width = rip.style.height = `${d}px`;
    rip.style.left = `${ev.clientX - r.left - d / 2}px`;
    rip.style.top = `${ev.clientY - r.top - d / 2}px`;
    btn.appendChild(rip);
    setTimeout(() => rip.remove(), 600);
  });
}

// ---------------- favoritos / histórico ----------------
export function isFav(item, mode) { return state.favorites.some(f => f.mode === mode && f.id === item.id); }
export function toggleFavorite(item, mode) {
  const i = state.favorites.findIndex(f => f.mode === mode && f.id === item.id);
  if (i >= 0) state.favorites.splice(i, 1);
  else state.favorites.unshift({ mode, id: item.id, name: item.name, country: item.country, streams: item.streams, video: item.video });
  persist();
  renderDrawer();
  renderChips?.();
  return isFav(item, mode);
}
export function pushHistory(item, mode) {
  state.history = state.history.filter(h => !(h.mode === mode && h.id === item.id));
  state.history.unshift({ mode, id: item.id, name: item.name, country: item.country, streams: item.streams, video: item.video, at: Date.now() });
  state.history = state.history.slice(0, 40);
  persist();
  renderDrawer();
}

// ---------------- header (segmented) ----------------
export function renderHeader() {
  $("#brand-name").textContent = CONFIG.appName;
  const seg = $("#mode-seg");
  seg.innerHTML = "";
  const thumb = el("div", "seg-thumb");
  seg.appendChild(thumb);
  Object.entries(CONFIG.modes).forEach(([id, m]) => {
    const b = el("button", "seg-item" + (state.mode === id ? " is-active" : ""), m.label);
    b.dataset.mode = id;
    b.addEventListener("click", () => events.onModeChange(id));
    seg.appendChild(b);
  });
  requestAnimationFrame(placeThumb);
}
export function placeThumb() {
  const seg = $("#mode-seg"); if (!seg) return;
  const active = seg.querySelector(".seg-item.is-active") || seg.querySelector(".seg-item");
  const thumb = seg.querySelector(".seg-thumb");
  if (active && thumb) {
    thumb.style.left = `${active.offsetLeft}px`;
    thumb.style.width = `${active.offsetWidth}px`;
  }
}

// ---------------- chips ----------------
let chipCounts = {};
const chipLoading = new Set();
const chipScheduled = new Set();

function setChipBadge(key) {
  if (chipScheduled.has(key)) return;
  chipScheduled.add(key);
  requestAnimationFrame(() => {
    chipScheduled.delete(key);
    const [mode, slug] = key.split(":");
    if (mode !== state.mode) return;
    const chip = document.querySelector(`.chip[data-slug="${slug}"]`);
    chip?.querySelector(".badge")?.replaceChildren(document.createTextNode(String(chipCounts[key])));
  });
}

export function renderChips() {
  const box = $("#chips");
  const mode = state.mode;
  const slugs = (CONFIG.chipSlugs[mode] || ["all"]).slice();
  const labels = CONFIG.categories[mode] || {};
  box.innerHTML = "";
  for (const slug of slugs) {
    const chip = el("button", "chip" + (state.currentCategory === slug ? " is-active" : ""));
    chip.dataset.slug = slug;
    chip.appendChild(el("span", "", `${CONFIG.catIcons?.[slug] || ""} ${labels[slug] || slug}`.trim()));
    chip.appendChild(el("span", "badge", String(chipCounts[`${mode}:${slug}`] ?? "·")));
    chip.addEventListener("click", () => events.onCategoryPick(slug));
    box.appendChild(chip);
  }
  // contadores lazy: um fetch por slug; atualização pontual, sem recursão
  for (const slug of slugs) {
    if (slug === "all") continue;
    const key = `${mode}:${slug}`;
    if (chipCounts[key] != null || chipLoading.has(key)) continue;
    chipLoading.add(key);
    loadCategory(mode, slug)
      .then(list => { chipCounts[key] = list.length; chipLoading.delete(key); setChipBadge(key); })
      .catch(() => { chipCounts[key] = "×"; chipLoading.delete(key); setChipBadge(key); });
  }
}

// ---------------- drawer ----------------
export function toggleDrawer(force) {
  const d = $("#drawer");
  const open = force != null ? force : !d.classList.contains("open");
  d.classList.toggle("open", open);
  $("#burger").setAttribute("aria-expanded", String(open));
}

function sectionTitle(txt) { return el("div", "drawer-section-title", txt); }

function renderDrawer() {
  const cats = CONFIG.categories[state.mode] || {};
  const list = $("#category-list");
  list.innerHTML = "";

  if (state.history.length) {
    list.appendChild(sectionTitle("Assistidos recentemente"));
    const hist = state.history.filter(h => h.mode === state.mode).slice(0, 5);
    for (const h of hist) {
      const b = el("button", "cat-button");
      const ic = flagNode(h.country, "cat-icon");
      b.appendChild(ic);
      b.appendChild(el("span", "", h.name));
      b.addEventListener("click", () => events.onChannelPick(h, "", h.country || ""));
      list.appendChild(b);
    }
  }

  list.appendChild(sectionTitle("Categorias"));
  for (const [slug, label] of Object.entries(cats)) {
    const b = el("button", "cat-button" + (state.currentCategory === slug ? " is-active" : ""));
    b.appendChild(el("span", "cat-icon", CONFIG.catIcons?.[slug] || "•"));
    b.appendChild(el("span", "", label));
    const cnt = chipCounts[`${state.mode}:${slug}`];
    if (cnt != null && cnt !== "×") b.appendChild(el("span", "cat-count", String(cnt)));
    b.addEventListener("click", () => { events.onCategoryPick(slug); });
    list.appendChild(b);
  }
  $("#drawer-favorites-count").textContent = String(state.favorites.filter(f => f.mode === state.mode).length);
}
export function refreshDrawer() { renderDrawer(); renderChips(); }

// ---------------- skeletons ----------------
function skeletons(n = 8) {
  const box = el("div");
  for (let i = 0; i < n; i++) box.appendChild(el("div", "skeleton"));
  return box;
}

// ---------------- sidebar: países ----------------
export async function renderCountries() {
  const wrap = $("#sidebar-body");
  const search = $("#search-input");
  $("#sidebar-title").textContent = "Selecione um país";
  $("#clock").textContent = "";
  wrap.innerHTML = "";
  wrap.appendChild(skeletons(9));

  let countries;
  try { countries = await loadCountries(state.mode); }
  catch {
    wrap.innerHTML = "";
    wrap.appendChild(el("div", "empty", "Não foi possível carregar os países.\nVerifique a conexão e recarregue."));
    return;
  }

  const draw = q => {
    const filtered = countries.filter(c => !q || c.name.toLowerCase().includes(q)).slice(0, 400);
    const total = filtered.reduce((s, c) => s + c.count, 0);
    wrap.innerHTML = "";
    const rl = el("div", "virtualized-list");
    for (const c of filtered) {
      const item = el("button", "country-item");
      item.appendChild(flagNode(c.iso));
      item.appendChild(el("span", "country-name", c.name));
      item.appendChild(el("span", "count", String(c.count)));
      item.title = `${c.count} ${CONFIG.modes[state.mode].item} · ${c.capital}`;
      item.addEventListener("click", () => events.onCountryPick(c.iso));
      rl.appendChild(item);
    }
    wrap.appendChild(rl);
    wrap.appendChild(el("div", "list-info", `${filtered.length} países · ${total} ${CONFIG.modes[state.mode].item}`));
  };
  state.__filter = draw;

  search.value = "";
  search.oninput = () => draw(search.value.trim().toLowerCase());
  draw("");
}

// ---------------- lista de canais com avatares e grupos ----------------
function catLabel(slug) {
  return (CONFIG.categories[state.mode] || {})[slug] ||
    (slug ? slug[0].toUpperCase() + slug.slice(1) : "Outros");
}

function drawChannelList(list, opts = {}) {
  const box = el("div", "channel-list");
  const pushRow = ch => {
    const countryName = opts.nameOf ? (opts.nameOf(ch) || "") : (opts.countryName || "");
    const iso = opts.isoOf ? (opts.isoOf(ch) || "") : (opts.iso || ch.country || "");
    const item = el("button", "channel-item");
    item.appendChild(avaNode(ch));
    item.appendChild(el("span", "ch-name", ch.name));
    for (const lang of (ch.languages || []).slice(0, 1)) item.appendChild(el("span", "lang", lang.toUpperCase().slice(0, 3)));
    if (ch.geoBlocked) item.appendChild(el("span", "geo", "🌐"));
    item.addEventListener("click", () => events.onChannelPick(ch, countryName, iso));
    return item;
  };
  const grouped = opts.grouped && list.some(c => c.category);
  if (grouped) {
    const groups = new Map();
    for (const ch of list) {
      const k = ch.category || "__outros";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(ch);
    }
    const keys = [...groups.keys()].sort((a, b) => {
      if (a === "__outros") return 1;
      if (b === "__outros") return -1;
      const d = groups.get(b).length - groups.get(a).length; // mais cheias primeiro
      return d || catLabel(a).localeCompare(catLabel(b), "pt-br");
    });
    for (const k of keys) {
      const head = el("div", "cat-header");
      head.appendChild(el("span", "cat-ico", CONFIG.catIcons?.[k] || "•"));
      head.appendChild(el("span", "", k === "__outros" ? "Outros" : catLabel(k)));
      head.appendChild(el("span", "cat-count", String(groups.get(k).length)));
      box.appendChild(head);
      for (const ch of groups.get(k)) box.appendChild(pushRow(ch));
    }
  } else {
    for (const ch of list) box.appendChild(pushRow(ch));
  }
  return box;
}

// ---------------- sidebar: canais do país ----------------
export async function renderCountryChannels(iso, countryName) {
  const wrap = $("#sidebar-body");
  const search = $("#search-input");
  wrap.innerHTML = "";
  wrap.appendChild(skeletons(7));
  $("#sidebar-title").textContent = countryName;
  const meta = await loadCountries(state.mode);
  const c = meta.find(x => x.iso === iso);
  const lt = c ? localTime(c.tz) : "";
  $("#clock").textContent = lt ? `${lt} hora local` : "";

  let channels;
  try { channels = await loadCountryChannels(state.mode, iso); }
  catch {
    wrap.innerHTML = "";
    wrap.appendChild(el("div", "empty", "Não foi possível carregar os canais."));
    return;
  }

  const groupedMode = state.mode === "tv";
  const draw = q => {
    const filtered = channels.filter(ch => !q || ch.name.toLowerCase().includes(q));
    wrap.innerHTML = "";
    const back = el("button", "back-button", "←Todos os países");
    back.addEventListener("click", () => events.onBackToCountries());
    wrap.appendChild(back);
    if (!filtered.length) {
      wrap.appendChild(el("div", "empty", q ? "Nada encontrado nesta lista." : `Nenhum ${CONFIG.modes[state.mode].label.toLowerCase()} disponível aqui.`));
      return;
    }
    wrap.appendChild(drawChannelList(filtered, { grouped: groupedMode, countryName, iso }));
    wrap.appendChild(el("div", "list-info", `${filtered.length}/${channels.length} ${CONFIG.modes[state.mode].item}`));
  };
  state.__filter = draw;

  search.value = "";
  search.oninput = () => draw(search.value.trim().toLowerCase());
  draw("");

  // enriquecimento progressivo (logos, thumbs, categorias): re-render só se ainda nesta tela
  const stamp = ++renderStamp;
  enrichChannels(state.mode, iso, channels).then(env => {
    if (stamp !== renderStamp) return;
    channels.splice(0, channels.length, ...env);
    draw(search.value.trim().toLowerCase());
  }).catch(() => {});
}

// ---------------- sidebar: categoría ----------------
export async function renderCategory(slug, label) {
  const wrap = $("#sidebar-body");
  const search = $("#search-input");
  wrap.innerHTML = "";
  wrap.appendChild(skeletons(10));
  $("#sidebar-title").textContent = label;
  $("#clock").textContent = "";

  let channels;
  try { channels = await loadCategory(state.mode, slug); }
  catch {
    wrap.innerHTML = "";
    wrap.appendChild(el("div", "empty", "Categoria indisponível agora."));
    return;
  }
  const meta = await loadCountries(state.mode);
  const nameOf = iso => { const c = meta.find(x => x.iso === iso); return c ? c.name : ""; };

  const draw = q => {
    const filtered = channels.filter(ch => !q || ch.name.toLowerCase().includes(q) || nameOf(ch.country).toLowerCase().includes(q));
    wrap.innerHTML = "";
    const back = el("button", "back-button", "←Todos os países");
    back.addEventListener("click", () => events.onBackToCountries());
    wrap.appendChild(back);
    if (!filtered.length) { wrap.appendChild(el("div", "empty", "Nada encontrado nesta categoria.")); return; }
    wrap.appendChild(drawChannelList(filtered, { nameOf, isoOf: ch => ch.country }));
    wrap.appendChild(el("div", "list-info", `${filtered.length}/${channels.length}`));
  };
  state.__filter = draw;

  search.value = "";
  search.oninput = () => draw(search.value.trim().toLowerCase());
  draw("");
}

// ---------------- favoritos/ histórico na sidebar ----------------
export async function renderFavorites() {
  const wrap = $("#sidebar-body");
  const search = $("#search-input");
  wrap.innerHTML = "";
  $("#sidebar-title").textContent = "Favoritos";
  $("#clock").textContent = "";
  const back = el("button", "back-button", "←Todos os países");
  back.addEventListener("click", () => events.onBackToCountries());
  wrap.appendChild(back);

  const favs = state.favorites.filter(f => f.mode === state.mode);
  if (!favs.length) {
    wrap.appendChild(el("div", "empty", "Você ainda não salvou favoritos.\nToque no ♥ durante a reprodução."));
    return;
  }
  const draw = q => {
    const filtered = favs.filter(f => !q || f.name.toLowerCase().includes(q));
    wrap.innerHTML = "";
    wrap.appendChild(back);
    if (!filtered.length) { wrap.appendChild(el("div", "empty", "Nada encontrado.")); return; }
    const list = el("div", "channel-list");
    for (const f of filtered) {
      const item = el("button", "channel-item");
      item.appendChild(flagNode(f.country));
      item.appendChild(el("span", "ch-name", f.name));
      item.addEventListener("click", () => events.onChannelPick(f, "", f.country || ""));
      list.appendChild(item);
    }
    wrap.appendChild(list);
  };
  state.__filter = draw;
  search.value = "";
  search.oninput = () => draw(search.value.trim().toLowerCase());
  draw("");
}

// ---------------- modais ----------------
export function openModal(id) {
  document.getElementById(id).classList.add("open");
  document.getElementById("modal-overlay").classList.add("open");
}
export function closeModal(id) { document.getElementById(id)?.classList.remove("open"); document.getElementById("modal-overlay").classList.remove("open"); }
export function closeModals() {
  document.querySelectorAll(".modal.open").forEach(m => m.classList.remove("open"));
  document.getElementById("modal-overlay").classList.remove("open");
}

// ---------------- wiring inicial ----------------
export function initChrome() {
  renderHeader();
  $("#burger").addEventListener("click", () => toggleDrawer());
  $("#close-drawer").addEventListener("click", () => toggleDrawer(false));
  $("#fav-button").addEventListener("click", () => events.onFavorites());
  $("#random-button").addEventListener("click", () => events.onRandom());
  $("#drawer-favorites").addEventListener("click", () => { toggleDrawer(false); events.onFavorites(); });
  $("#drawer-random").addEventListener("click", () => { toggleDrawer(false); events.onRandom(); });
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeModals));
  $("#modal-overlay").addEventListener("click", closeModals);
  $("#about-button").addEventListener("click", () => openModal("modal-about"));
  window.addEventListener("resize", () => requestAnimationFrame(placeThumb));
  renderDrawer();
  renderChips();
}
