module.exports = {
  apps : [{
    name: 'api',
    script: 'moode-nowplaying-api.mjs',
    cwd: '.',
    env: {
      LASTFM_API_KEY: '3110e883dad82e6d282ac315c6ba7a78'
    }
  }, {
    name: 'webserver',
    script: 'python3',
    args: '-m http.server 8101',
    cwd: '.'
  }]
};
