import { Bot } from './bot';
import { connectDatabase, disconnectDatabase } from './database';

const bot = new Bot();

(async () => {
    await connectDatabase();
    
    bot.start().catch((error) => {
        console.error('Unhandled error during bot startup:', error);
    });
})();

const shutdown = async () => {
    console.log('\nGracefully shutting down...');
    await disconnectDatabase();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);