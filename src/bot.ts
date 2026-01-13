import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config } from './config';
import { commands } from './commands';
import { dbManager } from './database';

export class Bot {
    public readonly client: Client;
    private deletedMessages = new Map<string, string>(); // Map<MessageID, UserID>

    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages
            ]
        });

        this.registerEvents();
    }

    private registerEvents(): void {
        this.client.once(Events.ClientReady, (readyClient) => {
            console.log(`Logged in as ${readyClient.user.tag}!`);
        });

        // Handle Slash Commands
        this.client.on(Events.InteractionCreate, async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const command = commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                const errorMessage = 'There was an error while executing this command!';
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: errorMessage, ephemeral: true });
                } else {
                    await interaction.reply({ content: errorMessage, ephemeral: true });
                }
            }
        });

        // Handle Legacy Prefix Commands (!command) and Blacklist Enforcement
        this.client.on(Events.MessageCreate, async (message) => {
            // Check if this message is a bot reply to a blacklisted user
            if (message.author.bot && message.reference && message.reference.messageId) {
                // Check local cache first (if original was already deleted)
                if (this.deletedMessages.has(message.reference.messageId)) {
                    await message.delete().catch(() => {});
                    return;
                }

                try {
                    const referencedMessage = await message.fetchReference();
                    const isBlacklisted = await dbManager.isBlacklisted(referencedMessage.author.id);
                    if (isBlacklisted) {
                        const hasAttachment = referencedMessage.attachments.size > 0;
                        const hasLink = /https?:\/\/[^\s]+/.test(referencedMessage.content);
                        if (hasAttachment || hasLink) {
                            await message.delete();
                            return;
                        }
                    }
                } catch (err) {
                    // Reference might not exist or couldn't be fetched
                }
            }

            if (message.author.bot) return;

            // Blacklist Check for human users
            try {
                const isBlacklisted = await dbManager.isBlacklisted(message.author.id);
                if (isBlacklisted) {
                    const hasAttachment = message.attachments.size > 0;
                    const hasLink = /https?:\/\/[^\s]+/.test(message.content);

                    if (hasAttachment || hasLink) {
                        try {
                            // Cache the deleted message ID for a short time
                            this.deletedMessages.set(message.id, message.author.id);
                            setTimeout(() => this.deletedMessages.delete(message.id), 60000); // 60s cache

                            await message.delete();
                        } catch (err) {
                            console.error('Failed to delete blacklisted message:', err);
                        }
                        return; // Stop processing
                    }
                }
            } catch (error) {
                console.error('Error checking blacklist:', error);
            }

            if (!message.content.startsWith('!')) return;

            const args = message.content.slice(1).trim().split(/ +/);
            const commandName = args.shift()?.toLowerCase();

            if (!commandName) return;

            const command = commands.get(commandName);

            if (command && command.executePrefix) {
                try {
                    await command.executePrefix(message, args);
                } catch (error) {
                    console.error(error);
                    message.reply('There was an error while executing this command!');
                }
            }
        });
    }

    public async start(): Promise<void> {
        try {
            await this.client.login(config.discordToken);
        } catch (error) {
            console.error('Failed to login:', error);
            process.exit(1);
        }
    }
}
