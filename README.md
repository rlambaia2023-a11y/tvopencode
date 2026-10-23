# TV Mundo — TVMH 🌍📺 (globestream personalizável)

✦ **Ideia e criação: Sanjorge**

Sistema próprio de **TV ao vivo, rádio e webcams do mundo inteiro** no navegador,
com globo 3D interativo, player HLS nativo + hls.js, categorias, busca,
favoritos e canal aleatório.

> Todo o código deste projeto é autoral. Os catálogos vêm do dataset público
> [famelack-data](https://github.com/famelack/famelack-data) (**licença MIT**),
> refinado a partir do projeto aberto [iptv-org](https://github.com/iptv-org/iptv).
> O app **não hospeda mídia** — o navegador conecta diretamente às fontes públicas.

## Como rodar

Módulos ES exigem HTTP (não funciona com `file://`):

```powershell
.\serve.ps1          # abre em http://localhost:8080 (Python ou npx serve)
```

ou manualmente: `python -m http.server 8080` / `npx -y serve .`

## Estrutura

```
index.html          marcação e layout
css/styles.css      tema (variáveis de cores/fontes no topo)
js/config.js        ⚙️ personalização: nome, marca, cores, categorias, fontes
js/coords.js        lat/lng por país (gerado; fallback embutido)
js/data.js          camada de dados + cache
js/globe.js         globo 3D (Three.js + OrbitControls)
js/player.js        player (hls.js, áudio nativo, embed YouTube)
js/ui.js            sidebar países/canais, favoritos, modais
js/main.js          estado + integração
```

## Personalização rápida

| O que                   | Onde                              |
| ----------------------- | --------------------------------- |
| Nome/marca                             | `CONFIG.appName / appTagline`     |
| Cores, fonte, cantos                   | variáveis no topo do `styles.css` |
| Categorias exibidas (rotulo por slug)  | `CONFIG.categories`               |
| Outro dataset (ex.: hospedado local)   | `CONFIG.dataBase`                 |
| Textura/visual da Terra                | `CONFIG.earthTexture`             |

Datasets utilizáveis (todos com `raw/` e `compressed/`): `tv/`, `radio/`, `webcams/`
com `countries/{iso}.json`, `categories/{slug}.json` e `countries_metadata.json`.

## Notas

- Alguns streams são geograficamente bloqueados ou exigem HTTPS/NAT —
  o player tenta todos os fallbacks e informa falha.
- Favoritos ficam no `localStorage` (`tvmundo.favorites`).
- Webcams usam embed do YouTube (autoplay silenciado por política do navegador).
