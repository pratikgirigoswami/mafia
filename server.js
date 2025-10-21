const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- In-memory store ---
const games = {}; // { gameId: { hostId, players: [{id,name,role,alive}], locked, phase, pendingElim, savedPlayer } }

// --- Helpers ---
function generateGameId() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function assignRoles(players) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const total = players.length;
  const numMafia = Math.max(1, Math.floor(total * 0.3));
  const roles = Array(total).fill('Citizen');
  for (let i = 0; i < numMafia; i++) roles[i] = 'Mafia';
  if (total > 2) roles[numMafia] = 'Detective';
  if (total > 3) roles[numMafia + 1] = 'Doctor';
  return shuffled.map((p, i) => ({ ...p, role: roles[i], alive: true }));
}

function checkWin(game) {
  const mafia = game.players.filter(p => p.role === 'Mafia' && p.alive);
  const citizens = game.players.filter(p => p.role !== 'Mafia' && p.alive);
  if (mafia.length === 0) return 'Citizens';
  if (mafia.length >= citizens.length) return 'Mafia';
  return null;
}

// --- Socket connections ---
io.on('connection', (socket) => {
  console.log('socket connected:', socket.id);

  // Host creates game
  socket.on('host-create-game', () => {
    const gameId = generateGameId();
    games[gameId] = { hostId: socket.id, players: [], locked: false, phase: 'waiting', pendingElim: null, savedPlayer: null };
    socket.join(gameId);
    socket.emit('game-created', { gameId });
  });

  // Player joins
  socket.on('player-join', ({ name, gameId }) => {
    const game = games[gameId];
    if (!game || game.locked) return socket.emit('join-failed', { reason: 'Game not found or locked' });
    const player = { id: socket.id, name, alive: true };
    game.players.push(player);
    socket.join(gameId);
    io.to(game.hostId).emit('player-list-update', game.players);
    socket.emit('join-success', { gameId, name });
  });

  // Host locks game → assign roles
  socket.on('host-lock-game', ({ gameId }) => {
    const game = games[gameId];
    if (!game || socket.id !== game.hostId) return;
    game.locked = true;
    game.players = assignRoles(game.players);
    game.phase = 'night';
    // Send roles privately to players
    game.players.forEach(p => io.to(p.id).emit('role-reveal', { role: p.role }));
    io.to(game.hostId).emit('roles-assigned', game.players);
    io.to(gameId).emit('game-locked');
  });

  // Host starts night
  socket.on('start-night', ({ gameId }) => {
    const game = games[gameId];
    if (!game || socket.id !== game.hostId) return;
    game.phase = 'night';
    game.pendingElim = null;
    game.savedPlayer = null;
    io.to(gameId).emit('phase-update', { phase: 'night' });
  });

  // Host selects Mafia target
  socket.on('mafia-kill', ({ gameId, playerId }) => {
    const game = games[gameId];
    if (!game) return;
    game.pendingElim = playerId;
  });

  // Host selects Doctor save
  socket.on('doctor-save', ({ gameId, playerId }) => {
    const game = games[gameId];
    if (!game) return;
    game.savedPlayer = playerId;
  });

  // Host starts day → resolve night actions
  socket.on('start-day', ({ gameId }) => {
    const game = games[gameId];
    if (!game) return;
    game.phase = 'day';
    if (game.pendingElim && game.pendingElim !== game.savedPlayer) {
      const victim = game.players.find(p => p.id === game.pendingElim);
      if (victim) victim.alive = false;
      io.to(game.hostId).emit('night-result', { killed: victim.name, role: victim.role });
    } else {
      io.to(game.hostId).emit('night-result', { killed: null });
    }
    io.to(game.hostId).emit('player-list-update', game.players);
    const winner = checkWin(game);
    if (winner) {
      game.phase = 'over';
      io.to(gameId).emit('game-over', { winner });
    }
  });

  // Host starts voting → eliminate player
  socket.on('vote-elim', ({ gameId, playerId }) => {
    const game = games[gameId];
    if (!game) return;
    const victim = game.players.find(p => p.id === playerId);
    if (victim) victim.alive = false;
    io.to(game.hostId).emit('vote-result', { killed: victim.name, role: victim.role });
    io.to(game.hostId).emit('player-list-update', game.players);
    const winner = checkWin(game);
    if (winner) {
      game.phase = 'over';
      io.to(gameId).emit('game-over', { winner });
    }
  });

  socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
