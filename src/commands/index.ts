import { Collection } from 'discord.js';
import { Command } from './command.interface';
import { pingCommand } from './ping';
import { serversCommand } from './servers';
import { blacklistCommand } from './blacklist';
import { controlCommand } from './control';
import { howtoCommand } from './howto';

export const commands = new Collection<string, Command>();

commands.set(pingCommand.data.name, pingCommand);
commands.set(serversCommand.data.name, serversCommand);
commands.set(blacklistCommand.data.name, blacklistCommand);
commands.set(controlCommand.data.name, controlCommand);
commands.set(howtoCommand.data.name, howtoCommand);

export { pingCommand, serversCommand, blacklistCommand, controlCommand, howtoCommand };
