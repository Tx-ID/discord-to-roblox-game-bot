module.exports = {
  apps : [{
    name   : "discord-roblox-bot",
    script : "./dist/index.js",
    max_memory_restart: '150M',
    watch: false,
    env: {
      NODE_ENV: "production"
    }
  }]
}
