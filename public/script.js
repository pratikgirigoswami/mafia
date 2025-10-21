const socket = io();

const btnHost = document.getElementById('btnHost');
const btnJoin = document.getElementById('btnJoin');
const btnLock = document.getElementById('btnLock');
const btnJoinGame = document.getElementById('btnJoinGame');

const menu = document.getElementById('menu');
const hostUI = document.getElementById('hostUI');
const playerUI = document.getElementById('playerUI');
const gameIdEl = document.getElementById('gameId');
const playerListEl = document.getElementById('playerList');
const gameInput = document.getElementById('gameInput');
const nameInput = document.getElementById('nameInput');
const joinStatus = document.getElementById('joinStatus');

let currentGameId = null;

btnHost.onclick = () => {
  socket.emit('host-create-game');
  menu.style.display = 'none';
  hostUI.style.display = 'block';
};

socket.on('game-created', ({ gameId }) => {
  currentGameId = gameId;
  gameIdEl.textContent = gameId;
  alert(`Game created! Share this code with players: ${gameId}`);
});

btnLock.onclick = () => {
  if (currentGameId) socket.emit('host-lock-game', { gameId: currentGameId });
};

socket.on('player-list-update', (players) => {
  playerListEl.innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
});

socket.on('game-locked', () => {
  alert('Game Locked! Ready for role assignment next.');
});

// Player joins
btnJoin.onclick = () => {
  menu.style.display = 'none';
  playerUI.style.display = 'block';
};

btnJoinGame.onclick = () => {
  const gameId = gameInput.value.trim().toUpperCase();
  const name = nameInput.value.trim();
  if (!gameId || !name) return;
  socket.emit('player-join', { name, gameId });
};

socket.on('join-success', ({ gameId, name }) => {
  joinStatus.textContent = `Joined game ${gameId} as ${name}. Wait for host to start.`;
});

socket.on('join-failed', ({ reason }) => {
  joinStatus.textContent = `Failed to join: ${reason}`;
});

// --- Player gets role ---
socket.on('role-reveal', ({ role }) => {
  joinStatus.innerHTML = `<b>Your Role:</b> ${role}<br>(Visible for 30 seconds)`;
  setTimeout(() => {
    joinStatus.textContent = 'Role hidden. Wait for host to continue.';
  }, 30000);
});

// --- Host gets all roles ---
socket.on('roles-assigned', (players) => {
  playerListEl.innerHTML = players
    .map(p => `<li>${p.name} - <b>${p.role}</b></li>`)
    .join('');
  alert('Roles assigned! Ready to start the game.');
});

// --- Existing code from previous step stays ---
socket.on('phase-update', ({ phase }) => {
  alert('Phase changed: ' + phase);
});

socket.on('night-result', ({ killed, role }) => {
  if (killed) alert(`Night Result: ${killed} was eliminated (${role})`);
  else alert('Night Result: Doctor saved everyone!');
});

socket.on('vote-result', ({ killed, role }) => {
  alert(`Voting Result: ${killed} eliminated (${role})`);
});

socket.on('game-over', ({ winner }) => {
  alert(`Game Over! Winner: ${winner}`);
});


