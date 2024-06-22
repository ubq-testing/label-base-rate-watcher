# `@ubiquibot/base-rate-watcher`

This plugin is used to automatically update price labels if there is a change to your ubiqiubot-config base rate settings.

## Usage
- This plugin runs on any `Push` event.
- The plugin will update all labels if `features.assistivePricing` is set to `true` in your ubiqiubot-config.
- The plugin will only update price labels already set if `features.assistivePricing` is set to `false` in your ubiqiubot-config.
- Only billing managers or admins can update the base rate settings.
- Any change to the `basePriceMultiplier` in either the global or plugin config scope will trigger this plugin.

### Plugin Config

```yml
push:
  - uses: 
      - plugin: ubiquibot/base-rate-watcher:compute.yml@main
        name: base-rate-auto-label
        id: base-rate-auto-label
        description: "Automatically updates price labels if there is a change to your ubiqiubot-config base rate settings." 
        with: 
          labels:
            time: []
            priority: []
          payments: 
            basePriceMultiplier: 1
          features:
            assistivePricing: true
```
