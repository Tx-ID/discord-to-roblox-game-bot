import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} from 'discord.js';
import { Command } from './command.interface';
import { robloxService, LuauExecutionTask } from '../services/roblox';

export const executeCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('execute')
        .setDescription('Execute Luau (Open Cloud). Creates a NEW EMPTY server for dev/maintenance (NOT for public servers).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option => 
            option.setName('placeid')
                .setDescription('The Roblox Place ID')
                .setRequired(true))
        .addNumberOption(option =>
            option.setName('version')
                .setDescription('Specific Place Version (Optional)')
                .setRequired(false)),

    async execute(interaction: ChatInputCommandInteraction) {
        const placeId = interaction.options.getString('placeid', true);
        const version = interaction.options.getNumber('version') || undefined;

        // Show Modal for script input
        const modal = new ModalBuilder()
            .setCustomId(`exec-modal-${Date.now()}`)
            .setTitle('Execute Luau Script');

        const scriptInput = new TextInputBuilder()
            .setCustomId('script_content')
            .setLabel("Luau Script")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("print('Hello World')")
            .setRequired(true);

        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(scriptInput);
        modal.addComponents(row);

        await interaction.showModal(modal);

        try {
            const submission = await interaction.awaitModalSubmit({ time: 300000 }); // 5 minutes to submit
            await submission.deferReply();

            const script = submission.fields.getTextInputValue('script_content');
            
            let universeId: number;
            try {
                universeId = await robloxService.getUniverseId(placeId);
            } catch (error) {
                 await submission.editReply('Failed to resolve Universe ID from Place ID. Please check the ID.');
                 return;
            }

            // Confirmation Step
            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Confirm Execution')
                .setDescription(`You are about to execute a script in:\n**Place ID:** ${placeId}\n**Universe ID:** ${universeId}\n${version ? `**Version:** ${version}` : ''}`)
                .addFields({ name: 'Script Preview', value: `\`\`\`lua\n${script.slice(0, 1000)}\n\`\`\`` })
                .setColor(0xFEE75C);

            const confirmButton = new ButtonBuilder()
                .setCustomId('confirm_exec')
                .setLabel('Confirm')
                .setStyle(ButtonStyle.Success);

            const cancelButton = new ButtonBuilder()
                .setCustomId('cancel_exec')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger);

            const actionRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(confirmButton, cancelButton);

            const response = await submission.editReply({ 
                embeds: [confirmEmbed], 
                components: [actionRow] 
            });

            try {
                const confirmation = await response.awaitMessageComponent({ 
                    filter: i => i.user.id === interaction.user.id, 
                    time: 30000,
                    componentType: ComponentType.Button
                });

                if (confirmation.customId === 'cancel_exec') {
                    await confirmation.update({ content: '❌ Execution Cancelled.', embeds: [], components: [] });
                    return;
                }

                await confirmation.update({ content: '⏳ Creating task...', components: [] });

            } catch (e) {
                await submission.editReply({ content: '⚠️ Confirmation timed out. Execution Cancelled.', embeds: [], components: [] });
                return;
            }

            let task: LuauExecutionTask;
            try {
                task = await robloxService.createLuauExecutionTask(universeId, placeId, script, version);
            } catch (error) {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                await submission.editReply(`❌ Failed to create task: ${msg}`);
                return;
            }

            const initialEmbed = new EmbedBuilder()
                .setTitle('🚀 Task Created')
                .setDescription(`Task ID: ${task.path.split('/').pop()}\nStatus: **${task.state}**`)
                .setColor(0xFEE75C);
            
            await submission.editReply({ embeds: [initialEmbed], components: [] });

            // Poll for completion
            const pollInterval = 3000; // 3 seconds
            const maxRetries = 20; // 1 minute timeout (approx)
            let attempts = 0;
            
            const poll = setInterval(async () => {
                attempts++;
                try {
                    const currentTask = await robloxService.getLuauExecutionTask(task.path);
                    
                    if (currentTask.state !== 'PROCESSING' && currentTask.state !== 'QUEUED') {
                        clearInterval(poll);
                        
                        const logs = await robloxService.getLuauExecutionTaskLogs(task.path);
                        const resultEmbed = new EmbedBuilder();
                        
                        if (currentTask.state === 'COMPLETE') {
                            resultEmbed.setTitle('✅ Task Completed')
                                .setColor(0x57F287);
                            
                            if (currentTask.output && currentTask.output.results) {
                                resultEmbed.addFields({
                                    name: 'Output',
                                    value: `\`\`\`json\n${JSON.stringify(currentTask.output.results, null, 2).slice(0, 1000)}\n\`\`\`` 
                                });
                            }
                        } else {
                            resultEmbed.setTitle(`Task ${currentTask.state}`)
                                .setColor(0xED4245);
                            
                            if (currentTask.error) {
                                resultEmbed.addFields({
                                    name: 'Error',
                                    value: `**Code:** ${currentTask.error.code}\n**Message:** ${currentTask.error.message}`
                                });
                            }
                        }

                        if (logs) {
                             // Logs can be long, so we might need to truncate or attach as file if too long
                             // For now, truncate to 1024 chars
                             const truncatedLogs = logs.length > 1000 ? logs.slice(0, 1000) + '... (truncated)' : logs;
                             resultEmbed.addFields({ name: 'Logs', value: `\`\`\`\n${truncatedLogs}\n\`\`\`` });
                        }

                        await submission.editReply({ embeds: [resultEmbed] });
                    }

                    if (attempts >= maxRetries) {
                        clearInterval(poll);
                        await submission.followUp({ content: '⚠️ Polling timed out. The task is still running in the background.', ephemeral: true });
                    }
                } catch (err) {
                    clearInterval(poll);
                    console.error("Polling error:", err);
                }
            }, pollInterval);

        } catch (err) {
            // Modal timed out or other error
            console.error("Execute command error:", err);
        }
    }
};
