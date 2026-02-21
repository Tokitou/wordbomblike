// ecosystem.config.js - Configuration PM2 pour la production
module.exports = {
  apps: [{
    name: 'wordbomb',
    script: 'server.js',
    instances: 1, // 1 seule instance OBLIGATOIRE pour Socket.IO (sinon il faut sticky sessions)
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
