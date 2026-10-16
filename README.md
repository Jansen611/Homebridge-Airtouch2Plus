# Homebridge-Airtouch2Plus

Originally based on the homebridge-airtouch2plus-platform plugin by leehadassin; making it compatible with Homebridge 2.4. Available in npm on package name `@jansen611/homebridge-airtouch2plus`. This is a Homebridge plugin for the Airtouch2+ AC Controller.

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

### Verifying the installation

On restart, check that:

- The plugin reports the installed release version, connects to the AirTouch controller and updates `AC 0` and all configured zones.
- The child bridge continues running after status messages arrive, without `updateReachability`, custom-characteristic or serial-number errors.
- In Apple Home, AC on/off, heating/cooling, target temperature, main fan speed, and zone fan on/off and opening percentages work.
- Changes from the wall panel or original AirTouch app are reflected in Apple Home. A zone in turbo mode should appear on.

## Configuration example

```json
"platforms": [
	{
		"platform": "Airtouch2",
		"name": "Airtouch2",
		"ip_address": "192.168.0.10",
		"ac_service_type": "Thermostat",
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
| `ac_service_type` _(optional)_ | `Thermostat` (default) or `HeaterCooler`, applied to all AC units on the controller; restart the child bridge after changing it |
| `ac_include_temps` | Retained legacy configuration option; zone temperature sensors are not implemented in this AirTouch 2+ fork |
| `units` | Array with information about your AC units, containing: |
| `manufacturer` _(optional)_ | Appears under "Manufacturer" for your AC accessory in the Home app |
| `model` _(optional)_ | Appears under "Model" for your AC accessory in the Home app |
| `fan` _(required)_ | List with fan speeds that can be set for your AC |

## Accessories

#### `AC` - created for each AC unit (e.g. `AC 0`, `AC 1`, ...)

Choose the central AC service in **Plugins → AirTouch 2+ → Plugin Config → Central AC type**, or set `ac_service_type` in the platform's JSON alongside `ip_address` and `units`. Save and restart the AirTouch child bridge. This changes the actual HomeKit service; the Homebridge accessory dashboard's **Custom Type** setting only changes that dashboard's appearance.

- **Thermostat** (default): combined OFF/HEAT/COOL/AUTO target mode and one target temperature, matching the previous behaviour.
- **HeaterCooler**: independent on/off and AUTO/HEAT/COOL target mode, plus standard fan-speed support. Changing mode alone preserves the AC's power state. DRY/FAN are represented by the AUTO target mode; separate Dry and Fan-only controls are not exposed.

AirTouch exposes only one temperature setpoint. In HeaterCooler mode, both heating and cooling threshold controls read and write that same setpoint; changing either updates both. This does not implement an independent heating/cooling range in AUTO mode. Reported heating/cooling state is derived from the controller's power and mode, not compressor activity; powered DRY/FAN or an unclassified AUTO state is represented as IDLE.

Switching type retains the AC accessory's UUID and history service, removes the old climate service and creates the selected one. Apple Home may refresh its controls; automations that refer to the previous service may need to be reselected. The plugin does not issue control commands merely because its configured type changes.

There are custom fields such as "Spill Active" and "Timer Set" received from the Airtouch2+ console that are also available only on 3rd party apps.

Both AC service types use FakeGato for temperature history, available in the Eve app.

#### `Zone` - created for each Airtouch group (e.g. `Zone 0`, `Zone 1`, ...)

Each zone uses one HomeKit `Fanv2` service:

* `Active` controls whether the zone is enabled.
* `RotationSpeed` represents the damper opening from 0 to 100% in 5% steps. It is not a separate fan motor speed, measured airflow, or the central AC's LOW/MEDIUM/HIGH setting.

Zone power and damper opening remain independent. Turning a zone off retains its opening setting. Changing its percentage requests only a damper adjustment; the plugin does not automatically switch the zone or central AC on. Incoming controller status remains authoritative, including any power changes applied by the controller itself. An enabled zone can still have no airflow while the central AC is off.

Existing zone accessory UUIDs and controller identifiers are retained. On restart, the plugin replaces its old Switch and Window services with Fanv2, so these zones no longer advertise windows to Apple Home. Automations targeting the old switch/window services may need to be recreated or reselected, and custom icons may refresh. Zone thermostats and temperature-control obstruction reporting are not implemented.

## Changelog

See [CHANGELOG](CHANGELOG.md) for release notes and compatibility fixes.

## License

This project is distributed under the [MIT License](LICENSE).
