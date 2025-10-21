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
const btnLockGame = document.getElementById('btnLockGame'); // ✅ Added
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
// This function is called by the HTML button
function closeMessage() {
  document.getElementById('messageBox').style.display = 'none';
}

// ----- Host Flow -----
btnHost.onclick = () => {
  socket.emit('host-create-game');
};

// ----- Player Flow -----
btnJoin.onclick = () => {
  const name = nameInput.value.trim();
  const gameId = gameInput.value.trim();
  if (!name || !gameId) return showMessage("Please enter both name and Game ID");

  socket.emit('player-join', { name, gameId });
};

// ----- SHARED LISTENERS -----

// When player (or host) successfully joins/creates
socket.on('join-success', ({ name, gameId }) => {
  menu.style.display = 'none';
  playerUI.style.display = 'block';
  joinStatus.textContent = `Joined Game ${gameId} as ${name}`;
});

socket.on('game-created', ({ gameId }) => {
  currentGameId = gameId;
  isHost = true;
  gameIdEl.textContent = gameId;
  menu.style.display = 'none';
  hostControls.style.display = 'block';
  updateHostControls('waiting'); // Start in 'waiting' phase
  showMessage(`Game Created! ID: ${gameId}. Share this ID with players.`);
});

// When join fails
socket.on('join-failed', ({ reason }) => {
  showMessage(`Join failed: ${reason}`);
});

// Show role to player
socket.on('role-reveal', ({ role }) => {
  roleMsg.textContent = `Your role: ${role}`;
  roleBox.style.display = 'block'; // Use block
  // Hide role after 30 seconds
  setTimeout(() => (roleBox.style.display = 'none'), 30000);
});

// ✅ FIXED: Listen for 'player-list-update'
socket.on('player-list-update', (players) => {
  if (isHost) updatePlayerList(players);
});

// ✅ ADDED: Listen for game phase changes
socket.on('phase-update', ({ phase }) => {
  if (isHost) updateHostControls(phase);
});

// ✅ ADDED: Listen for night results
socket.on('night-result', ({ killed, role }) => {
    if (killed) {
        showMessage(`Last night, ${killed} was eliminated. They were a ${role}.`);
    } else {
        showMessage('Last night, nobody was eliminated. The Doctor made a save!');
    }
});

// ✅ ADDED: Listen for vote results
socket.on('vote-result', ({ killed, role }) => {
    showMessage(`${killed} was voted out. They were a ${role}.`);
});

// Game over message for all
socket.on('game-over', ({ winner }) => {
  showMessage(`Game Over! Winner: ${winner}`);
  // Reset UI
  hostControls.style.display = 'none';
  playerUI.style.display = 'none';
  menu.style.display = 'block';
  isHost = false;
  currentGameId = null;
});


// ----- HOST FUNCTIONS -----

// Update player list on host screen
function updatePlayerList(players) {
  playerListEl.innerHTML = players
    .map((p) => {
        let roleInfo = isHost && p.role ? ` - ${p.role}` : ''; // Only show role if host
        return `<li style="${!p.alive ? 'text-decoration: line-through; color: #888;' : ''}">
                  ${p.name} ${roleInfo}
                </li>`
    })
    .join('');
  updateTargets(players);
}

// Update dropdown targets
function updateTargets(players) {
  const alive = players.filter((p) => p.alive);
  const options = alive.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  [mafiaTarget, doctorTarget, voteTarget].forEach((sel) => {
    sel.innerHTML = options;
  });
}

// ✅ OVERHAULED: Step enable/disable function
function updateHostControls(phase) {
  // Disable all controls first
  [
    btnLockGame,
    btnStartNight,
    btnMafiaKill,
    btnDoctorSave,
    btnStartDay,
    btnVoteElim,
    mafiaTarget,
    doctorTarget,
    voteTarget,
  ].forEach((el) => (el.disabled = true));

  // Enable controls based on server's phase
  switch (phase) {
    case 'waiting':
      btnLockGame.disabled = false;
      break;
    case 'night':
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
    case 'vote': // ✅ Changed from 'voting' to 'vote'
      voteTarget.disabled = false;
      btnVoteElim.disabled = false;
      break;
  }
}

// ----- HOST BUTTON ACTIONS -----
// (✅ REMOVED all manual updateHostControls calls)

btnLockGame.onclick = () => {
    socket.emit('host-lock-game', { gameId: currentGameId });
};

btnStartNight.onclick = () => {
  socket.emit('start-night', { gameId: currentGameId });
};

btnMafiaKill.onclick = () => {
  // ✅ FIXED: Send 'targetId'
  socket.emit('mafia-kill', { gameId: currentGameId, targetId: mafiaTarget.value });
};

btnDoctorSave.onclick = () => {
  // ✅ FIXED: Send 'targetId'
  socket.emit('doctor-save', { gameId: currentGameId, targetId: doctorTarget.value });
};

btnStartDay.onclick = () => {
  socket.emit('start-day', { gameId: currentGameId });
};

btnVoteElim.onclick = () => {
  // ✅ FIXED: Send 'targetId'
  socket.emit('vote-elim', { gameId: currentGameId, targetId: voteTarget.value });
};

btnEndGame.onclick = () => {
  if (confirm('Are you sure you want to end the game?')) {
    socket.emit('end-game', { gameId: currentGameId });
  }
};

// ✅ REMOVED broken, duplicate btnJoin.onclick
