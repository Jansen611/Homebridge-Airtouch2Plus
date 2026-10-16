import type { API, DynamicPlatformPlugin, HAP, Logging, PlatformAccessory, PlatformConfig, Service } from "homebridge" with { "resolution-mode": "import" };
import { AirtouchAPI } from "./airtouch-api";
import { CreateCustomCharacteristics } from "./characteristics";
import { ParseConfiguration } from "./config";
import { AC_MODE, FAN_SPEED, PLATFORM_NAME, PLUGIN_NAME, ZONE_POWER_STATUS } from "./constants";
import { CreateHistoryFactory } from "./history";
import type { ACStatus, AirtouchAccessory, AirtouchConfiguration, AccessoryContext, ZoneStatus } from "./types";

// Restores and synchronises the selected AC service and zone accessories for one controller.
export class AirtouchPlatform implements DynamicPlatformPlugin {
    readonly units: Record<string, AirtouchAccessory> = {};
    readonly zones: Record<string, AirtouchAccessory> = {};
    readonly api: AirtouchAPI;
    readonly config: AirtouchConfiguration;
    private readonly hap: HAP;
    private readonly custom: ReturnType<typeof CreateCustomCharacteristics>;
    private readonly HistoryService: ReturnType<typeof CreateHistoryFactory>;

    // Initialises the typed controller API and connects using the existing configuration.
    constructor(
        private readonly log: Logging,
        configuration: PlatformConfig,
        private readonly homebridge: API
    ) {
        this.config = ParseConfiguration(configuration);
        this.hap = homebridge.hap;
        this.custom = CreateCustomCharacteristics(homebridge);
        this.HistoryService = CreateHistoryFactory(homebridge);
        this.api = new AirtouchAPI(message => this.log(message));
        this.api.on("ac_status", statuses => this.OnACStatusNotification(statuses));
        this.api.on("groups_status", statuses => this.OnGroupsStatusNotification(statuses));
        homebridge.on("shutdown", () => this.api.Disconnect());
        this.api.Connect(this.config.ip_address);
    }

    // Implements Homebridge's case-sensitive callback for restoring cached accessories.
    configureAccessory(cachedAccessory: PlatformAccessory): void {
        const serial = Number(cachedAccessory.context.serial);
        if (!Number.isInteger(serial) || serial < 0) {
            throw new Error(`Invalid controller identifier in cached accessory [${cachedAccessory.displayName}]`);
        }
        const accessory = cachedAccessory as AirtouchAccessory;
        accessory.context.serial = serial;
        this.log(`Trying to configure [${accessory.displayName}] from cache...`);
        if (this.units[accessory.displayName] || this.zones[accessory.displayName]) return;

        // These names were never created by the released plugin's active code.
        if (accessory.displayName.endsWith(" Thermostat")) {
            this.log(`Skipping unsupported legacy accessory [${accessory.displayName}]`);
            return;
        }
        if (accessory.displayName.startsWith("AC")) {
            this.SetupACAccessory(accessory);
            this.units[accessory.displayName] = accessory;
        } else if (accessory.displayName.startsWith("Zone")) {
            this.SetupZoneAccessory(accessory);
            this.zones[accessory.displayName] = accessory;
        }
        this.log(`[${accessory.displayName}] was restored from cache`);
    }

    // Creates a new accessory with the same name-derived UUID and cache fields as before.
    private CreateAccessory(name: string, serial: number, manufacturer: string, model: string): AirtouchAccessory {
        const accessory = new this.homebridge.platformAccessory<AccessoryContext>(name, this.hap.uuid.generate(name));
        accessory.context = { serial, manufacturer, model };
        return accessory;
    }

    // Creates missing AC accessories and applies each controller status notification.
    OnACStatusNotification(statuses: ACStatus[]): void {
        for (const status of statuses) {
            const unitName = `AC ${status.ac_unit_number}`;
            this.log(`Received status update for [${unitName}]: ${JSON.stringify(status)}`);
            let accessory = this.units[unitName];
            if (!accessory) {
                const unit = this.config.units[status.ac_unit_number];
                if (!unit) {
                    this.log(`Ignoring unconfigured AC unit ${status.ac_unit_number}`);
                    continue;
                }
                accessory = this.CreateAccessory(unitName, status.ac_unit_number, unit.manufacturer ?? "N/A", unit.model ?? "N/A");
                this.SetupACAccessory(accessory);
                this.units[unitName] = accessory;
                this.homebridge.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
            this.UpdateACAccessory(accessory, status);
        }
    }

    // Creates missing zone accessories and applies their controller state.
    OnGroupsStatusNotification(statuses: ZoneStatus[]): void {
        for (const status of statuses) {
            const zoneName = `Zone ${status.group_number}`;
            this.log(`Received status update for [${zoneName}]: ${JSON.stringify(status)}`);
            let accessory = this.zones[zoneName];
            if (!accessory) {
                accessory = this.CreateAccessory(zoneName, status.group_number, "Polyaire", "Quick Fix Damper");
                this.SetupZoneAccessory(accessory);
                this.zones[zoneName] = accessory;
                this.homebridge.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
            this.UpdateZoneAccessory(accessory, status);
        }
    }

    // Updates accessory metadata without altering the numeric controller identifier.
    private SetupInformation(accessory: AirtouchAccessory, prefix: string): void {
        const { Characteristic, Service } = this.hap;
        accessory.on("identify", () => this.log(`${accessory.displayName} identified`));
        accessory.getService(Service.AccessoryInformation)!
            .setCharacteristic(Characteristic.Manufacturer, accessory.context.manufacturer)
            .setCharacteristic(Characteristic.Model, accessory.context.model)
            .setCharacteristic(Characteristic.SerialNumber, `${prefix}-${accessory.context.serial}`);
    }

    // Configures the selected AC service, preserving the accessory UUID and history.
    private SetupACAccessory(accessory: AirtouchAccessory): void {
        const { Characteristic, Service } = this.hap;
        const context = accessory.context;
        const unit = this.config.units[context.serial];
        if (!unit) throw new Error(`Missing configuration for cached AC unit ${context.serial}`);
        this.SetupInformation(accessory, "AC");
        const useHeaterCooler = this.config.ac_service_type === "HeaterCooler";
        const obsoleteService = accessory.getService(useHeaterCooler ? Service.Thermostat : Service.HeaterCooler);
        if (obsoleteService) {
            obsoleteService.setPrimaryService(false);
            accessory.removeService(obsoleteService);
        }
        const serviceType = useHeaterCooler ? Service.HeaterCooler : Service.Thermostat;
        const climateService = accessory.getService(serviceType)
            ?? accessory.addService(serviceType, accessory.displayName);

        context.currentHeatingCoolingState ??= Characteristic.CurrentHeatingCoolingState.OFF;
        context.targetHeatingCoolingState ??= Characteristic.TargetHeatingCoolingState.OFF;
        context.currentTemperature ??= 20;
        context.targetTemperature ??= 24;
        context.temperatureDisplayUnits ??= Characteristic.TemperatureDisplayUnits.CELSIUS;
        context.rotationSpeed ??= 0;
        context.statusFault ??= Characteristic.StatusFault.NO_FAULT;
        context.spillStatus ??= false;
        context.timerStatus ??= false;
        context.fan_speeds = unit.fan;
        context.rotation_step = Math.floor(100 / (unit.fan.length - 1));

        if (useHeaterCooler) this.SetupHeaterCoolerControls(accessory, climateService);
        else this.SetupThermostatControls(accessory, climateService);
        climateService.getCharacteristic(Characteristic.CurrentTemperature)
            .onGet(() => context.currentTemperature!);
        climateService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .onGet(() => context.temperatureDisplayUnits!)
            .onSet(value => { context.temperatureDisplayUnits = Number(value); });
        climateService.getCharacteristic(Characteristic.Name).onGet(() => accessory.displayName);

        const fan = climateService.testCharacteristic(Characteristic.RotationSpeed)
            ? climateService.getCharacteristic(Characteristic.RotationSpeed)
            : climateService.addCharacteristic(Characteristic.RotationSpeed);
        fan.setProps({ minStep: context.rotation_step, minValue: 0, maxValue: context.rotation_step * (unit.fan.length - 1) })
            .onGet(() => context.rotationSpeed!)
            .onSet(value => this.SetACRotationSpeed(accessory, Number(value)));
        const fault = climateService.testCharacteristic(Characteristic.StatusFault)
            ? climateService.getCharacteristic(Characteristic.StatusFault)
            : climateService.addCharacteristic(Characteristic.StatusFault);
        fault.onGet(() => context.statusFault!);
        const spill = climateService.testCharacteristic(this.custom.SpillStatus)
            ? climateService.getCharacteristic(this.custom.SpillStatus)
            : climateService.addCharacteristic(this.custom.SpillStatus);
        spill.onGet(() => context.spillStatus!);
        const timer = climateService.testCharacteristic(this.custom.TimerStatus)
            ? climateService.getCharacteristic(this.custom.TimerStatus)
            : climateService.addCharacteristic(this.custom.TimerStatus);
        timer.onGet(() => context.timerStatus!);
        climateService.setPrimaryService(true);

        accessory.log = this.log;
        accessory.historyService = new this.HistoryService("thermo", accessory, { storage: "fs" });
        accessory.historyUpdate = 0;
        this.log(`Finished creating accessory [${accessory.displayName}]`);
    }

    // Exposes the original thermostat's combined power/mode and single target temperature.
    private SetupThermostatControls(accessory: AirtouchAccessory, service: Service): void {
        const { Characteristic } = this.hap;
        const context = accessory.context;
        service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .onGet(() => context.currentHeatingCoolingState!);
        service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .onGet(() => context.targetHeatingCoolingState!)
            .onSet(value => this.SetACHeatingCoolingState(accessory, Number(value)));
        service.getCharacteristic(Characteristic.TargetTemperature)
            .updateValue(context.targetTemperature!)
            .setProps({ minStep: 1, minValue: 14, maxValue: 29 })
            .onGet(() => context.targetTemperature!)
            .onSet(value => this.SetACTargetTemperature(accessory, Number(value)));
    }

    // Exposes independent power/mode controls and mirrors the controller's single setpoint.
    private SetupHeaterCoolerControls(accessory: AirtouchAccessory, service: Service): void {
        const { Characteristic } = this.hap;
        const context = accessory.context;
        context.acActive ??= context.targetHeatingCoolingState !== Characteristic.TargetHeatingCoolingState.OFF;
        context.acMode ??= context.targetHeatingCoolingState === Characteristic.TargetHeatingCoolingState.HEAT ? AC_MODE.HEAT
            : context.targetHeatingCoolingState === Characteristic.TargetHeatingCoolingState.COOL ? AC_MODE.COOL : AC_MODE.AUTO;
        this.UpdateHeaterCoolerContext(context);
        service.getCharacteristic(Characteristic.Active)
            .onGet(() => context.acActive ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE)
            .onSet(value => this.SetACActive(accessory, Number(value) === Characteristic.Active.ACTIVE));
        service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .onGet(() => context.currentHeaterCoolerState!);
        service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .onGet(() => context.targetHeaterCoolerState!)
            .onSet(value => this.SetACTargetHeaterCoolerState(accessory, Number(value)));
        // AirTouch provides one target temperature, not an independent auto-mode range.
        for (const threshold of [Characteristic.HeatingThresholdTemperature, Characteristic.CoolingThresholdTemperature]) {
            service.getCharacteristic(threshold)
                .setProps({ minValue: 0, maxValue: 29 })
                .updateValue(context.targetTemperature!)
                .setProps({ minStep: 1, minValue: 14, maxValue: 29 })
                .onGet(() => context.targetTemperature!)
                .onSet(value => this.SetACTargetTemperature(accessory, Number(value)));
        }
    }

    // Maps the reported power and mode to HeaterCooler states, without inferring compressor telemetry.
    private UpdateHeaterCoolerContext(context: AccessoryContext): void {
        const { Characteristic } = this.hap;
        context.targetHeaterCoolerState = context.acMode === AC_MODE.HEAT ? Characteristic.TargetHeaterCoolerState.HEAT
            : context.acMode === AC_MODE.COOL ? Characteristic.TargetHeaterCoolerState.COOL
                : Characteristic.TargetHeaterCoolerState.AUTO;
        context.currentHeaterCoolerState = !context.acActive ? Characteristic.CurrentHeaterCoolerState.INACTIVE
            : context.acMode === AC_MODE.HEAT || context.acMode === 8 ? Characteristic.CurrentHeaterCoolerState.HEATING
                : context.acMode === AC_MODE.COOL || context.acMode === 9 ? Characteristic.CurrentHeaterCoolerState.COOLING
                    : Characteristic.CurrentHeaterCoolerState.IDLE;
    }

    // Maps AC status to legal HomeKit values without invoking command setters.
    private UpdateACAccessory(accessory: AirtouchAccessory, status: ACStatus): void {
        const { Characteristic, Service } = this.hap;
        const useHeaterCooler = this.config.ac_service_type === "HeaterCooler";
        const climateService = accessory.getService(useHeaterCooler ? Service.HeaterCooler : Service.Thermostat)!;
        const context = accessory.context;
        context.acActive = status.ac_power_state !== 0;
        context.acMode = status.ac_mode;
        this.UpdateHeaterCoolerContext(context);
        context.currentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;
        context.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.OFF;
        if (status.ac_power_state !== 0) {
            if (status.ac_mode === 1 || status.ac_mode === 8)
                context.currentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.HEAT;
            else if (status.ac_mode === 4 || status.ac_mode === 9)
                context.currentHeatingCoolingState = Characteristic.CurrentHeatingCoolingState.COOL;
            context.targetHeatingCoolingState = status.ac_mode === 1 ? Characteristic.TargetHeatingCoolingState.HEAT
                : status.ac_mode === 4 ? Characteristic.TargetHeatingCoolingState.COOL
                    : Characteristic.TargetHeatingCoolingState.AUTO;
        }
        context.currentTemperature = status.ac_temp;
        context.targetTemperature = status.ac_target;
        const speeds = context.fan_speeds!;
        const speedIndex = speeds.findIndex(speed => FAN_SPEED[speed] === status.ac_fan_speed);
        context.rotationSpeed = Math.max(0, speedIndex) * context.rotation_step!;
        context.statusFault = status.ac_error_code === 0 ? Characteristic.StatusFault.NO_FAULT : Characteristic.StatusFault.GENERAL_FAULT;
        context.spillStatus = Boolean(status.ac_spill);
        context.timerStatus = Boolean(status.ac_timer_set);

        if (useHeaterCooler) {
            climateService.updateCharacteristic(Characteristic.Active, context.acActive ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
            climateService.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, context.currentHeaterCoolerState!);
            climateService.updateCharacteristic(Characteristic.TargetHeaterCoolerState, context.targetHeaterCoolerState!);
            climateService.updateCharacteristic(Characteristic.HeatingThresholdTemperature, context.targetTemperature);
            climateService.updateCharacteristic(Characteristic.CoolingThresholdTemperature, context.targetTemperature);
        } else {
            climateService.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, context.currentHeatingCoolingState);
            climateService.updateCharacteristic(Characteristic.TargetHeatingCoolingState, context.targetHeatingCoolingState);
            climateService.updateCharacteristic(Characteristic.TargetTemperature, context.targetTemperature);
        }
        climateService.updateCharacteristic(Characteristic.CurrentTemperature, context.currentTemperature);
        climateService.updateCharacteristic(Characteristic.RotationSpeed, context.rotationSpeed);
        climateService.updateCharacteristic(Characteristic.StatusFault, context.statusFault);
        climateService.updateCharacteristic(this.custom.SpillStatus, context.spillStatus);
        climateService.updateCharacteristic(this.custom.TimerStatus, context.timerStatus);

        const now = Date.now() / 1000;
        if (now - (accessory.historyUpdate ?? 0) > 285) {
            accessory.historyService!.addEntry({
                time: now, currentTemp: context.currentTemperature,
                setTemp: context.targetTemperature, valvePosition: context.rotationSpeed
            });
            accessory.historyUpdate = now;
        }
        this.log(`Finished updating accessory [${accessory.displayName}]`);
    }

    // Replaces legacy switch/window controls with one fan service per zone.
    private SetupZoneAccessory(accessory: AirtouchAccessory): void {
        const { Characteristic, Service } = this.hap;
        const context = accessory.context;
        this.SetupInformation(accessory, "Zone");
        context.active = Boolean(context.active);
        context.damperPosition ??= 0;
        const obsoleteServices = accessory.services.filter(service =>
            service.UUID === Service.Switch.UUID || service.UUID === Service.Window.UUID);
        for (const obsoleteService of obsoleteServices) {
            for (const service of accessory.services) service.removeLinkedService(obsoleteService);
            obsoleteService.setPrimaryService(false);
            accessory.removeService(obsoleteService);
        }
        const zone = accessory.getService(Service.Fanv2) ?? accessory.addService(Service.Fanv2, accessory.displayName);
        zone.getCharacteristic(Characteristic.Active)
            .updateValue(context.active ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE)
            .onGet(() => context.active ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE)
            .onSet(value => this.SetZoneActive(accessory, Number(value) === Characteristic.Active.ACTIVE));
        zone.getCharacteristic(Characteristic.RotationSpeed)
            .setProps({ minStep: 5, minValue: 0, maxValue: 100 })
            .updateValue(context.damperPosition)
            .onGet(() => context.damperPosition!)
            .onSet(value => this.SetZoneDamperPosition(accessory, Number(value)));
        zone.getCharacteristic(Characteristic.Name).onGet(() => accessory.displayName);
        zone.setPrimaryService(true);
        this.log(`Finished creating accessory [${accessory.displayName}]`);
    }

    // Synchronises fan activity and damper opening without writing back to the controller.
    private UpdateZoneAccessory(accessory: AirtouchAccessory, status: ZoneStatus): void {
        const { Characteristic, Service } = this.hap;
        const context = accessory.context;
        context.active = status.group_power_state === ZONE_POWER_STATUS.ON || status.group_power_state === ZONE_POWER_STATUS.TURBO;
        context.damperPosition = status.group_damper_position;
        const zone = accessory.getService(Service.Fanv2)!;
        zone.updateCharacteristic(Characteristic.Active, context.active ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
        zone.updateCharacteristic(Characteristic.RotationSpeed, context.damperPosition);
        this.log(`Finished updating accessory [${accessory.displayName}]`);
    }

    // Applies a HomeKit target mode to the AC controller.
    private SetACHeatingCoolingState(accessory: AirtouchAccessory, state: number): void {
        if (accessory.context.targetHeatingCoolingState === state) return;
        if (accessory.context.currentHeatingCoolingState !== state) {
            this.api.SetACHeatingCoolingState(accessory.context.serial, state);
        }
        accessory.context.targetHeatingCoolingState = state;
    }

    // Applies a HomeKit target temperature to the AC controller.
    private SetACTargetTemperature(accessory: AirtouchAccessory, temperature: number): void {
        if (accessory.context.targetTemperature === temperature) return;
        this.api.SetACTargetTemperature(accessory.context.serial, temperature);
        accessory.context.targetTemperature = temperature;
        const heaterCooler = accessory.getService(this.hap.Service.HeaterCooler);
        if (heaterCooler) {
            heaterCooler.updateCharacteristic(this.hap.Characteristic.HeatingThresholdTemperature, temperature);
            heaterCooler.updateCharacteristic(this.hap.Characteristic.CoolingThresholdTemperature, temperature);
        }
    }

    // Applies HeaterCooler's power control without changing the selected mode.
    private SetACActive(accessory: AirtouchAccessory, active: boolean): void {
        if (accessory.context.acActive === active) return;
        this.api.SetACPower(accessory.context.serial, active);
        accessory.context.acActive = active;
    }

    // Applies HeaterCooler's target mode without implicitly changing power.
    private SetACTargetHeaterCoolerState(accessory: AirtouchAccessory, state: number): void {
        if (accessory.context.targetHeaterCoolerState === state) return;
        const { TargetHeaterCoolerState } = this.hap.Characteristic;
        const mode = state === TargetHeaterCoolerState.HEAT ? AC_MODE.HEAT
            : state === TargetHeaterCoolerState.COOL ? AC_MODE.COOL : AC_MODE.AUTO;
        this.api.SetACMode(accessory.context.serial, mode);
        accessory.context.acMode = mode;
        accessory.context.targetHeaterCoolerState = state;
    }

    // Converts HomeKit's fan percentage to a configured discrete controller speed.
    private SetACRotationSpeed(accessory: AirtouchAccessory, percentage: number): void {
        const context = accessory.context;
        if (context.rotationSpeed === percentage) return;
        const speed = context.fan_speeds![Math.round(percentage / context.rotation_step!)];
        if (!speed) throw new Error(`Unsupported AirTouch fan percentage: ${percentage}`);
        this.api.SetACFanSpeed(context.serial, FAN_SPEED[speed]);
        context.rotationSpeed = percentage;
    }

    // Applies a zone fan's power command while retaining its damper setting.
    private SetZoneActive(accessory: AirtouchAccessory, active: boolean): void {
        if (accessory.context.active === active) return;
        this.api.SetZoneActive(accessory.context.serial, active);
        accessory.context.active = active;
    }

    // Applies a zone fan's percentage to its damper without changing zone or AC power.
    private SetZoneDamperPosition(accessory: AirtouchAccessory, position: number): void {
        if (accessory.context.damperPosition === position) return;
        this.api.SetZoneDamperPosition(accessory.context.serial, position);
        accessory.context.damperPosition = position;
    }
}
