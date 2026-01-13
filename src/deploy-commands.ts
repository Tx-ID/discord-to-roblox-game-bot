import { REST, Routes } from 'discord.js';
import { config } from './config';
import { commands } from './commands';

const commandsData = Array.from(commands.values()).map(command => command.data.toJSON());

const rest = new REST({ version: '10' }).setToken(config.discordToken);

(async () => {
    try {
        console.log(`Started refreshing ${commandsData.length} application (/) commands.`);

        // If a guild ID is provided, register for that guild (immediate updates)
        // Otherwise, register globally (can take up to an hour)
        if (config.discordGuildId) {
            console.log(`Registering commands to guild: ${config.discordGuildId}`);
            await rest.put(
                Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
                { body: commandsData },
            );
        } else {
            console.log('Registering commands globally.');
            await rest.put(
                Routes.applicationCommands(config.discordClientId),
                { body: commandsData },
            );
        }

        console.log(`Successfully reloaded ${commandsData.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
})();
