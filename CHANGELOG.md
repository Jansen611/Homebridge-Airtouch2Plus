# Changelog

## 0.0.5 (unreleased)

### Changed

- Replaced each zone's Switch and Window services with a single Fanv2 service, so damper openings are no longer presented as windows in Apple Home.
- Mapped zone power to Active and damper opening to RotationSpeed, retaining independent power/opening state and the existing zone accessory UUIDs.

## 0.0.4 (GitHub test build)

### Added

- Added `ac_service_type` to select `Thermostat` (default) or `HeaterCooler` as the central AC's HomeKit service.
- Added a Homebridge plugin settings form with a central AC type selector.
- Added independent power and mode controls for HeaterCooler, with both temperature thresholds reflecting AirTouch's single physical setpoint.
- Added cached-service replacement when changing AC type, retaining the accessory UUID and Eve history service.

## 0.0.2

First public npm release of `@jansen611/homebridge-airtouch2plus`.

### Fixed

- Removed calls to the retired Homebridge `updateReachability` API.
- Defined custom characteristics as ES classes and used the current HAP format/permission exports.
- Provided the legacy enum aliases to `fakegato-history` through an isolated adapter, preserving Eve history without modifying Homebridge's global Characteristic class.
- Restored cached accessories with valid, prefixed serial numbers while retaining their numeric controller IDs internally.
- Read the timer field as `ac_timer_set`, decoded the spill flag correctly and exposed both as booleans.
- Synchronised zone power through the Switch `On` characteristic, including turbo mode, and kept damper readback consistent.
- Applied controller notifications with `updateCharacteristic`, avoiding command callbacks during status synchronisation.
- Mapped current/target heating states and controller faults to valid HomeKit values.
