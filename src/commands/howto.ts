import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from './command.interface';

export const howtoCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('howto')
        .setDescription('Quick guide for Roblox integration'),

    async execute(interaction: ChatInputCommandInteraction) {
        const luaCode = `local MS = game:GetService("MessagingService")
local HS = game:GetService("HttpService")

local function onMsg(msg)
    local data = msg.Data
    -- If data is a JSON string (Object from Bot):
    local success, decoded = pcall(function() return HS:JSONDecode(data) end)
    
    if success then
        -- Check if it's meant for this server or all
        if not decoded.JobId or decoded.JobId == game.JobId then
            print("Received Payload:", decoded.Payload)
        end
    else
        print("Raw string received:", data)
    end
end

MS:SubscribeAsync("perseus", onMsg)
MS:SubscribeAsync("perseus-all", onMsg)
MS:SubscribeAsync("perseus-admin", onMsg)
MS:SubscribeAsync("perseus-all-admin", onMsg)`;

        const embed = new EmbedBuilder()
            .setTitle('📘 Roblox Setup')
            .setDescription('Use `MessagingService:SubscribeAsync` to handle bot commands.')
            .setColor(0x00b0f4)
            .addFields(
                {
                    name: '📡 Topics & Data Types',
                    value: '• `perseus` / `all`: Supports **Objects** (JSON) or **Strings**.\n• `perseus-admin` / `all`: Supports **Strings Only** (Chat Commands).'
                },
                {
                    name: '📦 Message Structure (msg.Data)',
                    value: '• **perseus**: `{"JobId": "...", "Payload": {}}` or `string`\n' +
                           '• **perseus-all**: `{"Payload": {}}` or `string`\n' +
                           '• **perseus-admin**: `{"JobId": "...", "Payload": "string"}`\n' +
                           '• **perseus-all-admin**: `{"Payload": "string"}`'
                },
                {
                    name: '⚠️ Note',
                    value: 'Use `HttpService:JSONDecode` to parse Objects sent from the Control Panel.'
                },
                {
                    name: '📜 Example',
                    value: `\`\`\`lua\n${luaCode}\n\`\`\``
                }
            );

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
