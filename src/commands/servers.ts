import { SlashCommandBuilder, ChatInputCommandInteraction, Message, PermissionFlagsBits } from 'discord.js';
import { Command } from './command.interface';
import { robloxService } from '../services/roblox';

export const serversCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('servers')
        .setDescription('Lists active servers for a given Place ID')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option => 
            option.setName('placeid')
                .setDescription('The Roblox Place ID')
                .setRequired(true)),

    async execute(interaction: ChatInputCommandInteraction) {
        const placeId = interaction.options.getString('placeid', true);
        await interaction.deferReply();

        try {
            const servers = await robloxService.getActiveServers(placeId);
            const serverCount = servers.length;
            const totalPlayers = servers.reduce((acc, server) => acc + server.playing, 0);

            await interaction.editReply(`Found ${serverCount} active servers with a total of ${totalPlayers} players for Place ID ${placeId}.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            await interaction.editReply(`❌ Failed to fetch server information: ${message}`);
        }
    },

    async executePrefix(message: Message, args: string[]) {
        if (args.length < 1) {
            message.reply('Usage: !servers <placeId>');
            return;
        }
        const placeId = args[0];

        try {
            const servers = await robloxService.getActiveServers(placeId);
            const serverCount = servers.length;
            const totalPlayers = servers.reduce((acc, server) => acc + server.playing, 0);

            message.reply(`Found ${serverCount} active servers with a total of ${totalPlayers} players.`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            message.reply(`❌ Failed to fetch server information: ${errorMessage}`);
        }
    }
};
