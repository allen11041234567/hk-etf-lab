# Futu Symbol Template

To add another symbol under `community-monitor/futu/`:

1. Copy the `07709/` folder to a new symbol folder
2. Update symbol-specific references in scripts if needed
3. Add the symbol to `community-monitor/futu/config.json`
4. Ensure `credentials.json` exists for that symbol

## Example config entry

```json
{
  "symbol": "01211",
  "name": "比亞迪股份"
}
```

## Run one slot for all configured symbols

```bash
cd community-monitor/futu/scripts
./run_all_symbols.sh 1200
```
