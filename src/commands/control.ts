import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    Message,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    ButtonInteraction,
    EmbedBuilder
} from 'discord.js';
import { Command } from './command.interface';
import { robloxService } from '../services/roblox';

export const controlCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('control')
        .setDescription('Interactive controller for Roblox messaging (Specific Server or Global)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option => 
            option.setName('placeid')
                .setDescription('The Roblox Place ID')
                .setRequired(true)),

    async execute(interaction: ChatInputCommandInteraction) {
        const placeId = interaction.options.getString('placeid', true);
        await interaction.deferReply();

        let universeId: number;
        try {
            universeId = await robloxService.getUniverseId(placeId);
        } catch (error) {
             await interaction.editReply('Failed to resolve Universe ID from Place ID. Please check the ID.');
             return;
        }

        // --- Helper State & Functions ---
        let servers: any[] = [];
        let currentPage = 0;
        const ITEMS_PER_PAGE = 25;
        let selectedJobId: string | null = null;
        let mode: 'SELECT' | 'BROADCAST' | null = null;

        // Fetch servers lazily if needed
        const fetchServers = async () => {
            if (servers.length === 0) {
                servers = await robloxService.getActiveServers(placeId);
                servers.sort((a, b) => b.playing - a.playing);
            }
            return servers;
        };

        const generateServerListComponents = (page: number) => {
            const start = page * ITEMS_PER_PAGE;
            const end = start + ITEMS_PER_PAGE;
            const pageServers = servers.slice(start, end);
            const totalPages = Math.ceil(servers.length / ITEMS_PER_PAGE);

            const options = pageServers.map((server) => {
                const shortId = server.id.length >= 13 ? server.id.slice(9, 13) : server.id.slice(0, 4);
                return new StringSelectMenuOptionBuilder()
                    .setLabel(`ServerID: ${shortId} | Players: ${server.playing}/${server.maxPlayers}`)
                    .setDescription(`Ping: ${server.ping}ms | FPS: ${server.fps}`)
                    .setValue(server.id);
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('server-select')
                .setPlaceholder(`Select a server (Page ${page + 1}/${totalPages})`)
                .addOptions(options);

            const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
            const buttonsRow = new ActionRowBuilder<ButtonBuilder>();

            if (totalPages > 1) {
                buttonsRow.addComponents(
                    new ButtonBuilder().setCustomId('prev-page').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                    new ButtonBuilder().setCustomId('next-page').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
                );
            }

            // Navigation buttons include "Back to Mode Select" and "Refresh"
            const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('mode-back').setLabel('Back').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('refresh-list').setLabel('Refresh List').setStyle(ButtonStyle.Secondary)
            );
            if (buttonsRow.components.length > 0) {
                navRow.addComponents(buttonsRow.components);
                return [selectRow, navRow];
            }

            return [selectRow, navRow];
        };

        const generateActionButtons = (target: 'SPECIFIC' | 'ALL') => {
            return new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn-system')
                        .setLabel(target === 'SPECIFIC' ? 'Send System (Admin)' : 'Broadcast System (All)')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('btn-normal')
                        .setLabel(target === 'SPECIFIC' ? 'Send Normal' : 'Broadcast Normal (All)')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('btn-custom')
                        .setLabel('Send Custom')
                        .setStyle(ButtonStyle.Secondary)
                );
        };

        const renderModeSelect = async (i?: any) => {
            const embed = new EmbedBuilder()
                .setTitle('🎮 Control Panel')
                .setDescription('Select an operation mode to interact with your Roblox game.')
                .addFields(
                    { name: 'Place ID', value: `\`${placeId}\``, inline: true },
                    { name: 'Universe ID', value: `\`${universeId}\``, inline: true }
                )
                .setColor(0x5865F2)
                .setTimestamp();

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('mode-specific').setLabel('Target Specific Server').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('mode-broadcast').setLabel('Broadcast to All Servers').setStyle(ButtonStyle.Danger)
            );
            
            const payload = {
                content: '',
                embeds: [embed],
                components: [row]
            };

            if (i) await i.update(payload);
            else await interaction.editReply(payload);
        };

        const renderServerSelect = async (i: any) => {
            await fetchServers();
            if (servers.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ No Active Servers')
                    .setDescription('Could not find any active servers for this place.')
                    .setColor(0xED4245);

                await i.update({ 
                    content: '',
                    embeds: [embed],
                    components: [
                        new ActionRowBuilder<ButtonBuilder>().addComponents(
                            new ButtonBuilder().setCustomId('mode-back').setLabel('Back').setStyle(ButtonStyle.Danger),
                            new ButtonBuilder().setCustomId('refresh-list').setLabel('Refresh List').setStyle(ButtonStyle.Secondary)
                        )
                    ] 
                });
                return;
            }

            const totalPages = Math.ceil(servers.length / ITEMS_PER_PAGE);
            const components = generateServerListComponents(currentPage);
            
            const embed = new EmbedBuilder()
                .setTitle('🖥️ Select Server')
                .setDescription(`Found **${servers.length}** active servers.`)
                .addFields(
                    { name: 'Page', value: `${currentPage + 1} / ${totalPages}`, inline: true },
                    { name: 'Place ID', value: `\`${placeId}\``, inline: true }
                )
                .setColor(0x5865F2);
            
            if (selectedJobId) {
                const s = servers.find(sv => sv.id === selectedJobId);
                if (s) {
                    embed.addFields(
                        { name: 'Selected Server', value: `\`${selectedJobId}\`` },
                        { name: 'Players', value: `${s.playing} / ${s.maxPlayers}`, inline: true },
                        { name: 'Ping / FPS', value: `${s.ping}ms / ${s.fps}`, inline: true }
                    );
                    // Add action buttons
                    const actions = generateActionButtons('SPECIFIC');
                    components.push(actions as any);
                }
            }

            await i.update({ content: '', embeds: [embed], components });
        };

        const renderBroadcastMenu = async (i: any) => {
            const embed = new EmbedBuilder()
                .setTitle('📢 Broadcast Mode')
                .setDescription(`Targeting **ALL** active servers in Universe \`${universeId}\`.`)
                .setColor(0xED4245)
                .setFooter({ text: 'Warning: This will affect all players across all servers.' });

            const actions = generateActionButtons('ALL');
            const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('mode-back').setLabel('Back to Mode Select').setStyle(ButtonStyle.Secondary)
            );

            await i.update({
                content: '',
                embeds: [embed],
                components: [actions, backRow]
            });
        };

        // --- Initial Render ---
        await renderModeSelect();

        // --- Collector ---
        const collector = interaction.channel?.createMessageComponentCollector({
            time: 3600000 // 1 hour
        });

        if (!collector) return;

        collector.on('collect', async (i) => {
            if (i.message.interaction?.id !== interaction.id && i.message.reference?.messageId !== (await interaction.fetchReply()).id) {
                 if (i.message.id !== (await interaction.fetchReply()).id) return;
            }

            const isAdmin = i.memberPermissions?.has(PermissionFlagsBits.Administrator);
            if (i.user.id !== interaction.user.id && !isAdmin) {
                await i.reply({ content: 'Not authorized.', ephemeral: true });
                return;
            }

            try {
                if (i.isButton()) {
                    const id = i.customId;

                    if (id === 'mode-specific') {
                        mode = 'SELECT';
                        selectedJobId = null;
                        currentPage = 0;
                        await renderServerSelect(i);
                    } else if (id === 'mode-broadcast') {
                        mode = 'BROADCAST';
                        await renderBroadcastMenu(i);
                    } else if (id === 'mode-back') {
                        mode = null;
                        await renderModeSelect(i);
                    } else if (id === 'refresh-list') {
                        servers = []; // Clear cache to force refetch
                        await renderServerSelect(i);
                    } else if (id === 'prev-page') {
                        if (currentPage > 0) currentPage--;
                        await renderServerSelect(i);
                    } else if (id === 'next-page') {
                        const totalPages = Math.ceil(servers.length / ITEMS_PER_PAGE);
                        if (currentPage < totalPages - 1) currentPage++;
                        await renderServerSelect(i);
                    } else if (['btn-system', 'btn-normal', 'btn-custom'].includes(id)) {
                        let topic = '';
                        let modalTitle = '';
                        let showTopicInput = false;

                        if (mode === 'SELECT' && !selectedJobId) {
                            await i.reply({ content: 'Please select a server first.', ephemeral: true });
                            return;
                        }

                        if (id === 'btn-system') {
                            topic = mode === 'SELECT' ? 'perseus-admin' : 'perseus-all-admin';
                            modalTitle = 'Send System Command';
                        } else if (id === 'btn-normal') {
                            topic = mode === 'SELECT' ? 'perseus' : 'perseus-all';
                            modalTitle = 'Send Normal Message';
                        } else {
                            modalTitle = 'Send Custom Message';
                            showTopicInput = true;
                        }

                        const modal = new ModalBuilder()
                            .setCustomId(`ctrl-modal-${Date.now()}`)
                            .setTitle(modalTitle);

                        const messageInput = new TextInputBuilder()
                            .setCustomId('message')
                            .setLabel("Message / Payload (JSON/String)")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true);

                        const rows = [];
                        if (showTopicInput) {
                            rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(
                                new TextInputBuilder().setCustomId('topic').setLabel("Topic").setStyle(TextInputStyle.Short).setRequired(true)
                            ));
                        }
                        rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput));
                        modal.addComponents(rows);

                        await i.showModal(modal);

                        try {
                            const submission = await i.awaitModalSubmit({ time: 60000 });
                            
                            const msgContent = submission.fields.getTextInputValue('message');
                            if (showTopicInput) {
                                topic = submission.fields.getTextInputValue('topic');
                            }

                            let payloadContent: any = msgContent;
                            try {
                                payloadContent = JSON.parse(msgContent);
                            } catch {}

                            let finalPayload;
                            if (mode === 'SELECT') {
                                finalPayload = {
                                    JobId: selectedJobId,
                                    Payload: payloadContent
                                };
                            } else {
                                finalPayload = {
                                    Payload: payloadContent
                                };
                            }

                            await robloxService.publishMessage(universeId, topic, finalPayload);

                            const resultEmbed = new EmbedBuilder()
                                .setTitle('✅ Message Sent')
                                .setColor(0x57F287)
                                .addFields(
                                    { name: 'Mode', value: mode === 'SELECT' ? 'Specific Server' : 'Broadcast', inline: true },
                                    { name: 'Topic', value: `\`${topic}\``, inline: true },
                                    { name: 'Target', value: mode === 'SELECT' ? `\`${selectedJobId}\`` : 'All Servers' }
                                )
                                .setTimestamp();

                            await submission.reply({
                                embeds: [resultEmbed],
                                ephemeral: true
                            });

                        } catch (err) {
                        }
                    }
                } else if (i.isStringSelectMenu() && i.customId === 'server-select') {
                    selectedJobId = i.values[0];
                    await renderServerSelect(i);
                }
            } catch (err) {
                console.error("Control interaction error:", err);
                if (!i.replied && !i.deferred) await i.reply({ content: 'Interaction failed.', ephemeral: true }).catch(() => {});
            }
        });

        collector.on('end', async () => {
             await interaction.editReply({ content: 'Control session timed out.', components: [], embeds: [] }).catch(() => {});
        });
    },
};
