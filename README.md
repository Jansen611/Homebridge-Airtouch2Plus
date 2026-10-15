# @jansen611/homebridge-airtouch2plus

Originally based on the homebridge-airtouch2plus-platform plugin by leehadassin; making it compatible with Homebridge 2.4.

#### Homebridge plugin for the Airtouch2+ AC Controller

## Installation

Requires **Homebridge 2.4 or a later release**.

1. Install [Homebridge](https://github.com/homebridge/homebridge#installation).
2. Install in the Homebridge environment (for Docker, use the Homebridge UI terminal):

   ```bash
   npm install -g git+https://github.com/Jansen611/Homebridge-Airtouch2Plus.git#main
   ```

3. Update your `config.json` file (See below).
4. Restart the AirTouch child bridge, or Homebridge if you are not using a child bridge.

Git must be available for this command. npm installs the build dependencies and runs the `prepare` script when installing a Git dependency, compiling TypeScript into the JavaScript entry point at `dist/index.js`.

For a precompiled installation, build a package from a local checkout:

```bash
npm ci
npm pack
```

Copy the resulting `jansen611-homebridge-airtouch2plus-0.0.2.tgz` into the Homebridge environment and install it there:

```bash
npm install -g /path/to/jansen611-homebridge-airtouch2plus-0.0.2.tgz
```

This package contains the compiled `dist/` files; TypeScript and Homebridge are development dependencies and are not installed as runtime dependencies. GitHub's automatically generated source archives do not include `dist/` and are not precompiled installation packages.

This fork is named **`@jansen611/homebridge-airtouch2plus`**, using npm's lowercase scoped-package syntax. It is distinct from both the original `homebridge-airtouch2plus-platform` package and the unrelated `homebridge-airtouch2plus` package published by dabs79. Homebridge UI queries registry metadata by the full package name; the scope avoids displaying that unrelated package's author, verification badge and updates for this fork.

The scoped package has not been published to npm. Install it from this Git repository or the compiled tarball; GitHub ownership does not automatically reserve an npm scope. Publishing later requires an npm account or organisation with permission to use `@jansen611`. The GitHub repository URL stays the same.

### Upgrading an existing installation

After this rename has been pushed, install the new package and remove the old package before restarting Homebridge. Use npm in the Homebridge terminal so your existing platform configuration is retained.

For the installation that loads plugins from `/var/lib/homebridge/node_modules`, run the following commands one at a time, allowing installation to finish before removing the previous package:

```bash
npm install --prefix /var/lib/homebridge --omit=dev "git+https://github.com/Jansen611/Homebridge-Airtouch2Plus.git#main"
node -p "require('/var/lib/homebridge/node_modules/@jansen611/homebridge-airtouch2plus/package.json').name"
npm uninstall --prefix /var/lib/homebridge homebridge-airtouch2plus
```

The version-check command should print `@jansen611/homebridge-airtouch2plus`. If the original `homebridge-airtouch2plus-platform` package is still installed, remove that package from the same prefix as well. This removes only the packages; retain your Homebridge configuration and cached accessories. Use the actual plugin installation prefix on your system (for example `/homebridge` in some Docker installations). For a global installation, use `npm install -g` and `npm uninstall -g` instead, keeping both commands in the same installation location.

Keep the platform name as `Airtouch2`, along with your current `ip_address`, `units`, and `_bridge` settings, including the child bridge username and port. If your configuration explicitly qualifies the platform as `homebridge-airtouch2plus-platform.Airtouch2` or `homebridge-airtouch2plus.Airtouch2`, change it to `@jansen611/homebridge-airtouch2plus.Airtouch2`. Update any explicit plugin allow/disable lists that reference an old package name.

Restart **Homebridge itself** after changing packages so plugin discovery is refreshed. Homebridge 2.4 can reassociate cached accessories from an absent old plugin to the sole active dynamic platform named `Airtouch2`. Accessory names, accessory UUIDs and custom Spill/Timer UUIDs are retained; there is no manual cache reset or HomeKit re-pairing step in this migration. During the first restart, logs may report that the plugin name changed and the association is being transformed.

On restart, check that:

- The plugin reports version `0.0.2`, connects to the AirTouch controller and updates `AC 0` and all configured zones.
- The child bridge continues running after status messages arrive, without `updateReachability`, custom-characteristic or serial-number errors.
- In Apple Home, AC on/off, heating/cooling, target temperature, main fan speed, zone switches and damper percentages work.
- Changes from the wall panel or original AirTouch app are reflected in Apple Home. A zone in turbo mode should appear on.

### Compatibility fixes in 0.0.2

- Remove calls to the retired Homebridge `updateReachability` API.
- Define custom characteristics as ES classes and use the current HAP format/permission exports.
- Provide the legacy enum aliases to `fakegato-history` through an isolated adapter, preserving Eve history without modifying Homebridge's global Characteristic class.
- Restore cached accessories with valid, prefixed serial numbers while retaining their numeric controller IDs internally.
- Read the timer field as `ac_timer_set`, decode the spill flag correctly and expose both as booleans.
- Synchronise zone power through the Switch `On` characteristic, including turbo mode, and keep damper readback consistent.
- Apply controller notifications with `updateCharacteristic`, avoiding command callbacks during status synchronisation.
- Map current/target heating states and controller faults to valid HomeKit values.

### TypeScript migration

Runtime code now lives in `src/` and is compiled as CommonJS for Homebridge. The plugin identifier is `@jansen611/homebridge-airtouch2plus`; the platform identifier (`Airtouch2`), accessory UUIDs, custom-characteristic UUIDs and cache field names are retained. HomeKit callbacks use the typed `onGet` / `onSet` API.

Configuration, wire statuses, control commands and accessory context have explicit interfaces. Strict checks include unchecked array access, implicit overrides and unused declarations. Methods use PascalCase, except for Homebridge's required `configureAccessory` callback and JavaScript constructors.

TCP receive handling now buffers incomplete frames, handles multiple frames in one chunk and validates record lengths before reading. Polling/reconnection timers and the socket are released on shutdown. These paths are covered by offline tests.

## Configuration example

```json
"platforms": [
	{
		"platform": "Airtouch2",
		"name": "Airtouch2",
		"ip_address": "192.168.0.10",
		"ac_include_temps": false,
		"units": [
			{
				"manufacturer": "LG",
				"model": "B36AWY-7G6",
				"fan": ["AUTO", "QUIET", "LOW", "MEDIUM"]
			}
		]
	}
]
```

## Structure

| Key | Description |
| --- | --- |
| `platform` | Must be `Airtouch2` |
| `name` | Name for the platform |
| `ip_address` | AirTouch 2+ console IP address, found under "System Settings" -> "WiFi Settings", then the three-dots icon -> "Advanced" |
| `ac_include_temps` | Retained legacy configuration option; zone temperature sensors are not implemented in this AirTouch 2+ fork |
| `units` | Array with information about your AC units, containing: |
| `manufacturer` _(optional)_ | Appears under "Manufacturer" for your AC accessory in the Home app |
| `model` _(optional)_ | Appears under "Model" for your AC accessory in the Home app |
| `fan` _(required)_ | List with fan speeds that can be set for your AC |

## Accessories

#### `AC` - created for each AC unit (e.g. `AC 0`, `AC 1`, ...)

It uses the Homekit `Thermostat` service, and can set AC OFF/HEAT/COOL/AUTO and fan speed. DRY/FAN modes appear as AUTO.

There are custom fields such as "Spill Active" and "Timer Set" received from the Airtouch2+ console that are also available only on 3rd party apps.

Thermostat uses FakeGato service for temperature history, available only in the Eve app.

#### `Zone` - created for each Airtouch group (e.g. `Zone 0`, `Zone 1`, ...)

It uses 2 Homekit services:

* `Switch` - to turn the zone ON/OFF.
* `Window` - models the damper opening percentage in 5% increments. This fork exposes percentage control; it does not implement zone thermostats or temperature-control obstruction reporting.
