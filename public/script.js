const socket = io();

// DOM elements
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

// --- Host control elements ---
const hostControls = document.getElementById('hostControls');
const btnStartNight = document.getElementById('btnStartNight');
const btnMafiaKill = document.getElementById('btnMafiaKill');
const btnDoctorSave = document.getElementById('btnDoctorSave');
const btnStartDay = document.getElementById('btnStartDay');
const btnVoteElim = document.getElementById('btnVoteElim');

const mafiaTarget = document.getElementById('mafiaTarget');
const doctorTarget = document.getElementById('doctorTarget');
const voteTarget = document.getElementById('voteTarget');

// --- Host actions ---
btnHost.onclick = () => {
  socket.emit('host-create-game');
  menu.style.display = 'none';
  hostUI.style.display = 'block';
};

socket.on('game-created', ({ gameId }) => {
  currentGameId = gameId;
  gameIdEl.textContent = gameId;
});

// Lock game → assign roles
btnLock.onclick = () => {
  socket.emit('host-lock-game', { gameId: currentGameId });
};

// Player actions
btnJoin.onclick = () => {
  menu.style.display = 'none';
  playerUI.style.display = 'block';
};

btnJoinGame.onclick = () => {
  const name = nameInput.value.trim();
  const gameId = gameInput.value.trim();
  if (!name || !gameId) return alert('Enter name & Game ID');
  socket.emit('player-join', { name, gameId });
};

socket.on('join-success', ({ gameId, name }) => {
  currentGameId = gameId;
  joinStatus.textContent = `Joined game as ${name}. Wait for host.`;
});

socket.on('join-failed', ({ reason }) => {
  alert('Failed to join: ' + reason);
});

// Roles reveal
socket.on('role-reveal', ({ role }) => {
  joinStatus.innerHTML = `<b>Your Role:</b> ${role}<br>(Visible for 30 seconds)`;
  setTimeout(() => {
    joinStatus.textContent = 'Role hidden. Wait for host to continue.';
  }, 30000);
});

// Host receives full roles
socket.on('roles-assigned', (players) => {
  hostControls.style.display = 'block';
  playerListEl.innerHTML = players.map(p => `<li>${p.name} - <b>${p.role}</b></li>`).join('');

  // populate dropdowns
  function updateOptions() {
    [mafiaTarget, doctorTarget, voteTarget].forEach(sel => {
      sel.innerHTML = players.filter(p => p.alive).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    });
  }
  updateOptions();
});

// --- Host button events ---
btnStartNight.onclick = () => {
  socket.emit('start-night', { gameId: currentGameId });
  alert('Night started');
};

btnMafiaKill.onclick = () => {
  const targetId = mafiaTarget.value;
  socket.emit('mafia-kill', { gameId: currentGameId, playerId: targetId });
  alert('Mafia target confirmed');
};

btnDoctorSave.onclick = () => {
  const targetId = doctorTarget.value;
  socket.emit('doctor-save', { gameId: currentGameId, playerId: targetId });
  alert('Doctor save confirmed');
};

btnStartDay.onclick = () => {
  socket.emit('start-day', { gameId: currentGameId });
};

btnVoteElim.onclick = () => {
  const targetId = voteTarget.value;
  socket.emit('vote-elim', { gameId: currentGameId, playerId: targetId });
  alert('Vote elimination confirmed');
};

// Updates player list in dropdowns dynamically
socket.on('player-list-update', (players) => {
  playerListEl.innerHTML = players.map(p => `<li>${p.name} - ${p.alive ? 'Alive' : 'Dead'}</li>`).join('');
  [mafiaTarget, doctorTarget, voteTarget].forEach(sel => {
    sel.innerHTML = players.filter(p => p.alive).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  });
});

// Night/Day results
socket.on('phase-update', ({ phase }) => alert('Phase changed: ' + phase));
socket.on('night-result', ({ killed, role }) => {
  if (killed) alert(`Night Result: ${killed} was eliminated (${role})`);
  else alert('Night Result: Doctor saved everyone!');
});
socket.on('vote-result', ({ killed, role }) => alert(`Voting Result: ${killed} eliminated (${role})`));
socket.on('game-over', ({ winner }) => alert(`Game Over! Winner: ${winner}`));
