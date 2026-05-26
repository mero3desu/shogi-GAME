// game.js - Full Shogi implementation
const BOARD_SIZE = 9;
const PIECE_TYPES = {
  'P': { kanji: '歩', promoted: 'と' },
  'L': { kanji: '香', promoted: '杏' },
  'N': { kanji: '桂', promoted: '圭' },
  'S': { kanji: '銀', promoted: '全' },
  'G': { kanji: '金' },
  'B': { kanji: '角', promoted: '馬' },
  'R': { kanji: '飛', promoted: '龍' },
  'K': { kanji: '王' }
};

function createPiece(type, owner, promoted = false) {
  return { type, owner, promoted };
}

let board = [];
let hands = { sente: {}, gote: {} };
let turn = 'sente';
let selected = null;
let gameMode = 'beginner'; // beginner(2P), intermediate(AI)

const boardEl = document.getElementById('board');
const handSenteEl = document.getElementById('hand-sente-pieces');
const handGoteEl = document.getElementById('hand-gote-pieces');
const turnTextEl = document.getElementById('turn-text');
const promoteDialog = document.getElementById('promote-dialog');
const thinkingEl = document.getElementById('thinking-indicator');
const winOverlay = document.getElementById('win-overlay');
const winText = document.getElementById('win-text');

function initGame() {
  boardEl.innerHTML = '';
  handSenteEl.innerHTML = '';
  handGoteEl.innerHTML = '';
  hands = { sente: {}, gote: {} };
  turn = 'sente';
  selected = null;
  updateTurnIndicator();

  board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

  // Initialize board setup
  const setupRow = (y, owner, rowPieces) => {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (rowPieces[x]) {
        board[y][x] = createPiece(rowPieces[x], owner);
      }
    }
  };

  // Gote (top, moves down)
  setupRow(0, 'gote', ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L']);
  setupRow(1, 'gote', [null, 'R', null, null, null, null, null, 'B', null]);
  setupRow(2, 'gote', ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P']);

  // Sente (bottom, moves up)
  setupRow(6, 'sente', ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P']);
  setupRow(7, 'sente', [null, 'B', null, null, null, null, null, 'R', null]);
  setupRow(8, 'sente', ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L']);

  renderBoard();
  renderHands();
}

function renderBoard() {
  boardEl.innerHTML = '';
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.addEventListener('click', onCellClick);

      if ((x === 2 && y === 2) || (x === 6 && y === 2) || (x === 4 && y === 4) || (x === 2 && y === 6) || (x === 6 && y === 6)) {
        cell.classList.add('star-point');
      }

      const piece = board[y][x];
      if (piece) {
        const pieceEl = document.createElement('div');
        pieceEl.className = 'piece';
        if (piece.owner === 'gote') pieceEl.classList.add('gote');
        if (piece.promoted) pieceEl.classList.add('promoted');
        const kanji = PIECE_TYPES[piece.type].promoted && piece.promoted ? PIECE_TYPES[piece.type].promoted : PIECE_TYPES[piece.type].kanji;
        pieceEl.innerHTML = `<span>${kanji}</span>`;
        pieceEl.addEventListener('click', onPieceClick);
        cell.appendChild(pieceEl);
      }

      boardEl.appendChild(cell);
    }
  }
}

function renderHands() {
  handSenteEl.innerHTML = '';
  handGoteEl.innerHTML = '';
  const renderHand = (handObj, container, owner) => {
    for (const type in handObj) {
      const count = handObj[type];
      if (count > 0) {
        const pieceEl = document.createElement('div');
        pieceEl.className = 'hand-piece';
        pieceEl.dataset.type = type;
        pieceEl.dataset.owner = owner;
        const kanji = PIECE_TYPES[type].kanji;
        pieceEl.innerHTML = `<span>${kanji}</span><span class="piece-count">${count > 1 ? count : ''}</span>`;
        pieceEl.addEventListener('click', onHandPieceClick);
        if (selected && selected.hand && selected.type === type && selected.owner === owner) {
          pieceEl.classList.add('selected');
        }
        container.appendChild(pieceEl);
      }
    }
  };
  renderHand(hands.sente, handSenteEl, 'sente');
  renderHand(hands.gote, handGoteEl, 'gote');
}

function updateTurnIndicator() {
  turnTextEl.textContent = turn === 'sente' ? '先手番' : '後手番';
}

function clearSelection() {
  const prev = document.querySelector('.cell.selected');
  if (prev) prev.classList.remove('selected');
  const hints = document.querySelectorAll('.cell.move-hint, .cell.capture-hint');
  hints.forEach(h => h.classList.remove('move-hint', 'capture-hint'));
  selected = null;
  renderHands(); // To clear hand selection glow
}

function onPieceClick(e) {
  const cell = e.currentTarget.parentElement;
  if (selected && cell.classList.contains('capture-hint')) {
    return; // Allow the click to bubble up to the cell for capturing
  }
  
  e.stopPropagation();
  const x = Number(cell.dataset.x);
  const y = Number(cell.dataset.y);
  const piece = board[y][x];
  if (!piece || piece.owner !== turn) return;
  if (turn === 'gote' && gameMode === 'intermediate') return; // AI's turn

  clearSelection();
  cell.classList.add('selected');
  selected = { x, y, piece };
  showMoveHints(x, y, piece);
}

function onHandPieceClick(e) {
  e.stopPropagation();
  const pieceEl = e.currentTarget;
  const type = pieceEl.dataset.type;
  const owner = pieceEl.dataset.owner;
  if (owner !== turn) return;
  if (turn === 'gote' && gameMode === 'intermediate') return; // AI's turn

  clearSelection();
  selected = { hand: true, type, owner };
  renderHands();

  // Show drop hints (can't drop pawn on same file with unpromoted pawn, etc. Simplified here)
  const cells = document.querySelectorAll('.cell');
  cells.forEach(c => {
    const x = Number(c.dataset.x);
    const y = Number(c.dataset.y);
    if (!board[y][x]) {
      // Basic rule: pawn drop mate is forbidden, two pawns on same file is forbidden (nifu)
      if (type === 'P') {
        let hasPawn = false;
        for (let iy = 0; iy < BOARD_SIZE; iy++) {
          const p = board[iy][x];
          if (p && p.type === 'P' && p.owner === turn && !p.promoted) {
            hasPawn = true;
            break;
          }
        }
        if (hasPawn) return;
        // Cannot drop where piece cannot move
        if (turn === 'sente' && y === 0) return;
        if (turn === 'gote' && y === 8) return;
      }
      if (type === 'L' && ((turn === 'sente' && y === 0) || (turn === 'gote' && y === 8))) return;
      if (type === 'N' && ((turn === 'sente' && y <= 1) || (turn === 'gote' && y >= 7))) return;
      
      c.classList.add('move-hint');
    }
  });
}

function onCellClick(e) {
  const cell = e.currentTarget;
  const x = Number(cell.dataset.x);
  const y = Number(cell.dataset.y);
  if (!selected) return;

  if (selected.hand) {
    if (!cell.classList.contains('move-hint')) return;
    board[y][x] = createPiece(selected.type, turn);
    hands[turn][selected.type]--;
    afterMove();
    return;
  }

  if (cell.classList.contains('move-hint') || cell.classList.contains('capture-hint')) {
    executeMove(selected.x, selected.y, x, y, selected.piece);
  }
}

function executeMove(fromX, fromY, toX, toY, piece) {
  const targetPiece = board[toY][toX];
  if (targetPiece && targetPiece.owner !== piece.owner) {
    const capturedType = targetPiece.type;
    hands[piece.owner][capturedType] = (hands[piece.owner][capturedType] || 0) + 1;
    showCaptureEffect(toX, toY);
  }
  
  board[toY][toX] = { ...board[fromY][fromX] };
  board[fromY][fromX] = null;
  
  const owner = piece.owner;
  const isSente = owner === 'sente';
  const promotionZone = isSente ? [0, 1, 2] : [6, 7, 8];
  
  const enteredZone = promotionZone.includes(toY);
  const leftZone = promotionZone.includes(fromY);
  
  const canPromote = PIECE_TYPES[piece.type].promoted && !piece.promoted && (enteredZone || leftZone);
  const mustPromote = (!piece.promoted) && (
    (piece.type === 'P' || piece.type === 'L') && (isSente ? toY === 0 : toY === 8) ||
    (piece.type === 'N') && (isSente ? toY <= 1 : toY >= 7)
  );

  if (mustPromote) {
    board[toY][toX].promoted = true;
    showPromoteEffect();
    afterMove();
  } else if (canPromote) {
    if (gameMode === 'intermediate' && turn === 'gote') {
      // AI auto promote
      board[toY][toX].promoted = true;
      showPromoteEffect();
      afterMove();
    } else {
      showPromotionDialog(() => {
        board[toY][toX].promoted = true;
        showPromoteEffect();
        afterMove();
      }, () => {
        afterMove();
      });
    }
  } else {
    afterMove();
  }
}

// Direction definitions: [dx, dy]
const DIRS = {
  N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0],
  NE: [1, -1], NW: [-1, -1], SE: [1, 1], SW: [-1, 1],
  NNE: [1, -2], NNW: [-1, -2]
};

function getValidMoves(x, y, piece, currentBoard = board) {
  const moves = [];
  const addMove = (dx, dy) => {
    const nx = x + dx; const ny = y + dy;
    if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
      const target = currentBoard[ny][nx];
      if (!target) moves.push({x: nx, y: ny, type: 'move'});
      else if (target.owner !== piece.owner) moves.push({x: nx, y: ny, type: 'capture'});
      return !target; // Return true if empty (for continuous moves)
    }
    return false;
  };
  
  const addContinuous = (dx, dy) => {
    let nx = x + dx; let ny = y + dy;
    while (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
      const target = currentBoard[ny][nx];
      if (!target) {
        moves.push({x: nx, y: ny, type: 'move'});
      } else {
        if (target.owner !== piece.owner) moves.push({x: nx, y: ny, type: 'capture'});
        break;
      }
      nx += dx; ny += dy;
    }
  };

  const isSente = piece.owner === 'sente';
  const flip = (dy) => isSente ? dy : -dy;

  let movePattern = [];
  let contPattern = [];

  const t = piece.type;
  const p = piece.promoted;

  if (p) {
    if (t === 'P' || t === 'L' || t === 'N' || t === 'S') movePattern = [DIRS.N, DIRS.NW, DIRS.NE, DIRS.E, DIRS.W, DIRS.S]; // Gold
    else if (t === 'B') { contPattern = [DIRS.NE, DIRS.NW, DIRS.SE, DIRS.SW]; movePattern = [DIRS.N, DIRS.S, DIRS.E, DIRS.W]; }
    else if (t === 'R') { contPattern = [DIRS.N, DIRS.S, DIRS.E, DIRS.W]; movePattern = [DIRS.NE, DIRS.NW, DIRS.SE, DIRS.SW]; }
  } else {
    if (t === 'P') movePattern = [DIRS.N];
    else if (t === 'L') contPattern = [DIRS.N];
    else if (t === 'N') movePattern = [DIRS.NNE, DIRS.NNW];
    else if (t === 'S') movePattern = [DIRS.N, DIRS.NW, DIRS.NE, DIRS.SW, DIRS.SE];
    else if (t === 'G') movePattern = [DIRS.N, DIRS.NW, DIRS.NE, DIRS.E, DIRS.W, DIRS.S];
    else if (t === 'K') movePattern = [DIRS.N, DIRS.NW, DIRS.NE, DIRS.E, DIRS.W, DIRS.S, DIRS.SW, DIRS.SE];
    else if (t === 'B') contPattern = [DIRS.NE, DIRS.NW, DIRS.SE, DIRS.SW];
    else if (t === 'R') contPattern = [DIRS.N, DIRS.S, DIRS.E, DIRS.W];
  }

  movePattern.forEach(d => addMove(d[0], flip(d[1])));
  contPattern.forEach(d => addContinuous(d[0], flip(d[1])));

  return moves;
}

function showMoveHints(x, y, piece) {
  const moves = getValidMoves(x, y, piece);
  moves.forEach(m => {
    const cell = boardEl.querySelector(`.cell[data-x="${m.x}"][data-y="${m.y}"]`);
    if (m.type === 'move') cell.classList.add('move-hint');
    else cell.classList.add('capture-hint');
  });
}

function afterMove() {
  clearSelection();
  renderBoard();
  renderHands();
  checkWinCondition();
  if (winOverlay.classList.contains('active')) return;
  
  turn = turn === 'sente' ? 'gote' : 'sente';
  updateTurnIndicator();

  if (turn === 'gote' && gameMode === 'intermediate') {
    thinkingEl.classList.add('active');
    setTimeout(playAITurn, 800);
  }
}

function checkWinCondition() {
  const kings = { sente: false, gote: false };
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const p = board[y][x];
      if (p && p.type === 'K') kings[p.owner] = true;
    }
  }
  if (!kings.sente) showWin('後手の勝ち');
  else if (!kings.gote) showWin('先手の勝ち');
}

function showWin(message) {
  winText.textContent = message;
  winOverlay.classList.add('active');
}

function hideWin() {
  winOverlay.classList.remove('active');
}

function showPromotionDialog(onPromote, onCancel) {
  promoteDialog.classList.add('active');
  const promoteBtn = promoteDialog.querySelector('.promote-option[data-choice="promote"]');
  const cancelBtn = promoteDialog.querySelector('.promote-option[data-choice="no-promote"]');
  const cleanup = () => {
    promoteDialog.classList.remove('active');
    promoteBtn.removeEventListener('click', onPromoteClick);
    cancelBtn.removeEventListener('click', onCancelClick);
  };
  const onPromoteClick = () => { cleanup(); onPromote(); };
  const onCancelClick = () => { cleanup(); onCancel(); };
  promoteBtn.addEventListener('click', onPromoteClick);
  cancelBtn.addEventListener('click', onCancelClick);
}

function showPromoteEffect() {
  const flash = document.createElement('div');
  flash.className = 'promote-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 500);
}

function showCaptureEffect(x, y) {
  const cell = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
  if (!cell) return;
  const rect = cell.getBoundingClientRect();
  const effect = document.createElement('div');
  effect.className = 'capture-effect';
  effect.style.left = rect.left + 'px';
  effect.style.top = rect.top + 'px';
  effect.style.width = rect.width + 'px';
  effect.style.height = rect.height + 'px';
  effect.style.background = 'radial-gradient(circle, rgba(255, 50, 50, 0.8) 0%, transparent 70%)';
  document.body.appendChild(effect);
  setTimeout(() => effect.remove(), 600);
}

// --- AI Worker Logic ---
let aiWorker = null;
if (window.Worker) {
  aiWorker = new Worker('./ai.js');
  aiWorker.onmessage = function(e) {
    const chosenMove = e.data.bestMove;
    thinkingEl.classList.remove('active');
    
    if (!chosenMove) {
        showWin('先手の勝ち (後手投了)');
        return;
    }

    if (chosenMove.drop) {
        board[chosenMove.to.y][chosenMove.to.x] = createPiece(chosenMove.type, 'gote');
        hands.gote[chosenMove.type]--;
        afterMove();
    } else {
        executeMove(chosenMove.from.x, chosenMove.from.y, chosenMove.to.x, chosenMove.to.y, chosenMove.piece);
    }
  };
}

function playAITurn() {
  if (!aiWorker) {
      alert("エラー: Web Workerがサポートされていません。");
      return;
  }
  // ワーカーに盤面データを送って思考を開始させる
  aiWorker.postMessage({
      board: board,
      hands: hands,
      turn: 'gote',
      limit: 2000 // 2000ミリ秒（2秒間）思考する
  });
}

document.getElementById('restart-btn').addEventListener('click', () => {
  if (confirm('ゲームをやり直しますか？')) initGame();
});

document.getElementById('quit-btn').addEventListener('click', () => {
  if (confirm('ゲームを終了しますか？')) {
    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('start-screen').classList.remove('hidden');
  }
});

document.getElementById('win-restart').addEventListener('click', () => {
  hideWin();
  initGame();
});

document.getElementById('win-quit').addEventListener('click', () => {
  hideWin();
  document.getElementById('game-screen').classList.remove('active');
  document.getElementById('start-screen').classList.remove('hidden');
});

document.querySelectorAll('.level-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    gameMode = btn.dataset.level === 'beginner' ? 'beginner' : 'intermediate';
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('active');
    initGame();
  });
});
