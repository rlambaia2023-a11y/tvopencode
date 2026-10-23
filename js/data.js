// =====================================================================
// DATA — camada de acesso ao dataset (com cache em memória)
// =====================================================================
import { CONFIG } from "./config.js";

const cache = new Map();

function dirFor(mode) {
  return CONFIG.modeDirs[mode] || mode;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.json();
}

/**
 * Lista de países de um modo.
 * Retorna array ordenado por nome: { iso, name, capital, tz, count }
 */
export async function loadCountries(mode) {
  const key = `countries:${mode}`;
  if (cache.has(key)) return cache.get(key);
  const url = `${CONFIG.dataBase}/${dirFor(mode)}/raw/countries_metadata.json`;
  const raw = await fetchJson(url); // { "BR": { country, capital, timeZone, hasChannels, channelCount } }
  const list = Object.entries(raw)
    .map(([iso, m]) => ({
      iso,
      name: m.country || iso,
      capital: m.capital || "",
      tz: m.timeZone || "",
      count: m.hasChannels ? (m.channelCount || 0) : 0
    }))
    .filter(c => c.count > 0 || mode !== "tv")
    .sort((a, b) => a.name.localeCompare(b.name, "pt-br"));
  cache.set(key, list);
  return list;
}

/**
 * Canais de um país em um modo.
 * Normaliza para: { id, name, streams[], languages[], country, geoBlocked }
 */
export async function loadCountryChannels(mode, iso) {
  const key = `country:${mode}:${iso}`;
  if (cache.has(key)) return cache.get(key);
  const url = `${CONFIG.dataBase}/${dirFor(mode)}/raw/countries/${iso.toLowerCase()}.json`;
  const raw = await fetchJson(url);
  const list = (Array.isArray(raw) ? raw : []).map(ch => ({
    id: ch.nanoid,
    name: ch.name || "—",
    streams: (ch.sources && ch.sources.streams) || [],
    video: (ch.sources && ch.sources.youtube) || [],
    languages: ch.languages || [],
    country: ch.country,
    geoBlocked: !!ch.isGeoBlocked
  }));
  cache.set(key, list);
  return list;
}

/**
 * Categoria de um modo (slug opcional "all" = só países).
 * Normaliza igual a loadCountryChannels.
 */
export async function loadCategory(mode, slug) {
  const key = `cat:${mode}:${slug}`;
  if (cache.has(key)) return cache.get(key);
  if (slug === "all") {
    const merged = [];
    // "all" não existe agregado em países: usamos o catálogo inteiro carregando
    // por país seria caríssimo; no site "All Channels" navega por país.
    cache.set(key, merged);
    return merged;
  }
  const url = `${CONFIG.dataBase}/${dirFor(mode)}/raw/categories/${slug}.json`;
  const raw = await fetchJson(url);
  const list = (Array.isArray(raw) ? raw : []).map(ch => ({
    id: ch.nanoid,
    name: ch.name || "—",
    streams: (ch.sources && ch.sources.streams) || [],
    video: (ch.sources && ch.sources.youtube) || [],
    languages: ch.languages || [],
    country: ch.country,
    geoBlocked: !!ch.isGeoBlocked
  }));
  cache.set(key, list);
  return list;
}

/** Bandeira emoji a partir do ISO-2 */
export function flagOf(iso) {
  if (!iso || iso.length !== 2) return "🌐";
  return String.fromCodePoint(
    ...iso.toUpperCase().split("").map(c => 0x1f1e6 + (c.charCodeAt(0) - 65))
  );
}

// ---- bandeiras reais (imagens) + logos/categorias de enriquecimento ----

const FLAG_ALIAS = { uk: "gb", an: "nl", xk: "xk" };

/** <img> da bandeira (flagcdn). Retorna "" se não houver código válido. */
export function flagImgHtml(iso) {
  let c = iso ? String(iso).toLowerCase() : "";
  c = FLAG_ALIAS[c] || c;
  if (!/^[a-z]{2}$/.test(c)) return "";
  return `<img class="flag-img" alt="" loading="lazy" src="${CONFIG.flagCdn}/w40/${c}.png" onerror="this.remove()">`;
}

/** Normaliza nomes para casamento (s/ acentos, ponta e sufixos de qualidade) */
const norm = s =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ").trim();

/** Thumbnail de webcam (YouTube) */
export function ytThumb(item) {
  const u = item.video && item.video[0];
  const m = u && String(u).match(/embed\/([\w-]{6,})/);
  return m ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : null;
}

// ---- IndexedDB (cache de logos, sem biblioteca externa) ----
function openMetaDB() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open("tvmundo-meta", 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore("meta");
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
async function idbPut(key, val) {
  const db = await openMetaDB();
  return new Promise((res, rej) => {
    const tx = db.transaction("meta", "readwrite");
    tx.objectStore("meta").put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(key) {
  const db = await openMetaDB();
  return new Promise((res, rej) => {
    const tx = db.transaction("meta", "readonly");
    const rq = tx.objectStore("meta").get(key);
    rq.onsuccess = () => res(rq.result || null);
    rq.onerror = () => rej(rq.error);
  });
}

// ---- índice de logos do iptv-org (tvg-id -> url), cache 7 dias ----
let logosPromise = null;
async function loadLogos() {
  if (logosPromise) return logosPromise;
  logosPromise = (async () => {
    let data = null;
    try {
      const hit = await idbGet("logos");
      if (hit && Date.now() - hit.t < (CONFIG.logoTtlDays || 7) * 864e5) data = hit.data;
    } catch {}
    if (!data) {
      const raw = await (await fetch(CONFIG.iptvLogos)).json();
      const best = new Map();
      for (const e of raw) {
        if (!e.url) continue;
        const p = best.get(e.channel);
        if (!p || (!p.in_use && e.in_use) || (p.format !== "PNG" && e.format === "PNG")) best.set(e.channel, e);
      }
      data = [...best.values()].filter(e => e.in_use !== false).map(e => [e.channel, e.url]);
      try { await idbPut("logos", { t: Date.now(), data }); } catch {}
    }
    return data ? new Map(data) : new Map();
  })().catch(() => new Map());
  return logosPromise;
}

// ---- m3u por país do iptv-org: nome e stream URL -> tvg-id ----
const m3uCache = new Map();
async function tvgMapFor(iso) {
  const key = String(iso || "").toLowerCase();
  if (m3uCache.has(key)) return m3uCache.get(key);
  const res = await fetch(`${CONFIG.iptvBase}/${key}.m3u`);
  if (!res.ok) throw new Error("m3u indisponível");
  const text = await res.text();
  const byName = new Map();  // nomeNormalizado -> tvg-id base
  const byUrl  = new Map();  // normUrl -> tvg-id base
  let curName = "", curId = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("#EXTINF")) {
      curId = (line.match(/tvg-id="([^"]*)"/) || [])[1] || "";
      curName = (line.split(",").slice(1).join(",") || "").trim();
    } else if (line && !line.startsWith("#")) {
      if (curId) {
        const base = curId.split("@")[0];
        const plain = curName.replace(/\s*[\(\[].*$/, "").trim();
        const n = norm(plain);
        if (n && !byName.has(n)) byName.set(n, base);   // primeiro EXTINF do nome ganha
        const un = norm(line.split("?")[0]);
        if (un && !byUrl.has(un)) byUrl.set(un, base);
      }
      curName = ""; curId = "";
    }
  }
  const map = { byName, byUrl };
  m3uCache.set(key, map);
  return map;
}

// ---- índice nanoid -> categoria por modo ----
const catIdxPromises = {};
async function catIndex(mode) {
  if (catIdxPromises[mode]) return catIdxPromises[mode];
  catIdxPromises[mode] = (async () => {
    const slugs = (CONFIG.catSlugs && CONFIG.catSlugs[mode]) || [];
    const m = new Map();
    await Promise.all(slugs.map(async slug => {
      try {
        const list = await loadCategory(mode, slug);
        for (const ch of list) if (!m.has(ch.id)) m.set(ch.id, slug);
      } catch {}
    }));
    return m;
  })().catch(() => new Map());
  return catIdxPromises[mode];
}


/** Hora local do país usando Intl (sem bibliotecas) */
export function localTime(tz) {
  if (!tz) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit", minute: "2-digit", timeZone: tz
    }).format(new Date());
  } catch {
    return "";
  }
}

export function clearCache() { cache.clear(); }

/**
 * Enriquece uma lista de itens de um país com material visual:
 * TV: logo (iptv-org) + categoria (famelack) · Webcam: thumb (YouTube).
 * Nunca bloqueia: qualquer recurso que falhe simplesmente não aparece.
 */
export async function enrichChannels(mode, iso, items) {
  const out = items.map(it => {
    const o = { ...it };
    if (mode === "webcam") {
      const t = ytThumb(it);
      if (t) o.thumb = t;
    }
    return o;
  });

  if (mode !== "tv") return out;

  const results = await Promise.allSettled([catIndex(mode), tvgMapFor(iso), loadLogos()]);
  const [cm, tg, lg] = results.map(r => (r.status === "fulfilled" ? r.value : null));

  const httpsPage = location.protocol === "https:";
  return out.map(o => {
    if (cm) o.category = cm.get(o.id) || null;
    if (tg && lg) {
      const nameId = tg.byName.get(norm(o.name));
      let streamId = null;
      if (!nameId && o.streams[0]) streamId = tg.byUrl.get(norm(o.streams[0].split("?")[0]));
      const id = nameId || streamId;
      const url = id ? lg.get(String(id).split("@")[0]) : null;
      if (url && !(httpsPage && url.startsWith("http:"))) o.logo = url;
    }
    return o;
  });
}
