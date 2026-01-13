import { SlashCommandBuilder, ChatInputCommandInteraction, Message, PermissionFlagsBits } from 'discord.js';
import { Command } from './command.interface';
import { dbManager } from '../database';

export const blacklistCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('blacklist')
        .setDescription('Manage user blacklist for links and attachments')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a user to the blacklist')
                .addUserOption(option => option.setName('user').setDescription('The user to blacklist').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a user from the blacklist')
                .addUserOption(option => option.setName('user').setDescription('The user to un-blacklist').setRequired(true))),

    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();
        const user = interaction.options.getUser('user', true);

        await interaction.deferReply({ ephemeral: true });

        try {
            if (subcommand === 'add') {
                await dbManager.addBlacklist(user.id);
                await interaction.editReply(`Successfully added ${user.tag} to the blacklist.`);
            } else if (subcommand === 'remove') {
                await dbManager.removeBlacklist(user.id);
                await interaction.editReply(`Successfully removed ${user.tag} from the blacklist.`);
            }
        } catch (error) {
            console.error('Blacklist command error:', error);
            await interaction.editReply('An error occurred while updating the blacklist.');
        }
    },

    async executePrefix(message: Message, args: string[]) {
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
            message.reply('You do not have permission to use this command.');
            return;
        }

        if (args.length < 2) {
            message.reply('Usage: !blacklist <add|remove> <userId>');
            return;
        }

        const action = args[0].toLowerCase();
        const userId = args[1].replace(/[<@!>]/g, ''); // Basic ID cleanup

        try {
            if (action === 'add') {
                await dbManager.addBlacklist(userId);
                message.reply(`Successfully added user ${userId} to the blacklist.`);
            } else if (action === 'remove') {
                await dbManager.removeBlacklist(userId);
                message.reply(`Successfully removed user ${userId} from the blacklist.`);
            } else {
                message.reply('Usage: !blacklist <add|remove> <userId>');
            }
        } catch (error) {
            console.error('Blacklist command error:', error);
            message.reply('An error occurred while updating the blacklist.');
        }
    }
};
