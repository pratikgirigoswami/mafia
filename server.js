// --- 1. Setup ---
require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// This keeps track of all games. We'll key it by channel ID.
let games = {};

// --- 2. Your Original Game Logic (Adapted for Discord) ---

/**
 * Assigns roles to players in a game.
 * We now use the 'user' object to DM them later.
 */
function assignRoles(players) {
    const numMafia = Math.max(1, Math.floor(players.length * 0.3));
    const shuffled = [...players].sort(() => 0.5 - Math.random());
    
    let assignedDoctor = false;
    let assignedDetective = false;
    
    shuffled.forEach((p, idx) => {
        p.alive = true;
        if (idx < numMafia) {
            p.role = 'Mafia';
        } else if (idx === numMafia && players.length > 2) {
            p.role = 'Doctor';
            assignedDoctor = true;
        } else if (idx === numMafia + 1 && players.length > 3) {
            p.role = 'Detective';
            assignedDetective = true;
        } else {
            p.role = 'Citizen';
        }
    });

    if (!assignedDoctor && players.length > 2) {
        let cit = shuffled.find(p => p.role === 'Citizen');
        if (cit) cit.role = 'Doctor';
    }
    if (!assignedDetective && players.length > 3) {
        let cit = shuffled.find(p => p.role === 'Citizen');
        if (cit) cit.role = 'Detective';
    }
    
    return shuffled;
}

/**
 * Checks for a win condition.
 * Returns 'Townsfolk' or 'Mafia' if there's a winner, otherwise null.
 */
function checkWin(game) {
    if (!game) return null;
    const mafiaAlive = game.players.filter(p => p.alive && p.role === 'Mafia').length;
    const townsfolkAlive = game.players.filter(p => p.alive && p.role !== 'Mafia').length;

    if (mafiaAlive === 0) return 'Townsfolk';
    if (mafiaAlive >= townsfolkAlive) return 'Mafia';
    return null;
}

/**
 * Creates the helpful 'Cheat Sheet' embed for the host.
 */
function createHostEmbed(game) {
    const alivePlayers = game.players.filter(p => p.alive);
    const mafiaCount = alivePlayers.filter(p => p.role === 'Mafia').length;
    const townsfolkCount = alivePlayers.filter(p => p.role !== 'Mafia').length;

    const playerList = game.players.map(p => {
        const status = p.alive ? '☀️ Alive' : '💀 Dead';
        const role = p.role ? p.role : '???';
        return `**${p.name}** (${status}) - ${role}`;
    }).join('\n');

    return new EmbedBuilder()
        .setTitle('Mafia Host Cheat Sheet')
        .setDescription(`**Phase:** ${game.phase.toUpperCase()}\n\n${playerList}`)
        .addFields(
            { name: 'Players Alive', value: `${alivePlayers.length}`, inline: true },
            { name: 'Townsfolk', value: `${townsfolkCount}`, inline: true },
            { name: 'Mafia', value: `${mafiaCount}`, inline: true }
        )
        .setColor(0x0099FF)
        .setFooter({ text: 'This message is only visible to you.' });
}

// --- 3. Bot Commands & Event Listeners ---
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('Bot is ready and running.');
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, channel, user } = interaction;
    const game = games[channel.id]; // Get the game for this channel

    // --- Host-Only Command Check ---
    const hostOnlyCommands = ['lock', 'night', 'kill', 'save', 'day', 'vote', 'end', 'status'];
    if (hostOnlyCommands.includes(commandName) && (!game || user.id !== game.hostId)) {
        await interaction.reply({ content: 'Only the host of the current game can use this command!', ephemeral: true });
        return;
    }

    // --- /start command ---
    if (commandName === 'start') {
        if (game) {
            await interaction.reply({ content: 'A game is already in progress in this channel!', ephemeral: true });
            return;
        }
        
        games[channel.id] = {
            hostId: user.id,
            hostUser: user,
            players: [],
            phase: 'waiting',
            pendingElim: null,
            savedPlayer: null,
            channel: channel
        };

        await interaction.reply(`A new Mafia game has been started by **${user.username}**!\nType **/join** to join the game.`);
    }

    // --- /join command ---
    if (commandName === 'join') {
        if (!game) {
            await interaction.reply({ content: 'No game is currently waiting for players!', ephemeral: true });
            return;
        }
        if (game.phase !== 'waiting') {
            await interaction.reply({ content: 'This game has already started!', ephemeral: true });
            return;
        }
        if (game.players.some(p => p.id === user.id)) {
            await interaction.reply({ content: 'You have already joined this game!', ephemeral: true });
            return;
        }

        const player = {
            id: user.id,
            name: user.username,
            user: user, // Store the user object to send DMs
            alive: true,
            role: null
        };
        game.players.push(player);

        await interaction.reply(`**${user.username}** has joined the game! (${game.players.length} players total)`);
    }

    // --- /lock command ---
    if (commandName === 'lock') {
        if (game.players.length < 3) {
            await interaction.reply({ content: 'You need at least 3 players to start!', ephemeral: true });
            return;
        }

        game.phase = 'night';
        assignRoles(game.players);

        // This is the "magic" role reveal, now super simple!
        for (const player of game.players) {
            try {
                await player.user.send(`The game has started! Your role is: **${player.role}**`);
            } catch (error) {
                console.log(`Could not DM ${player.name}`);
                await channel.send(`@${player.name}, I couldn't send you a DM. Please check your privacy settings!`);
            }
        }

        await interaction.reply('**The game is locked!** Roles have been sent via DM. I will now send the host the cheat sheet.');
        // Send the host their private cheat sheet
        await game.hostUser.send({ embeds: [createHostEmbed(game)] });
        await channel.send('**Night 1 begins!** (Host, check your DMs for commands)');
    }

    // --- /status (Host Cheat Sheet) ---
    if (commandName === 'status') {
         await interaction.reply({ embeds: [createHostEmbed(game)], ephemeral: true });
    }

    // --- /night command ---
    if (commandName === 'night') {
        game.phase = 'mafia';
        await interaction.reply({ content: '🌙 **Night begins.**\nHost: Use **/kill** to select the Mafia\'s target.', ephemeral: true });
    }

    // --- /kill command ---
    if (commandName === 'kill') {
        const targetUser = options.getUser('player');
        game.pendingElim = targetUser.id;
        game.phase = 'doctor';
        
        await interaction.reply({ content: `Target **${targetUser.username}** logged.\nHost: Use **/save** to select the Doctor's target.`, ephemeral: true });
    }
    
    // --- /save command ---
    if (commandName === 'save') {
        const targetUser = options.getUser('player');
        game.savedPlayer = targetUser.id;
        game.phase = 'day';

        await interaction.reply({ content: `Save **${targetUser.username}** logged.\nHost: Use **/day** to proceed.`, ephemeral: true });
    }

    // --- /day command ---
    if (commandName === 'day') {
        let killedPlayer = null;
        let killedRole = 'Townsfolk'; // Default alignment
        const killedId = (game.pendingElim && game.pendingElim !== game.savedPlayer) ? game.pendingElim : null;

        let message = "☀️ **Day begins!**\n";

        if (killedId) {
            const p = game.players.find(pl => pl.id === killedId);
            if (p) {
                p.alive = false;
                killedPlayer = p;
                killedRole = (p.role === 'Mafia') ? 'Mafia' : 'Townsfolk';
                message += `Last night, **${p.name}** was eliminated! Their alignment was **${killedRole}**.`;
            }
        } else {
            message += "A peaceful night! No one was eliminated.";
        }
        
        await channel.send(message);

        // Reset for next night
        game.pendingElim = null;
        game.savedPlayer = null;

        // Check for win
        const winner = checkWin(game);
        if (winner) {
            await channel.send(`**GAME OVER! The ${winner.toUpperCase()} win!**`);
            delete games[channel.id]; // End game
            return;
        }

        game.phase = 'vote';
        await channel.send("The discussion begins. Host, use **/vote** when ready.");
        await game.hostUser.send({ embeds: [createHostEmbed(game)], ephemeral: true }); // Update host
    }

    // --- /vote command ---
    if (commandName === 'vote') {
        const targetUser = options.getUser('player');
        const p = game.players.find(pl => pl.id === targetUser.id);

        let message = "";

        if (p) {
            p.alive = false;
            const killedRole = (p.role === 'Mafia') ? 'Mafia' : 'Townsfolk';
            message = `By popular vote, **${p.name}** has been eliminated! Their alignment was **${killedRole}**.`;
        } else {
            message = "Error in voting. Player not found.";
        }
        
        await channel.send(message);

        // Check for win
        const winner = checkWin(game);
        if (winner) {
            await channel.send(`**GAME OVER! The ${winner.toUpperCase()} win!**`);
            delete games[channel.id]; // End game
            return;
        }

        game.phase = 'night';
        await channel.send("Night falls... Host, use **/night** when ready.");
        await game.hostUser.send({ embeds: [createHostEmbed(game)], ephemeral: true }); // Update host
    }

    // --- /end command ---
    if (commandName === 'end') {
        delete games[channel.id];
        await interaction.reply('Game has been ended by the host.');
    }
});


// --- 5. Login ---
client.login(TOKEN);
