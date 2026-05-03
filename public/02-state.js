// ═══ STATE ═══
var packages = [], scans = [], sessionToken = '', currentUser = '';
var colSession = [], activeMkt = '';
var coletaTimeout = null; // Timer de inatividade (20 min)
var fotosVeiculo = [], problemaPkgs = [];
var _tirando_fotos = false; // Flag para impedir reset durante captura
var camStream = null, barcodeDetector = null, scanning = false, scanPaused = false;
var lastCode = '', lastCodeAt = 0;
var encerrandoParcial = false; // flag: encerramento parcial ativo
var lastPullAt = 0;        // timestamp do último pullFromBling
var diaSelectedDate = '';  // data selecionada na aba Dia ('' = hoje)
var histFilterDate = '';   // filtro ativo de data no histórico
var histFilterMkt  = '';   // filtro ativo de mkt no histórico
var histLoteAberto = '';
