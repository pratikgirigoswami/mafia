const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from "public"
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('socket connected:', socket.id);

  // simple ping-pong for testing
  socket.on('ping-from-client', (payload) => {
    console.log('ping from client', payload);
    socket.emit('pong-from-server', { msg: 'pong', time: Date.now() });
  });

  socket.on('disconnect', (reason) => {
    console.log('socket disconnect', socket.id, reason);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
