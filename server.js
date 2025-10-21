// --- Helper: assign roles ---
function assignRoles(players) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const total = players.length;

  const numMafia = Math.max(1, Math.floor(total * 0.3));
  const roles = Array(total).fill('Citizen');

  // assign Mafia
  for (let i = 0; i < numMafia; i++) roles[i] = 'Mafia';

  // assign Detective
  if (total > 2) roles[numMafia] = 'Detective';

  // assign Doctor
  if (total > 3) roles[numMafia + 1] = 'Doctor';

  // shuffle again to randomize placement
  const final = shuffled.map((p, i) => ({ ...p, role: roles[i] }));
  return final;
}

socket.on('host-lock-game', ({ gameId }) => {
  const game = games[gameId];
  if (game && socket.id === game.hostId) {
    game.locked = true;
    game.players = assignRoles(game.players);

    // Send roles privately to each player
    game.players.forEach((p) => {
      io.to(p.id).emit('role-reveal', { role: p.role });
    });

    // Send full player list (with roles) to host only
    io.to(game.hostId).emit('roles-assigned', game.players);

    // Notify everyone game is locked
    io.to(gameId).emit('game-locked');
    console.log(`Game ${gameId} locked. Roles assigned.`);
  }
});
