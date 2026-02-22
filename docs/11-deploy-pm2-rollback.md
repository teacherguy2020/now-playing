# Deploy / PM2 / Rollback

## Typical services
- `api`
- `webserver`

## Common commands
```bash
pm2 restart api webserver
pm2 save
pm2 logs api --lines 100
pm2 logs webserver --lines 100
```

## Rollback pattern
- checkout previous commit
- restart pm2 services
- verify `/config/runtime` and UI load
