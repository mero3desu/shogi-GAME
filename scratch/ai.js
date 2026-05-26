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

function cloneBoard(b) {
  return b.map(row => row.map(cell => cell ? { ...cell } : null));
}
function cloneHands(h) {
  return { sente: { ...h.sente }, gote: { ...h.gote } };
}

function simulateMove(currentBoard, currentHands, move, playerTurn) {
  const newBoard = cloneBoard(currentBoard);
  const newHands = cloneHands(currentHands);
  if (move.drop) {
    newBoard[move.to.y][move.to.x] = { type: move.type, owner: playerTurn, promoted: false };
    newHands[playerTurn][move.type]--;
  } else {
    const targetPiece = newBoard[move.to.y][move.to.x];
    if (targetPiece && targetPiece.owner !== playerTurn) {
      newHands[playerTurn][targetPiece.type] = (newHands[playerTurn][targetPiece.type] || 0) + 1;
    }
    let movedPiece = { ...newBoard[move.from.y][move.from.x] };
    newBoard[move.to.y][move.to.x] = movedPiece;
    newBoard[move.from.y][move.from.x] = null;
    
    const isSente = playerTurn === 'sente';
    const promotionZone = isSente ? [0, 1, 2] : [6, 7, 8];
    if (PIECE_TYPES[movedPiece.type].promoted && !movedPiece.promoted && (promotionZone.includes(move.to.y) || promotionZone.includes(move.from.y))) {
       movedPiece.promoted = true;
    }
  }
  return { board: newBoard, hands: newHands };
}

// --- Evaluation Logic ---
// King safety PST (Center is bad, edges and back rows are good)
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
]; // From Sente perspective (y=8 is bottom/home)

function evaluateBoard(currentBoard, currentHands) {
  let score = 0;
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const p = currentBoard[y][x];
      if (p) {
        let val = p.promoted && PROMOTED_VALUES[p.type] ? PROMOTED_VALUES[p.type] : PIECE_VALUES[p.type];
        
        // Positional evaluation
        let posBonus = 0;
        if (p.type === 'K') {
            posBonus = p.owner === 'sente' ? KING_PST[y][x] : KING_PST[8-y][x];
        } else {
            // General advance bonus for other pieces
            const advanceBonus = p.owner === 'gote' ? y : (8 - y);
            posBonus = advanceBonus * 3;
            // Center control bonus
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
  
  // Add a small random noise (±5) to introduce variety without ruining good moves
  score += (Math.random() * 10 - 5);
  return score;
}

// --- Search Logic (Iterative Deepening & Alpha-Beta) ---
let timeLimitMs = 2000;
let startTime = 0;

function alphaBeta(board, hands, depth, alpha, beta, isMaximizingPlayer, playerTurn) {
  if (Date.now() - startTime > timeLimitMs) throw new Error("TIMEOUT");

  // Basic King capture check at leaf nodes to avoid deep evaluation of lost games
  if (depth === 0) {
      return evaluateBoard(board, hands);
  }

  const moves = generateAllMoves(board, hands, playerTurn);
  if (moves.length === 0) return isMaximizingPlayer ? -Infinity : Infinity;

  // Move ordering: captures and promotions first
  moves.sort((a, b) => {
      let scoreA = 0; let scoreB = 0;
      if (!a.drop && board[a.to.y][a.to.x]) scoreA += 100; // Capture
      if (!b.drop && board[b.to.y][b.to.x]) scoreB += 100;
      return scoreB - scoreA;
  });

  if (isMaximizingPlayer) {
      let maxEval = -Infinity;
      for (let move of moves) {
          const stateAfter = simulateMove(board, hands, move, playerTurn);
          
          // Check for immediate king capture to prune early
          let scoreCheck = evaluateBoard(stateAfter.board, stateAfter.hands);
          if (scoreCheck > 50000) return scoreCheck + depth; // Prefer faster mate

          let eval = alphaBeta(stateAfter.board, stateAfter.hands, depth - 1, alpha, beta, false, 'sente');
          maxEval = Math.max(maxEval, eval);
          alpha = Math.max(alpha, eval);
          if (beta <= alpha) break; // Prune
      }
      return maxEval;
  } else {
      let minEval = Infinity;
      for (let move of moves) {
          const stateAfter = simulateMove(board, hands, move, playerTurn);
          
          let scoreCheck = evaluateBoard(stateAfter.board, stateAfter.hands);
          if (scoreCheck < -50000) return scoreCheck - depth;

          let eval = alphaBeta(stateAfter.board, stateAfter.hands, depth - 1, alpha, beta, true, 'gote');
          minEval = Math.min(minEval, eval);
          beta = Math.min(beta, eval);
          if (beta <= alpha) break; // Prune
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

  // Shuffle root moves slightly for variety
  rootMoves.sort(() => Math.random() - 0.5);

  try {
      // Iterative Deepening
      for (let currentDepth = 1; currentDepth <= 5; currentDepth++) {
          let bestMoveCurrentDepth = null;
          let bestScore = -Infinity;
          let alpha = -Infinity;
          let beta = Infinity;

          for (let move of rootMoves) {
              const stateAfter = simulateMove(board, hands, move, 'gote');
              let scoreCheck = evaluateBoard(stateAfter.board, stateAfter.hands);
              if (scoreCheck > 50000) {
                  // Immediate mate found
                  self.postMessage({ bestMove: move });
                  return;
              }

              let score = alphaBeta(stateAfter.board, stateAfter.hands, currentDepth - 1, alpha, beta, false, 'sente');
              
              if (score > bestScore) {
                  bestScore = score;
                  bestMoveCurrentDepth = move;
              }
              alpha = Math.max(alpha, bestScore);
          }
          
          if (bestMoveCurrentDepth) {
              bestMoveFinal = bestMoveCurrentDepth;
          }
          
          // Re-sort root moves so the best move is checked first next depth
          rootMoves.sort((a, b) => a === bestMoveFinal ? -1 : 0);
      }
  } catch (error) {
      if (error.message !== "TIMEOUT") {
          console.error("AI Error:", error);
      }
      // Timeout reached, we use the bestMoveFinal found so far
  }

  // Fallback if something went wrong
  if (!bestMoveFinal && rootMoves.length > 0) {
      bestMoveFinal = rootMoves[0];
  }

  self.postMessage({ bestMove: bestMoveFinal });
};
