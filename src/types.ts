import type { Logging, PlatformAccessory, PlatformConfig } from "homebridge" with { "resolution-mode": "import" };
import type { FAN_SPEED } from "./constants";

export type FanSpeedName = keyof typeof FAN_SPEED;

export interface UnitConfiguration {
    manufacturer?: string;
    model?: string;
    fan: FanSpeedName[];
}

export interface AirtouchConfiguration extends PlatformConfig {
    ip_address: string;
    units: UnitConfiguration[];
    ac_include_temps?: boolean;
}

// Wire field names are retained to make controller logs and captured fixtures comparable.
export interface ACStatus {
    ac_unit_number: number;
    ac_power_state: number;
    ac_mode: number;
    ac_fan_speed: number;
    ac_target: number;
    ac_temp: number;
    ac_spill: number;
    ac_timer_set: number;
    ac_error_code: number;
}

export interface ZoneStatus {
    group_number: number;
    group_power_state: number;
    group_damper_position: number;
    group_has_turbo: number;
    group_has_spill: number;
}

export interface ACControl {
    ac_unit_number?: number;
    ac_power_state?: number;
    ac_mode?: number;
    ac_fan_speed?: number;
    ac_setpoint_control?: number;
    ac_target_value?: number;
}

export interface ZoneControl {
    group_number?: number;
    group_power_state?: number;
    group_target_type?: number;
    group_target?: number;
}

export interface HistoryEntry {
    time: number;
    currentTemp: number;
    setTemp: number;
    valvePosition: number;
}

// This dependency has no bundled types; only the API used by the plugin is described here.
export interface ThermoHistory {
    addEntry(entry: HistoryEntry): void;
    isHistoryLoaded(): boolean;
    usedMemory: number;
}

// Legacy cache keys are preserved so existing HomeKit accessories retain their state.
export interface AccessoryContext {
    serial: number;
    manufacturer: string;
    model: string;
    currentHeatingCoolingState?: number;
    targetHeatingCoolingState?: number;
    currentTemperature?: number;
    targetTemperature?: number;
    temperatureDisplayUnits?: number;
    fan_speeds?: FanSpeedName[];
    rotation_step?: number;
    rotationSpeed?: number;
    statusFault?: number;
    spillStatus?: boolean;
    timerStatus?: boolean;
    active?: boolean;
    damperPosition?: number;
}

export interface AirtouchAccessory extends PlatformAccessory<AccessoryContext> {
    log?: Logging;
    historyService?: ThermoHistory;
    historyUpdate?: number;
}

export type ControllerLog = (message: string) => void;
