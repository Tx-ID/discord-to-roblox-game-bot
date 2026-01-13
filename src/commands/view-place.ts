import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    PermissionFlagsBits
} from 'discord.js';
import { Command } from './command.interface';
import { robloxService } from '../services/roblox';

export const viewPlaceCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('view-place')
        .setDescription('View active servers and players for a specific Place ID')
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
        let currentPage = 0; // Server list page
        const ITEMS_PER_PAGE = 25;
        let selectedJobId: string | null = null;
        
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
                    .setLabel(`Server: ${shortId}... | Players: ${server.playing}/${server.maxPlayers}`)
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

            const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('refresh-list').setLabel('Refresh List').setStyle(ButtonStyle.Secondary)
            );
            if (buttonsRow.components.length > 0) {
                navRow.addComponents(buttonsRow.components);
            }

            return [selectRow, navRow];
        };

        const renderServerSelect = async (i?: any) => {
            selectedJobId = null; // Reset selection when going back to list
            await fetchServers();
            
            if (servers.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ No Active Servers')
                    .setDescription(`Could not find any active servers for Place ID 
${placeId}
.`) // Corrected: escaped newline character
                    .setColor(0xED4245);

                const payload = { 
                    content: '',
                    embeds: [embed],
                    components: [
                        new ActionRowBuilder<ButtonBuilder>().addComponents(
                            new ButtonBuilder().setCustomId('refresh-list').setLabel('Refresh List').setStyle(ButtonStyle.Secondary)
                        )
                    ] 
                };
                if (i) await i.update(payload);
                else await interaction.editReply(payload);
                return;
            }

            const totalPages = Math.ceil(servers.length / ITEMS_PER_PAGE);
            const components = generateServerListComponents(currentPage);
            
            const embed = new EmbedBuilder()
                .setTitle('🖥️ Server Browser')
                .setDescription(`Found **${servers.length}** active servers for Place ID 
${placeId}
.
Universe ID: 
${universeId}
`) // Corrected: escaped newline characters
                .addFields(
                    { name: 'Page', value: `${currentPage + 1} / ${totalPages}`, inline: true }
                )
                .setColor(0x5865F2);
            
            const payload = { content: '', embeds: [embed], components };
            if (i) await i.update(payload);
            else await interaction.editReply(payload);
        };

        const renderServerDetails = async (i: any, jobId: string) => {
            const server = servers.find(s => s.id === jobId);
            if (!server) {
                await i.reply({ content: 'Server not found (maybe it closed?). Refresh the list.', ephemeral: true });
                return;
            }

            // Fetch player details
            let playerListText = 'No players found.';
            if (server.playerIds && server.playerIds.length > 0) {
                try {
                    const players = await robloxService.getUsers(server.playerIds);
                    // Format: "Display Name (@Username) [ID]"
                    playerListText = players.map(p => `• **${p.displayName}** (@${p.name}) [
${p.id}
]`).join('\n'); // Corrected: escaped newline characters
                } catch (e) {
                    playerListText = 'Failed to load player names.';
                }
            }

            // Truncate if too long for one field (Discord limit 1024)
            const chunks = [];
            if (playerListText.length > 1024) {
                 // Simple chunking by newline to avoid breaking markdown
                 const lines = playerListText.split('\n');
                 let currentChunk = '';
                 for (const line of lines) {
                     if (currentChunk.length + line.length + 1 > 1024) {
                         chunks.push(currentChunk);
                         currentChunk = line + '\n';
                     } else {
                         currentChunk += line + '\n';
                     }
                 }
                 if (currentChunk) chunks.push(currentChunk);
            } else {
                chunks.push(playerListText);
            }

            const embed = new EmbedBuilder()
                .setTitle('🔍 Server Details')
                .setDescription(`**Job ID:** 
${jobId}
`)
                .addFields(
                    { name: 'Stats', value: `Players: ${server.playing}/${server.maxPlayers}
Ping: ${server.ping}ms
FPS: ${server.fps}`, inline: true }
                )
                .setColor(0x00B0F4);

            chunks.forEach((chunk, index) => {
                embed.addFields({ name: index === 0 ? 'Players' : 'Players (Cont.)', value: chunk });
            });

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('back-list').setLabel('Back to Server List').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('refresh-server').setLabel('Refresh Details').setStyle(ButtonStyle.Primary)
            );

            await i.update({
                content: '',
                embeds: [embed],
                components: [row]
            });
        };

        // --- Initial Render ---
        await renderServerSelect();

        // --- Collector ---
        const collector = interaction.channel?.createMessageComponentCollector({
            time: 300000 // 5 minutes
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
                if (i.isStringSelectMenu() && i.customId === 'server-select') {
                    selectedJobId = i.values[0];
                    await renderServerDetails(i, selectedJobId);
                } else if (i.isButton()) {
                    const id = i.customId;
                    if (id === 'refresh-list') {
                        servers = []; // Clear cache
                        await renderServerSelect(i);
                    } else if (id === 'prev-page') {
                        if (currentPage > 0) currentPage--;
                        await renderServerSelect(i);
                    } else if (id === 'next-page') {
                        const totalPages = Math.ceil(servers.length / ITEMS_PER_PAGE);
                        if (currentPage < totalPages - 1) currentPage++;
                        await renderServerSelect(i);
                    } else if (id === 'back-list') {
                        await renderServerSelect(i);
                    } else if (id === 'refresh-server') {
                         if (selectedJobId) {
                             // Re-fetch servers to get updated stats
                             servers = await robloxService.getActiveServers(placeId);
                             await renderServerDetails(i, selectedJobId);
                         } else {
                             await renderServerSelect(i);
                         }
                    }
                }
            } catch (err) {
                console.error("View Place interaction error:", err);
                if (!i.replied && !i.deferred) {
                    await i.reply({ content: `❌ Interaction failed.`, ephemeral: true }).catch(() => {});
                }
            }
        });

        collector.on('end', async () => {
             await interaction.editReply({ content: 'Session timed out.', components: [] }).catch(() => {});
        });
    },
};
