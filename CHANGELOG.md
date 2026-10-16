# Changelog

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
