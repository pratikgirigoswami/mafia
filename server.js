const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

let games = {}; // store game sessions

function assignRoles(players) {
    const numMafia = Math.ceil(players.length * 0.3);
    const shuffled = [...players].sort(() => 0.5 - Math.random());
    shuffled.forEach((p, idx) => {
        if (idx < numMafia) p.role = 'Mafia';
        else if (idx === numMafia) p.role = 'Doctor';
        else if (idx === numMafia + 1) p.role = 'Detective';
        else p.role = 'Citizen';
        p.alive = true;
    });
    return shuffled;
}

io.on('connection', socket => {
    console.log('New connection:', socket.id);

    // Host creates game
    socket.on('host-create-game', () => {
        const gameId = Math.random().toString(36).substring(2, 7).toUpperCase();
        games[gameId] = { hostId: socket.id, players: [], phase: 'waiting', pendingElim: null, savedPlayer: null };
        socket.join(gameId);
        socket.emit('game-created', { gameId });
    });

    // Player joins game
    socket.on('player-join', ({ name, gameId }) => {
        const game = games[gameId];
        if (!game) return socket.emit('join-failed', { reason: 'Game not found' });
        const player = { id: socket.id, name, alive: true };
        game.players.push(player);
        socket.join(gameId);
        socket.emit('join-success', { gameId, name });
        io.to(gameId).emit('player-list-update', game.players);
    });

    // Host locks game → assign roles
    socket.on('host-lock-game', ({ gameId }) => {
        const game = games[gameId];
        if (!game || socket.id !== game.hostId) return;
        assignRoles(game.players).forEach(p => {
            io.to(p.id).emit('role-reveal', { role: p.role });
        });
        io.to(gameId).emit('roles-assigned', game.players);
        game.phase = 'night';
    });

    // Host actions
    socket.on('start-night', ({ gameId }) => {
        const game = games[gameId]; if (!game) return;
        game.phase = 'night';
        io.to(gameId).emit('phase-update', { phase: 'night' });
    });

    socket.on('mafia-kill', ({ gameId, playerId }) => {
        const game = games[gameId]; if (!game) return;
        game.pendingElim = playerId;
        game.phase = 'doctor';
        io.to(gameId).emit('phase-update', { phase: 'doctor' });
    });

    socket.on('doctor-save', ({ gameId, playerId }) => {
        const game = games[gameId]; if (!game) return;
        game.savedPlayer = playerId;
        game.phase = 'day';
        io.to(gameId).emit('phase-update', { phase: 'day' });
    });

    socket.on('start-day', ({ gameId }) => {
        const game = games[gameId]; if (!game) return;
        const killed = (game.pendingElim && game.pendingElim !== game.savedPlayer) ? game.pendingElim : null;
        let killedRole = null;
        if (killed) {
            const p = game.players.find(pl => pl.id === killed);
            if (p) { p.alive = false; killedRole = p.role; }
        }
        io.to(gameId).emit('night-result', { killed: killed ? game.players.find(p => p.id === killed).name : null, role: killedRole });
        game.pendingElim = null;
        game.savedPlayer = null;
        game.phase = 'vote';
        io.to(gameId).emit('phase-update', { phase: 'vote' });
        io.to(gameId).emit('player-list-update', game.players);
    });

    socket.on('vote-elim', ({ gameId, playerId }) => {
        const game = games[gameId]; if (!game) return;
        const p = game.players.find(pl => pl.id === playerId);
        if (p) p.alive = false;
        io.to(gameId).emit('vote-result', { killed: p.name, role: p.role });
        game.phase = 'night';
        io.to(gameId).emit('phase-update', { phase: 'night' });
        io.to(gameId).emit('player-list-update', game.players);
        checkWin(gameId);
    });

    socket.on('end-game', ({ gameId }) => {
        const game = games[gameId];
        if (!game || socket.id !== game.hostId) return;
        game.phase = 'over';
        io.to(gameId).emit('game-over', { winner: 'Game Ended by Host' });
        delete games[gameId];
    });

    function checkWin(gameId) {
        const game = games[gameId]; if (!game) return;
        const mafiaAlive = game.players.filter(p => p.alive && p.role === 'Mafia').length;
        const citizenAlive = game.players.filter(p => p.alive && p.role !== 'Mafia').length;
        if (mafiaAlive === 0) io.to(gameId).emit('game-over', { winner: 'Citizens' });
        else if (mafiaAlive >= citizenAlive) io.to(gameId).emit('game-over', { winner: 'Mafia' });
    }

    socket.on('disconnect', () => {
        // Optional: remove player from all games
    });
});

http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
