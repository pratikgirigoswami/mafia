const socket = io();

// DOM
const roleEl = document.getElementById('role');
const logEl = document.getElementById('log');
const btnPing = document.getElementById('btnPing');

socket.on('connect', () => {
  roleEl.textContent = `Connected as ${socket.id}`;
  appendLog('connected: ' + socket.id);
});

// server -> client test
socket.on('pong-from-server', (d) => {
  appendLog('received pong: ' + JSON.stringify(d));
});

btnPing.addEventListener('click', () => {
  appendLog('sending ping...');
  socket.emit('ping-from-client', { ts: Date.now() });
});

function appendLog(txt){
  const p = document.createElement('div');
  p.textContent = txt;
  logEl.prepend(p);
}
