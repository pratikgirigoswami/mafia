const socket = io();
let currentGameId = null;
let isHost = false;

// Elements
const btnHost = document.getElementById('btnHost');
const btnJoin = document.getElementById('btnJoin');
const nameInput = document.getElementById('nameInput');
const gameInput = document.getElementById('gameInput');
const hostControls = document.getElementById('hostControls');
const menu = document.getElementById('menu');
const playerUI = document.getElementById('playerUI');
const playerListEl = document.getElementById('playerList');
const gameIdEl = document.getElementById('gameId');

// Host buttons
const btnStartNight = document.getElementById('btnStartNight');
const btnMafiaKill = document.getElementById('btnMafiaKill');
const btnDoctorSave = document.getElementById('btnDoctorSave');
const btnStartDay = document.getElementById('btnStartDay');
const btnVoteElim = document.getElementById('btnVoteElim');
const btnEndGame = document.getElementById('btnEndGame');

// Targets
const mafiaTarget = document.getElementById('mafiaTarget');
const doctorTarget = document.getElementById('doctorTarget');
const voteTarget = document.getElementById('voteTarget');

// Player role popup
const roleBox = document.getElementById('roleBox');
const roleMsg = document.getElementById('roleMsg');
const closeRoleMsg = document.getElementById('closeRoleMsg');
const joinStatus = document.getElementById('joinStatus');

closeRoleMsg.onclick = () => (roleBox.style.display = 'none');

// Message Box helpers
function showMessage(text) {
  const box = document.getElementById('messageBox');
  const msg = document.getElementById('messageText');
  msg.textContent = text;
  box.style.display = 'flex';
}
function closeMessage() {
  document.getElementById('messageBox').style.display = 'none';
}

// ----- Host Flow -----
btnHost.onclick = () => {
  socket.emit('host-create-game');
};

// Server confirms game created
socket.on('game-created', ({ gameId }) => {
  currentGameId = gameId;
  isHost = true;
  gameIdEl.textContent = gameId;
  menu.style.display = 'none';
  hostControls.style.display = 'block';
  updateHostControls('waiting');
  showMessage(`Game Created! ID: ${gameId}`);
});

// When player joins
socket.on('player-joined', (players) => {
  if (isHost) updatePlayerList(players);
});

// Update player list on host screen
function updatePlayerList(players) {
  playerListEl.innerHTML = players
    .map((p) => `<li>${p.name} - ${p.alive ? 'Alive' : 'Dead'}</li>`)
    .join('');
  updateTargets(players);
}

// Update dropdown targets
function updateTargets(players) {
  const alive = players.filter((p) => p.alive);
  [mafiaTarget, doctorTarget, voteTarget].forEach((sel) => {
    sel.innerHTML = alive.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  });
}

// Step enable/disable function
function updateHostControls(step) {
  const disableAll = () => {
    [
      btnStartNight,
      btnMafiaKill,
      btnDoctorSave,
      btnStartDay,
      btnVoteElim,
      mafiaTarget,
      doctorTarget,
      voteTarget,
    ].forEach((b) => (b.disabled = true));
  };

  disableAll();
  switch (step) {
    case 'waiting':
      btnStartNight.disabled = false;
      break;
    case 'mafia':
      mafiaTarget.disabled = false;
      btnMafiaKill.disabled = false;
      break;
    case 'doctor':
      doctorTarget.disabled = false;
      btnDoctorSave.disabled = false;
      break;
    case 'day':
      btnStartDay.disabled = false;
      break;
    case 'voting':
      voteTarget.disabled = false;
      btnVoteElim.disabled = false;
      break;
  }
}

// Host button actions
btnStartNight.onclick = () => {
  socket.emit('start-night', { gameId: currentGameId });
  updateHostControls('mafia');
};

btnMafiaKill.onclick = () => {
  socket.emit('mafia-kill', { gameId: currentGameId, targetId: mafiaTarget.value });
  updateHostControls('doctor');
};

btnDoctorSave.onclick = () => {
  socket.emit('doctor-save', { gameId: currentGameId, targetId: doctorTarget.value });
  updateHostControls('day');
};

btnStartDay.onclick = () => {
  socket.emit('start-day', { gameId: currentGameId });
  updateHostControls('voting');
};

btnVoteElim.onclick = () => {
  socket.emit('vote-elim', { gameId: currentGameId, targetId: voteTarget.value });
  updateHostControls('waiting');
};

btnEndGame.onclick = () => {
  socket.emit('end-game', { gameId: currentGameId });
  showMessage("Game ended. Start new game when ready.");
  hostControls.style.display = 'none';
  menu.style.display = 'block';
};

// ----- Player Flow -----
btnJoin.onclick = () => {
  const name = nameInput.value.trim();
  const gameId = gameInput.value.trim();
  i
