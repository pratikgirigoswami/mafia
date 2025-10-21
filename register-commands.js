require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const commands = [
    new SlashCommandBuilder().setName('start').setDescription('Starts a new Mafia game and opens the lobby.'),
    new SlashCommandBuilder().setName('join').setDescription('Joins the current game lobby.'),
    new SlashCommandBuilder().setName('lock').setDescription('[HOST] Locks the game, assigns roles, and starts Night 1.'),
    new SlashCommandBuilder().setName('status').setDescription('[HOST] Shows the host\'s private "cheat sheet" of all players and roles.'),
    
    new SlashCommandBuilder().setName('night').setDescription('[HOST] Manually starts the night phase.'),
    new SlashCommandBuilder()
        .setName('kill')
        .setDescription('[HOST] (Mafia Phase) Selects the player to be eliminated.')
        .addUserOption(option => 
            option.setName('player')
                .setDescription('The player the Mafia wishes to kill')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('save')
        .setDescription('[HOST] (Doctor Phase) Selects the player to be saved.')
        .addUserOption(option =>
            option.setName('player')
                .setDescription('The player the Doctor wishes to save')
                .setRequired(true)),
    new SlashCommandBuilder().setName('day').setDescription('[HOST] Starts the day and reveals the night\'s results.'),
    new SlashCommandBuilder()
        .setName('vote')
        .setDescription('[HOST] (Vote Phase) Eliminates a player by vote.')
        .addUserOption(option =>
            option.setName('player')
                .setDescription('The player being eliminated by vote')
                .setRequired(true)),
    new SlashCommandBuilder().setName('end').setDescription('[HOST] Forcibly ends the current game.'),
]
.map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        // This registers the commands for all servers your bot is in.
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();
