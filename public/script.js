const socket = io();

let currentGameId = null;
let currentStep = 'waiting';

const btnHost = document.getElementById('btnHost');
const btnJoin = document.getElementById('btnJoin');
const btnStartNight = document.getElementById('btnStartNight');
const btnMafiaKill = document.getElementById('btnMafiaKill');
const btnDoctorSave = document.getElementById('btnDoctorSave');
const btnStartDay = document.getElementById('btnStartDay');
const btnVoteElim = document.getElementById('btnVoteElim');
const btnEndGame = document.getElementById('btnEndGame');

const menu = document.getElementById('menu');
const hostControls = document.getElementById('hostControls');
const playerUI = document.getElementById('playerUI');
const playerListEl = document.getElementById('playerList');
const mafiaTarget = document.getElementById('mafiaTarget');
const doctorTarget = document.getElementById('doctorTarget');
const voteTarget = document.getElementById('voteTarget');
const nameInput = document.getElementById('nameInput');
const gameInput = document.getElementById('gameInput');
const gameIdEl = document.getElementById('gameId');
const roleBox = document.getElementById('roleBox');
const roleMsg = document.getElementById('roleMsg');
const closeRoleMsg = document.getElementById('closeRoleMsg');
const joinStatus = document.getElementById('joinStatus');

// Host Game button
btnHost.onclick = () => {
  socket.emit('host-game');
};

// When server confirms game creation
socket.on('game-created', ({ gameId }) => {
  currentGameId = gameId;
  showMessage(`Game Created! ID: ${gameId}`);
  document.getElementById('joinSection').style.display = 'none';
  document.getElementById('hostControls').style.display = 'block';
  document.getElementById('playerListSection').style.display = 'block';
  updateHostControls('waiting'); // disable all until ready
});


// Player joins
btnJoin.onclick = () => {
    const name = nameInput.value.trim();
    const gameId = gameInput.value.trim();
    if (!name || !gameId) return alert('Enter name & Game ID');
    socket.emit('player-join', { name, gameId });
    menu.style.display = 'none';
    playerUI.style.display = 'block';
};

socket.on('join-success', ({ name }) => {
    joinStatus.textContent = `Joined game as ${name}. Wait for host.`;
});

socket.on('join-failed', ({ reason }) => alert('Failed to join: ' + reason));

// Show role once, no popups after hidden
socket.on('role-reveal', ({ role }) => {
    roleBox.style.display = 'block';
    roleMsg.innerHTML = `<b>Your Role:</b> ${role}`;
    setTimeout(() => {
        roleMsg.innerHTML = `Role hidden. Wait for host.`;
    }, 30000);
});

closeRoleMsg.onclick = () => roleBox.style.display = 'none';

// Host receives full roles
socket.on('roles-assigned', (players) => {
    hostControls.style.display = 'block';
    updatePlayerList(players);
    updateDropdowns(players);
    updateHostControls('night');
});

function updatePlayerList(players) {
    playerListEl.innerHTML = players.map(p => `<li>${p.name} - ${p.alive ? 'Alive' : 'Dead'}</li>`).join('');
}

function updateDropdowns(players) {
    [mafiaTarget, doctorTarget, voteTarget].forEach(sel => {
        sel.innerHTML = players.filter(p => p.alive).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    });
}

function showMessage(text) {
  const box = document.getElementById('messageBox');
  const msg = document.getElementById('messageText');
  msg.textContent = text;
  box.style.display = 'flex';
}

function closeMessage() {
  document.getElementById('messageBox').style.display = 'none';
}


function updateHostControls(step) {
    currentStep = step;
    btnStartNight.disabled = step !== 'night';
    btnMafiaKill.disabled = step !== 'mafia';
    btnDoctorSave.disabled = step !== 'doctor';
    btnStartDay.disabled = step !== 'day';
    btnVoteElim.disabled = step !== 'vote';
    btnEndGame.disabled = false;
}

// Host button events
btnStartNight.onclick = () => {
    socket.emit('start-night', { gameId: currentGameId });
    updateHostControls('mafia');
};

btnMafiaKill.onclick = () => {
    socket.emit('mafia-kill', { gameId: currentGameId, playerId: mafiaTarget.value });
    updateHostControls('doctor');
};

btnDoctorSave.onclick = () => {
    socket.emit('doctor-save', { gameId: currentGameId, playerId: doctorTarget.value });
    updateHostControls('day');
};

btnStartDay.onclick = () => {
    socket.emit('start-day', { gameId: currentGameId });
    updateHostControls('vote');
};

btnVoteElim.onclick = () => {
    socket.emit('vote-elim', { gameId: currentGameId, playerId: voteTarget.value });
    updateHostControls('night');
};

btnEndGame.onclick = () => {
    socket.emit('end-game', { gameId: currentGameId });
    updateHostControls('over');
};

// Updates player list dynamically
socket.on('player-list-update', updatePlayerList);

// Night/Day results
socket.on('phase-update', ({ phase }) => console.log('Phase:', phase));
socket.on('night-result', ({ killed, role }) => {
    if (killed) alert(`Night Result: ${killed} was eliminated (${role})`);
    else alert('Night Result: Doctor saved everyone!');
});
socket.on('vote-result', ({ killed, role }) => alert(`Voting Result: ${killed} eliminated (${role})`));
socket.on('game-over', ({ winner }) => alert(`Game Over! Winner: ${winner}`));
