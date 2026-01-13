import { 
    ChatInputCommandInteraction, 
    SlashCommandBuilder, 
    SlashCommandOptionsOnlyBuilder,
    SlashCommandSubcommandsOnlyBuilder,
    Message 
} from 'discord.js';

export interface Command {
    data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
    // Optional for backward compatibility/hybrid support
    executePrefix?(message: Message, args: string[]): Promise<void>;
}