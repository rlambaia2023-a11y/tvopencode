// =====================================================================
// CONFIG — personalize o sistema inteiro daqui
// =====================================================================
export const CONFIG = {
  appName: "TV Mundo",
  appTagline: "TV ao vivo, rádio e webcams grátis do mundo inteiro",

  // Endpoint do dataset público (MIT). Troque pela sua fonte se quiser
  // hospedar os dados localmente (ex.: "./data").
  dataBase: "https://raw.githubusercontent.com/famelack/famelack-data/main",

  // Enriquecimento visual (todos MIT/dataset público):
  iptvBase: "https://raw.githubusercontent.com/iptv-org/iptv/master/streams", // m3u por país p/ tvg-id
  iptvLogos: "https://iptv-org.github.io/api/logos.json",                    // tvg-id -> logo
  flagCdn: "https://flagcdn.com",                                            // bandeiras reais
  logoTtlDays: 7,                                                            // cache local dos logos (dias)

  // Todas as categorias existentes por modo (para agrupar listas por país)
  catSlugs: {
    tv: ["animation","auto","business","classic","comedy","cooking","culture","documentary","education","entertainment","family","general","interactive","kids","legislative","lifestyle","movies","music","news","outdoor","public","relax","religious","science","series","shop","show","sports","top-news","travel","weather"],
    radio: ["70s","80s","90s","blues","chill","christmas","classical","country","easy-listening","electronic","folk","hip-hop","hits","indie","jazz","latin","metal","news","oldies","politics","pop","reggae","religious","rock","schlager","soul","sports","talk"],
    webcam: ["airport","animals","beach","city","construction","harbor","lake","landmark","mountain","nature","park","river","ski","space","sports","traffic","train","underwater","volcano","weather"]
  },

  // Diretório de cada modo no dataset ("webcams" é plural).
  modeDirs: { tv: "tv", radio: "radio", webcam: "webcams" },

  // Textura da Terra para o globo 3D (equiretangular).
  earthTexture: "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg",

  // Bibliotecas via CDN (troque ou vendasse localmente conforme quiser).
  cdn: {
    three: "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    orbit: "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/",
    hls: "https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js"
  },

  // Categorias por modo: slug do dataset -> rótulo exibido (em PT)
  categories: {
    tv: {
      all: "Todos",
      "top-news": "Top Notícias",
      news: "Notícias",
      sports: "Esportes",
      music: "Música",
      movies: "Filmes",
      series: "Séries",
      kids: "Infantil",
      documentary: "Documentários",
      education: "Educação",
      entertainment: "Entretenimento",
      general: "Geral",
      lifestyle: "Estilo de Vida",
      culture: "Cultura",
      comedy: "Comédia",
      cooking: "Culinária",
      travel: "Viagens",
      weather: "Clima",
      business: "Negócios",
      religious: "Religioso",
      relax: "Relax",
      auto: "Autos",
      animation: "Animação",
      family: "Família",
      classic: "Clássicos",
      science: "Ciência",
      legislative: "Legislativo",
      outdoor: "Ao Ar Livre",
      shop: "Compras",
      public: "Público",
      interactive: "Interativo",
      show: "Shows"
    },
    radio: {
      all: "Todas",
      news: "Notícias",
      pop: "Pop",
      rock: "Rock",
      "hip-hop": "Hip-Hop",
      electronic: "Eletrônica",
      jazz: "Jazz",
      classical: "Clássica",
      latin: "Latina",
      country: "Country",
      oldies: "Antigas",
      hits: "Hits",
      talk: "Talk",
      sports: "Esportes",
      religious: "Religiosa",
      "70s": "Anos 70",
      "80s": "Anos 80",
      "90s": "Anos 90",
      blues: "Blues",
      chill: "Chill",
      christmas: "Natal",
      folk: "Folk",
      indie: "Indie",
      metal: "Metal",
      politics: "Política",
      reggae: "Reggae",
      schlager: "Schlager",
      soul: "Soul",
      "easy-listening": "Easy Listening"
    },
    webcam: {
      all: "Todas",
      city: "Cidades",
      beach: "Praias",
      harbor: "Portos",
      airport: "Aeroportos",
      mountain: "Montanhas",
      nature: "Natureza",
      landmark: "Pontos Turísticos",
      traffic: "Trânsito",
      train: "Trens",
      animals: "Animais",
      weather: "Clima",
      ski: "Esqui",
      lake: "Lagos",
      river: "Rios",
      park: "Parques",
      volcano: "Vulcões",
      underwater: "Subaquáticas",
      construction: "Obras",
      space: "Espaço",
      sports: "Esportes"
    }
  },

  // Ícones por slug de categoria (aparecem nos chips e no drawer)
  catIcons: {
    all: "🌐", "top-news": "📰", news: "📰", todos: "🌐", sports: "⚽", music: "🎵",
    movies: "🎬", series: "📺", kids: "🧸", documentary: "🎞️", education: "🎓",
    entertainment: "✨", general: "📺", lifestyle: "💅", culture: "🏛️", comedy: "😂",
    cooking: "🍳", travel: "✈️", weather: "🌦️", business: "💼", religious: "🙏",
    relax: "🧘", auto: "🏎️", animation: "🎨", family: "👨‍👩‍👧", classic: "📀",
    science: "🔬", legislative: "⚖️", outdoor: "🏔️", shop: "🛍️", public: "📡",
    interactive: "🗣️", show: "🎤", pop: "🫧", rock: "🎸", "hip-hop": "🎤",
    electronic: "🎛️", jazz: "🎺", classical: "🎻", latin: "💃", country: "🤠",
    oldies: "☎️", hits: "🔥", talk: "🎙️", "70s": "🕺", "80s": "📼", "90s": "💿",
    blues: "🎷", chill: "🌊", christmas: "🎄", folk: "🪕", indie: "🌿", metal: "🤘",
    politics: "🗳️", reggae: "🌴", schlager: "🎉", soul: "💜", "easy-listening": "🫧",
    airport: "🛫", animals: "🐘", beach: "🏖️", city: "🏙️", construction: "🏗️",
    harbor: "⚓", lake: "🏞️", landmark: "🗽", mountain: "⛰️", nature: "🌲",
    park: "🌳", river: "🌊", ski: "⛷️", space: "🚀", traffic: "🚦", train: "🚆",
    underwater: "🐠", volcano: "🌋"
  },

  // Chips de acesso rápido por modo
  chipSlugs: {
    tv: ["all", "top-news", "news", "sports", "music", "movies"],
    radio: ["all", "pop", "rock", "hits", "news", "electronic"],
    webcam: ["all", "city", "beach", "nature", "animals", "landmark"]
  },

  // Motor de streaming (pré-buffer e recuperação automáticas)
  stream: {
    minStart: 4,            // vídeo: segundos de buffer antes de iniciar
    maxBufferLength: 14,    // alvo de buffer à frente (s)
    maxMaxBufferLength: 60,
    backBufferLength: 30,   // memória atrás da posição (s)
    liveSyncDurationCount: 3,
    startLevel: 0,          // inicia na qualidade mais leve (ABR sobe sozinho)
    connectTimeout: 8000,   // espera máxima pelo manifesto (rápido p/ fallback)
    bufferTimeout: 10000    // espera máxima p/ acumular o pré-buffer
  },

  // Textos dos modos (rótulo do botão, título do painel, item)
  modes: {
    tv: { label: "TV", panel: "Selecione um canal", item: "canais", verb: "Assistir" },
    radio: { label: "Rádio", panel: "Selecione uma estação", item: "estações", verb: "Ouvir" },
    webcam: { label: "Webcams", panel: "Selecione uma câmera", item: "câmeras", verb: "Ver" }
  }
};
