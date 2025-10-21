const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const games = {}; // { gameId: { hostId, players: [{id,name}], locked:false } }

// --- Helper ---
function generateGameId() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

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

  // host locks the game
  socket.on('host-lock-game', ({ gameId }) => {
    const game = games[gameId];
    if (game && socket.id === game.hostId) {
      game.locked = true;
      io.to(gameId).emit('game-locked');
      console.log(`Game ${gameId} locked.`);
    }
  });

  socket.on('disconnect', () => {
    // basic cleanup (optional for now)
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
