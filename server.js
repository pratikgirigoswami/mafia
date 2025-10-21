const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- In-memory store ---
const games = {}; // { gameId: { hostId, players: [{id,name,role}], locked:false } }

// --- Helper: generate Game ID ---
function generateGameId() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// --- Helper: assign roles ---
function assignRoles(players) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const total = players.length;

  const numMafia = Math.max(1, Math.floor(total * 0.3));
  const roles = Array(total).fill('Citizen');

  // assign Mafia
  for (let i = 0; i < numMafia; i++) roles[i] = 'Mafia';

  // assign Detective
  if (total > 2) roles[numMafia] = 'Detective';

  // assign Doctor
  if (total > 3) roles[numMafia + 1] = 'Doctor';

  // shuffle again to randomize placement
  const final = shuffled.map((p, i) => ({ ...p, role: roles[i] }));
  return final;
}

// --- Socket connections ---
io.on('connection', (socket) => {
  console.log('socket connected:', socket.id);

  // host creates new game
  socket.on('host-create-game', () => {
    const gameId = generateGameId();
    games[gameId] = {
      hostId: socket.id,
      players: [],
      locked: false
    };
    socket.join(gameId);
    socket.emit('game-created', { gameId });
    console.log('Game created:', gameId);
  });

  // player joins game
  socket.on('player-join', ({ name, gameId }) => {
    const game = games[gameId];
    if (!game || game.locked) {
      socket.emit('join-failed', { reason: 'Game not found or locked.' });
      return;
    }
    const player = { id: socket.id, name };
    game.players.push(player);
    socket.join(gameId);
    console.log(`${name} joined game ${gameId}`);

    // notify host & players
    io.to(game.hostId).emit('player-list-update', game.players);
    socket.emit('join-success', { gameId, name });
  });

  // host locks the game → assign roles
  socket.on('host-lock-game', ({ gameId }) => {
    const game = games[gameId];
    if (game && socket.id === game.hostId) {
      game.locked = true;
      game.players = assignRoles(game.players);

      // Send roles privately to each player
      game.players.forEach((p) => {
        io.to(p.id).emit('role-reveal', { role: p.role });
      });

      // Send full player list (with roles) to host only
      io.to(game.hostId).emit('roles-assigned', game.players);

      // Notify everyone game is locked
      io.to(gameId).emit('game-locked');
      console.log(`Game ${gameId} locked. Roles assigned.`);
    }
  });

  socket.on('disconnect', () => {
    // optional cleanup
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
