import type { PlatformConfig } from "homebridge" with { "resolution-mode": "import" };
import { FAN_SPEED } from "./constants";
import type { AirtouchConfiguration, FanSpeedName, UnitConfiguration } from "./types";

// Narrows a configuration value to a supported, selectable fan-speed name.
function IsFanSpeed(value: unknown): value is FanSpeedName {
    return typeof value === "string" && Object.hasOwn(FAN_SPEED, value);
}

// Validates external configuration before it is used for indexing or fan calculations.
export function ParseConfiguration(configuration: PlatformConfig): AirtouchConfiguration {
    const address: unknown = configuration.ip_address;
    const rawUnits: unknown = configuration.units;
    const serviceType: unknown = configuration.ac_service_type ?? "Thermostat";
    if (serviceType !== "Thermostat" && serviceType !== "HeaterCooler") {
        throw new Error("ac_service_type must be Thermostat or HeaterCooler");
    }
    if (typeof address !== "string" || address.trim().length === 0) {
        throw new Error("AirTouch requires a non-empty ip_address");
    }
    if (!Array.isArray(rawUnits) || rawUnits.length === 0) {
        throw new Error("AirTouch requires at least one configured AC unit");
    }
    const units = rawUnits.map((rawUnit: unknown, index): UnitConfiguration => {
        if (typeof rawUnit !== "object" || rawUnit === null) {
            throw new Error(`Invalid AirTouch unit configuration at index ${index}`);
        }
        const unit = rawUnit as Record<string, unknown>;
        const rawFan = unit.fan;
        if (!Array.isArray(rawFan)) {
            throw new Error(`AirTouch unit ${index} requires a fan array`);
        }
        const fan = rawFan.filter(IsFanSpeed);
        if (fan.length < 2 || fan.length !== rawFan.length || new Set(fan).size !== fan.length) {
            throw new Error(`AirTouch unit ${index} requires at least two distinct, supported fan speeds`);
        }
        return {
            manufacturer: typeof unit.manufacturer === "string" ? unit.manufacturer : "N/A",
            model: typeof unit.model === "string" ? unit.model : "N/A",
            fan
        };
    });
    return { ...configuration, ip_address: address.trim(), ac_service_type: serviceType, units };
}
