# @jansen611/homebridge-airtouch2plus

Originally based on the homebridge-airtouch2plus-platform plugin by leehadassin; making it compatible with Homebridge 2.4.

#### Homebridge plugin for the Airtouch2+ AC Controller

## Installation

Requires **Homebridge 2.4 or a later release**.

1. Install [Homebridge](https://github.com/homebridge/homebridge#installation).
2. In Homebridge UI, search for the exact package **`@jansen611/homebridge-airtouch2plus`** and install it. The published package is available on [npm](https://www.npmjs.com/package/@jansen611/homebridge-airtouch2plus).

   Alternatively, open the Homebridge terminal in your Homebridge installation directory (for example `/var/lib/homebridge`) and run:

   ```bash
   npm install @jansen611/homebridge-airtouch2plus
   ```

3. Update your `config.json` file (See below).
4. Restart the AirTouch child bridge, or Homebridge if you are not using a child bridge.

Run the local installation commands below from that same Homebridge directory. For a global plugin installation, use:

```bash
npm install -g @jansen611/homebridge-airtouch2plus
```

### Building an installation tarball

For a precompiled installation, build a package from a local checkout:

```bash
npm ci
npm pack
```

Copy the resulting `jansen611-homebridge-airtouch2plus-0.0.3.tgz` into the Homebridge environment and install it there:

```bash
npm install -g /path/to/jansen611-homebridge-airtouch2plus-0.0.3.tgz
```

This package contains the compiled `dist/` files; TypeScript and Homebridge are development dependencies and are not installed as runtime dependencies. GitHub's automatically generated source archives do not include `dist/` and are not precompiled installation packages.

This fork is named **`@jansen611/homebridge-airtouch2plus`**, using npm's lowercase scoped-package syntax. It is distinct from both the original `homebridge-airtouch2plus-platform` package and the unrelated `homebridge-airtouch2plus` package published by dabs79. Homebridge UI queries registry metadata by the full package name; the scope avoids displaying that unrelated package's author, verification badge and updates for this fork.

Public npm releases are published under the `@jansen611` scope. Homebridge UI can retrieve the maintainer and available release versions using this full package name.

### Verifying the installation

On restart, check that:

- The plugin reports the installed release version, connects to the AirTouch controller and updates `AC 0` and all configured zones.
- The child bridge continues running after status messages arrive, without `updateReachability`, custom-characteristic or serial-number errors.
- In Apple Home, AC on/off, heating/cooling, target temperature, main fan speed, zone switches and damper percentages work.
- Changes from the wall panel or original AirTouch app are reflected in Apple Home. A zone in turbo mode should appear on.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes and compatibility fixes.

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
