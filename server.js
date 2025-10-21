const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

let games = {}; // store game sessions

function assignRoles(players) {
    const numMafia = Math.max(1, Math.floor(players.length * 0.3)); // Ensure at least 1 Mafia
    const shuffled = [...players].sort(() => 0.5 - Math.random());
    
    let assignedDoctor = false;
    let assignedDetective = false;
    
    shuffled.forEach((p, idx) => {
        p.alive = true;
        if (idx < numMafia) {
            p.role = 'Mafia';
        } else if (idx === numMafia && players.length > 2) { // Need >2 players for special roles
            p.role = 'Doctor';
            assignedDoctor = true;
        } else if (idx === numMafia + 1 && players.length > 3) { // Need >3 players for detective
            p.role = 'Detective';
            assignedDetective = true;
        } else {
            p.role = 'Citizen';
        }
    });

    // Handle small games: if no doc/det, assign them if possible
    if (!assignedDoctor && players.length > 2) {
         // Find first citizen and make them doctor
        let cit = shuffled.find(p => p.role === 'Citizen');
        if (cit) cit.role = 'Doctor';
    }
    if (!assignedDetective && players.length > 3) {
         // Find first *remaining* citizen and make them detective
        let cit = shuffled.find(p => p.role === 'Citizen');
         if (cit) cit.role = 'Detective';
    }
    
    return shuffled;
}

io.on('connection', socket => {
    console.log('New connection:', socket.id);

    // Host creates game
    socket.on('host-create-game', () => {
        const gameId = Math.random().toString(36).substring(2, 7).toUpperCase();
        games[gameId] = { 
            hostId: socket.id, 
            players: [], 
            phase: 'waiting', 
            pendingElim: null, 
            savedPlayer: null 
        };
        socket.join(gameId);
        socket.emit('game-created', { gameId });
    });

    // Player joins game
    socket.on('player-join', ({ name, gameId }) => {
        const game = games[gameId];
        if (!game) return socket.emit('join-failed', { reason: 'Game not found' });
        if (game.phase !== 'waiting') return socket.emit('join-failed', { reason: 'Game has already started' });
        
        const player = { id: socket.id, name, alive: true, role: null };
        game.players.push(player);
        socket.join(gameId);
        socket.emit('join-success', { gameId, name });
        io.to(gameId).emit('player-list-update', game.players); // Use 'player-list-update'
    });

    // Host locks game → assign roles
    socket.on('host-lock-game', ({ gameId }) => {
        const game = games[gameId];
        if (!game || socket.id !== game.hostId) return;
        if (game.players.length < 3) {
             // Optional: send message back to host
             return; // Need at least 3 players
        }

        assignRoles(game.players).forEach(p => {
            io.to(p.id).emit('role-reveal', { role: p.role });
        });
        
        io.to(gameId).emit('player-list-update', game.players); // Send updated list with roles (for host)
        game.phase = 'night';
        io.to(gameId).emit('phase-update', { phase: 'night' });
    });

    // Host actions
    socket.on('start-night', ({ gameId }) => {
        const game = games[gameId]; if (!game) return;
        game.phase = 'mafia'; // Set phase to 'mafia'
        io.to(gameId).emit('phase-update', { phase: 'mafia' }); // Tell client it's 'mafia' phase
    });

    // *** FIXED: Renamed playerId to targetId ***
    socket.on('mafia-kill', ({ gameId, targetId }) => {
        const game = games[gameId]; if (!game) return;
        game.pendingElim = targetId;
        game.phase = 'doctor';
        io.to(gameId).emit('phase-update', { phase: 'doctor' });
    });

    // *** FIXED: Renamed playerId to targetId ***
    socket.on('doctor-save', ({ gameId, targetId }) => {
        const game = games[gameId]; if (!game) return;
        game.savedPlayer = targetId;
        game.phase = 'day'; // Ready for day announcement
        io.to(gameId).emit('phase-update', { phase: 'day' });
    });

    socket.on('start-day', ({ gameId }) => {
        const game = games[gameId]; if (!game) return;
        
        const killedId = (game.pendingElim && game.pendingElim !== game.savedPlayer) ? game.pendingElim : null;
        let killedPlayer = null;
        let killedRole = null;

        if (killedId) {
            const p = game.players.find(pl => pl.id === killedId);
            if (p) { 
                p.alive = false; 
                killedPlayer = p.name;
                killedRole = (p.role === 'Mafia') ? 'Mafia' : 'Townsfolk'; // Only reveal alignment
            }
        }

        // Announce result
        if (killedPlayer) {
            io.to(gameId).emit('night-result', { killed: killedPlayer, role: killedRole });
        } else {
             io.to(gameId).emit('night-result', { killed: null, role: null });
        }

        game.pendingElim = null;
        game.savedPlayer = null;
        
        // Check for win *after* night kill
        if (checkWin(gameId)) return; 

        game.phase = 'vote';
        io.to(gameId).emit('phase-update', { phase: 'vote' });
        io.to(gameId).emit('player-list-update', game.players);
    });

    // *** FIXED: Renamed playerId to targetId ***
    socket.on('vote-elim', ({ gameId, targetId }) => {
        const game = games[gameId]; if (!game) return;
        const p = game.players.find(pl => pl.id === targetId);
        
        if (p) {
             p.alive = false;
             const killedRole = (p.role === 'Mafia') ? 'Mafia' : 'Townsfolk'; // Only reveal alignment
             io.to(gameId).emit('vote-result', { killed: p.name, role: killedRole });
        }

        // Check for win *after* vote kill
        if (checkWin(gameId)) return;

        game.phase = 'night';
        io.to(gameId).emit('phase-update', { phase: 'night' });
        io.to(gameId).emit('player-list-update', game.players);
    });

    socket.on('end-game', ({ gameId }) => {
        const game = games[gameId];
        if (!game || socket.id !== game.hostId) return;
        io.to(gameId).emit('game-over', { winner: 'Game Ended by Host' });
        delete games[gameId];
    });

    function checkWin(gameId) {
        const game = games[gameId]; if (!game) return false;
        
        const mafiaAlive = game.players.filter(p => p.alive && p.role === 'Mafia').length;
        const citizenAlive = game.players.filter(p => p.alive && p.role !== 'Mafia').length;

        let winner = null;
        if (mafiaAlive === 0) {
            winner = 'Townsfolk';
        } else if (mafiaAlive >= citizenAlive) {
            winner = 'Mafia';
        }
        
        if (winner) {
            io.to(gameId).emit('game-over', { winner });
            delete games[gameId]; // Clean up game
            return true;
        }
        return false;
    }

    socket.on('disconnect', () => {
        console.log('Connection disconnected:', socket.id);
        // Find and remove player from any games
        for (const gameId in games) {
            const game = games[gameId];
            const playerIndex = game.players.findIndex(p => p.id === socket.id);
            
            if (playerIndex !== -1) {
                game.players.splice(playerIndex, 1);
                io.to(gameId).emit('player-list-update', game.players);
                break;
            }
            
            // If host disconnects, end game
            if (game.hostId === socket.id) {
                 io.to(gameId).emit('game-over', { winner: 'Host disconnected' });
                 delete games[gameId];
            }
        }
    });
});

http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
