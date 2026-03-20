# baseball-streamdeck
Baseball Stream Deck app

## File Structure
```
.
├── *.sdPlugin/
│   ├── bin/
│   ├── imgs/
│   ├── logs/
│   ├── ui/
│   │   └── increment-counter.html
│   └── manifest.json
├── src/
│   ├── actions/
│   │   └── increment-counter.ts
│   └── plugin.ts
├── package.json
├── rollup.config.mjs
└── tsconfig.json
```

### .sdPugin

The ./*.sdPlugin directory is your compiled plugin, and contains:

- `bin`, compiled output files from your ./src directory.
- `imgs`, supporting images distributed with your plugin.
- `logs`, logs generated with a logger.
- `ui`, property inspectors, allowing users to configure actions in Stream Deck.
- `manifest.json`, that defines the metadata of your plugin, learn more about the manifest.

### Running Plugin

Added to `package.json`:
```json
{
	"scripts": {
		"build": "rollup -c",
		"watch": "rollup -c -w --watch.onEnd=\"streamdeck restart {{YOUR_PLUGIN_UUID}}",
	},
	// ...
}
```

