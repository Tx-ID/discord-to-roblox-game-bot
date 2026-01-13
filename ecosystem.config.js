module.exports = {
  apps : [{
    name   : "perseus",
    script : "./dist/index.js",
    max_memory_restart: '150M',
    watch: false,
    env: {
      NODE_ENV: "production"
    }
  }]
}
