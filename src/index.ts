import { Bot } from './bot';
import { connectDatabase, disconnectDatabase } from './database';

const bot = new Bot();

(async () => {
    await connectDatabase();
    
    bot.start().catch((error) => {
        console.error('Unhandled error during bot startup:', error);
    });
})();

// Global Error Handlers to prevent crash
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Keep process alive if possible, or restart via PM2
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Keep process alive
});

const shutdown = async () => {
    console.log('\nGracefully shutting down...');
    await disconnectDatabase();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);