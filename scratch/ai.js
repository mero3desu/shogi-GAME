// ai.js - Web Worker for Advanced Shogi AI
const BOARD_SIZE = 9;
const PIECE_TYPES = {
  'P': { promoted: true }, 'L': { promoted: true }, 'N': { promoted: true }, 'S': { promoted: true },
  'G': { promoted: false }, 'B': { promoted: true }, 'R': { promoted: true }, 'K': { promoted: false }
};

const PIECE_VALUES = {
  'P': 100, 'L': 300, 'N': 300, 'S': 500,
  'G': 600, 'B': 800, 'R': 1000, 'K': 100000
};
const PROMOTED_VALUES = {
  'P': 600, 'L': 600, 'N': 600, 'S': 600,
  'B': 1200, 'R': 1500
};

// --- Move Generation Logic ---
const DIRS = {
  N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0],
  NE: [1, -1], NW: [-1, -1], SE: [1, 1], SW: [-1, 1],
  NNE: [1, -2], NNW: [-1, -2]
};

function getValidMoves(x, y, piece, currentBoard) {
  const moves = [];
  const addMove = (dx, dy) => {
    const nx = x + dx; const ny = y + dy;
    if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
      const target = currentBoard[ny][nx];
      if (!target) moves.push({x: nx, y: ny, type: 'move'});
      else if (target.owner !== piece.owner) moves.push({x: nx, y: ny, type: 'capture'});
      return !target;
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
    if (t === 'P' || t === 'L' || t === 'N' || t === 'S') movePattern = [DIRS.N, DIRS.NW, DIRS.NE, DIRS.E, DIRS.W, DIRS.S];
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

function generateAllMoves(currentBoard, currentHands, playerTurn) {
  const allMoves = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const piece = currentBoard[y][x];
      if (piece && piece.owner === playerTurn) {
        const moves = getValidMoves(x, y, piece, currentBoard);
        moves.forEach(m => allMoves.push({ from: {x, y}, to: m, piece }));
      }
    }
  }
  const emptyCells = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (!currentBoard[y][x]) emptyCells.push({x, y});
    }
  }
  const pHand = currentHands[playerTurn];
  for (const type in pHand) {
    if (pHand[type] > 0) {
      emptyCells.forEach(cell => {
        if (type === 'P') {
          for (let iy = 0; iy < BOARD_SIZE; iy++) {
            const p = currentBoard[iy][cell.x];
            if (p && p.type === 'P' && p.owner === playerTurn && !p.promoted) return;
          }
          if (playerTurn === 'sente' && cell.y === 0) return;
          if (playerTurn === 'gote' && cell.y === 8) return;
        }
        if (type === 'L' && ((playerTurn === 'sente' && cell.y === 0) || (playerTurn === 'gote' && cell.y === 8))) return;
        if (type === 'N' && ((playerTurn === 'sente' && cell.y <= 1) || (playerTurn === 'gote' && cell.y >= 7))) return;
        allMoves.push({ drop: true, type, to: cell });
      });
    }
  }
  return allMoves;
}

// 盤面を丸ごとコピーせず、差分だけ更新して元に戻す方式（超高速化）
function makeMove(board, hands, move, playerTurn) {
  const undo = { move, captured: null, promoted: false };
  if (move.drop) {
    board[move.to.y][move.to.x] = { type: move.type, owner: playerTurn, promoted: false };
    hands[playerTurn][move.type]--;
  } else {
    const targetPiece = board[move.to.y][move.to.x];
    if (targetPiece) {
      undo.captured = targetPiece;
      hands[playerTurn][targetPiece.type] = (hands[playerTurn][targetPiece.type] || 0) + 1;
    }
    const movedPiece = board[move.from.y][move.from.x];
    undo.promoted = movedPiece.promoted;
    
    board[move.to.y][move.to.x] = movedPiece;
    board[move.from.y][move.from.x] = null;
    
    const isSente = playerTurn === 'sente';
    const promotionZone = isSente ? [0, 1, 2] : [6, 7, 8];
    if (PIECE_TYPES[movedPiece.type].promoted && !movedPiece.promoted && (promotionZone.includes(move.to.y) || promotionZone.includes(move.from.y))) {
       movedPiece.promoted = true;
    }
  }
  return undo;
}

function unmakeMove(board, hands, undo, playerTurn) {
  const move = undo.move;
  if (move.drop) {
    board[move.to.y][move.to.x] = null;
    hands[playerTurn][move.type]++;
  } else {
    const movedPiece = board[move.to.y][move.to.x];
    movedPiece.promoted = undo.promoted;
    board[move.from.y][move.from.x] = movedPiece;
    
    if (undo.captured) {
      board[move.to.y][move.to.x] = undo.captured;
      hands[playerTurn][undo.captured.type]--;
    } else {
      board[move.to.y][move.to.x] = null;
    }
  }
}

// --- Evaluation Logic (Defense & Positional) ---
// 王様は中央に出るほど危険、端に囲われているほど安全（防御力の強化）
const KING_PST = [
  [-30,-40,-50,-60,-70,-60,-50,-40,-30],
  [-30,-40,-50,-60,-70,-60,-50,-40,-30],
  [-30,-40,-50,-60,-70,-60,-50,-40,-30],
  [-30,-40,-50,-60,-70,-60,-50,-40,-30],
  [-30,-40,-50,-60,-70,-60,-50,-40,-30],
  [-10,-20,-30,-40,-50,-40,-30,-20,-10],
  [ 10, 10,  0,-10,-20,-10,  0, 10, 10],
  [ 30, 40, 20,  0,-10,  0, 20, 40, 30],
  [ 50, 60, 40, 20, 10, 20, 40, 60, 50]
]; 

function evaluateBoard(currentBoard, currentHands) {
  let score = 0;
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const p = currentBoard[y][x];
      if (p) {
        let val = p.promoted && PROMOTED_VALUES[p.type] ? PROMOTED_VALUES[p.type] : PIECE_VALUES[p.type];
        
        let posBonus = 0;
        if (p.type === 'K') {
            // Senteの陣形評価基準を元に、Goteは反転して評価する
            posBonus = p.owner === 'sente' ? KING_PST[y][x] : KING_PST[8-y][x];
        } else {
            const advanceBonus = p.owner === 'gote' ? y : (8 - y);
            posBonus = advanceBonus * 3;
            const centerDist = Math.abs(x - 4);
            posBonus += (4 - centerDist) * 2;
        }

        val += posBonus;
        score += p.owner === 'gote' ? val : -val;
      }
    }
  }
  for (let type in currentHands.gote) score += PIECE_VALUES[type] * currentHands.gote[type] * 1.15;
  for (let type in currentHands.sente) score -= PIECE_VALUES[type] * currentHands.sente[type] * 1.15;
  
  return score + (Math.random() * 10 - 5);
}

// --- Search Logic ---
let timeLimitMs = 2000;
let startTime = 0;

function alphaBeta(board, hands, depth, alpha, beta, isMaximizingPlayer, playerTurn) {
  if (Date.now() - startTime > timeLimitMs) throw new Error("TIMEOUT");

  // 王様が取られた場合の超絶ペナルティ（絶対回避・絶対取得のロジック）
  let goteKing = false, senteKing = false;
  for(let y=0;y<9;y++){
      for(let x=0;x<9;x++){
          if(board[y][x] && board[y][x].type==='K'){
              if(board[y][x].owner==='gote') goteKing=true;
              else senteKing=true;
          }
      }
  }
  if (!goteKing) return -200000 - depth;
  if (!senteKing) return 200000 + depth;

  if (depth === 0) return evaluateBoard(board, hands);

  const moves = generateAllMoves(board, hands, playerTurn);
  if (moves.length === 0) return isMaximizingPlayer ? -Infinity : Infinity;

  // 取る手を優先的に探索（アルファベータ法の効率を最大化）
  moves.sort((a, b) => {
      let scoreA = 0; let scoreB = 0;
      if (!a.drop && board[a.to.y][a.to.x]) scoreA += PIECE_VALUES[board[a.to.y][a.to.x].type] || 100;
      if (!b.drop && board[b.to.y][b.to.x]) scoreB += PIECE_VALUES[board[b.to.y][b.to.x].type] || 100;
      return scoreB - scoreA;
  });

  if (isMaximizingPlayer) {
      let maxEval = -Infinity;
      for (let move of moves) {
          const undo = makeMove(board, hands, move, playerTurn);
          let eval = alphaBeta(board, hands, depth - 1, alpha, beta, false, 'sente');
          unmakeMove(board, hands, undo, playerTurn);
          
          maxEval = Math.max(maxEval, eval);
          alpha = Math.max(alpha, eval);
          if (beta <= alpha) break;
      }
      return maxEval;
  } else {
      let minEval = Infinity;
      for (let move of moves) {
          const undo = makeMove(board, hands, move, playerTurn);
          let eval = alphaBeta(board, hands, depth - 1, alpha, beta, true, 'gote');
          unmakeMove(board, hands, undo, playerTurn);
          
          minEval = Math.min(minEval, eval);
          beta = Math.min(beta, eval);
          if (beta <= alpha) break;
      }
      return minEval;
  }
}

self.onmessage = function(e) {
  const { board, hands, turn, limit } = e.data;
  timeLimitMs = limit || 2000;
  startTime = Date.now();
  
  let bestMoveFinal = null;
  const rootMoves = generateAllMoves(board, hands, 'gote');
  
  if (rootMoves.length === 0) {
      self.postMessage({ bestMove: null });
      return;
  }

  // ルートでも取る手を優先（多様性は評価関数のランダム性で担保）
  rootMoves.sort((a, b) => {
      let scoreA = 0; let scoreB = 0;
      if (!a.drop && board[a.to.y][a.to.x]) scoreA += PIECE_VALUES[board[a.to.y][a.to.x].type] || 100;
      if (!b.drop && board[b.to.y][b.to.x]) scoreB += PIECE_VALUES[board[b.to.y][b.to.x].type] || 100;
      return scoreB - scoreA;
  });

  try {
      // 反復深化：深さ1から最大6まで時間を許す限り読む
      for (let currentDepth = 1; currentDepth <= 6; currentDepth++) {
          let bestMoveCurrentDepth = null;
          let bestScore = -Infinity;
          let alpha = -Infinity;
          let beta = Infinity;

          for (let move of rootMoves) {
              const undo = makeMove(board, hands, move, 'gote');
              
              // 自分の王様を取られる手（自殺手）は無視する
              let goteKing = false, senteKing = false;
              for(let y=0;y<9;y++){
                  for(let x=0;x<9;x++){
                      if(board[y][x] && board[y][x].type==='K'){
                          if(board[y][x].owner==='gote') goteKing=true;
                          else senteKing=true;
                      }
                  }
              }
              if (!senteKing) {
                  unmakeMove(board, hands, undo, 'gote');
                  self.postMessage({ bestMove: move }); // 相手の王を取れるなら即完了
                  return; 
              }
              if (!goteKing) {
                  unmakeMove(board, hands, undo, 'gote');
                  continue; // 自殺手なのでスキップ（ここで王手放置を遮断）
              }

              let score = alphaBeta(board, hands, currentDepth - 1, alpha, beta, false, 'sente');
              unmakeMove(board, hands, undo, 'gote');
              
              if (score > bestScore) {
                  bestScore = score;
                  bestMoveCurrentDepth = move;
              }
              alpha = Math.max(alpha, bestScore);
          }
          
          if (bestMoveCurrentDepth) bestMoveFinal = bestMoveCurrentDepth;
          // 次の深さの探索のために、一番良かった手を一番最初に持ってくる
          rootMoves.sort((a, b) => a === bestMoveFinal ? -1 : 0);
      }
  } catch (error) {
      if (error.message !== "TIMEOUT") console.error("AI Error:", error);
  }

  if (!bestMoveFinal && rootMoves.length > 0) bestMoveFinal = rootMoves[0];

  self.postMessage({ bestMove: bestMoveFinal });
};
