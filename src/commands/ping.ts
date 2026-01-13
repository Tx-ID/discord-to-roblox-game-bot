import { SlashCommandBuilder, ChatInputCommandInteraction, Message } from 'discord.js';
import { Command } from './command.interface';

export const pingCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
    
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.reply('Pong!');
    },

    async executePrefix(message: Message) {
        await message.reply('Pong!');
    }
};
