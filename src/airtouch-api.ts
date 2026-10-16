import { EventEmitter } from "node:events";
import { Socket } from "node:net";
import {
    AC_MODE, AC_POWER, FAN_KEEP, PROTOCOL, SETPOINT,
    ZONE_POWER_CONTROL, ZONE_SETTING
} from "./constants";
import type { ACControl, ACStatus, ControllerLog, ZoneControl, ZoneStatus } from "./types";

interface ControllerEvents {
    ac_status: [ACStatus[]];
    groups_status: [ZoneStatus[]];
}

// Calculates the Modbus CRC16 used by the AirTouch 2+ protocol.
export function CalculateCRC16(data: Uint8Array): number {
    let checksum = 0xffff;
    for (const byte of data) {
        checksum ^= byte;
        for (let i = 0; i < 8; i++) {
            checksum = (checksum & 1) !== 0 ? (checksum >>> 1) ^ 0xa001 : checksum >>> 1;
        }
    }
    return checksum;
}

// Exchanges typed status and control messages with an AirTouch 2+ controller.
export class AirtouchAPI extends EventEmitter<ControllerEvents> {
    private device?: Socket;
    private receiveBuffer: Buffer = Buffer.alloc(0);
    private pollingTimer?: ReturnType<typeof setInterval>;
    private groupRequestTimer?: ReturnType<typeof setTimeout>;
    private reconnectTimer?: ReturnType<typeof setTimeout>;
    private stopped = true;

    // Stores the logger without opening a connection until Connect is called.
    constructor(private readonly log: ControllerLog) {
        super();
    }

    // Encodes a single AC command; repeat length precedes repeat count on the wire.
    EncodeACControl(unit: ACControl): Buffer {
        const unitNumber = unit.ac_unit_number ?? 0;
        const power = unit.ac_power_state ?? AC_POWER.KEEP;
        const fanSpeed = unit.ac_fan_speed ?? FAN_KEEP;
        const mode = unit.ac_mode ?? AC_MODE.KEEP;
        const setpointControl = unit.ac_setpoint_control ?? SETPOINT.KEEP;
        const temperature = unit.ac_target_value ?? SETPOINT.DEFAULT_TEMPERATURE;
        return Buffer.from([
            PROTOCOL.ACControl, 0, 0, 0, 0, 4, 0, 1,
            unitNumber | (power << 4), fanSpeed | (mode << 4),
            setpointControl, temperature * 10 - 100
        ]);
    }

    // Encodes a single zone command using the existing damper-control protocol.
    EncodeZoneControl(zone: ZoneControl): Buffer {
        const zoneNumber = (zone.group_number ?? 0) & 0b00111111;
        const power = zone.group_power_state ?? ZONE_POWER_CONTROL.KEEP;
        const setting = zone.group_target_type ?? ZONE_SETTING.KEEP;
        return Buffer.from([
            PROTOCOL.GroupControl, 0, 0, 0, 0, 4, 0, 1,
            zoneNumber, (power | (setting << 5)) & 0b11100111,
            zone.group_target ?? 0, 0
        ]);
    }

    // Wraps a payload in its address, message identifier, length and CRC fields.
    Send(data: Buffer): void {
        if (!this.device || this.device.destroyed) {
            throw new Error("AirTouch controller is not connected");
        }
        const messageID = Math.floor(Math.random() * 255) + 1;
        const length = Buffer.alloc(2);
        length.writeUInt16BE(data.length);
        const payload = Buffer.concat([
            Buffer.from([...PROTOCOL.Address, messageID, PROTOCOL.MessageType]), length, data
        ]);
        const checksum = Buffer.alloc(2);
        checksum.writeUInt16BE(CalculateCRC16(payload));
        const message = Buffer.concat([Buffer.from(PROTOCOL.Header), payload, checksum]);
        this.log(`API | Sending message ${messageID}: ${message.toString("hex")}`);
        this.device.write(message);
    }

    // Sends an OFF, HEAT, COOL or AUTO command using HomeKit's target-state values.
    SetACHeatingCoolingState(unitNumber: number, state: number): void {
        const command: ACControl = { ac_unit_number: unitNumber, ac_power_state: AC_POWER.ON };
        switch (state) {
            case 0:
                command.ac_power_state = AC_POWER.OFF;
                break;
            case 1:
                command.ac_mode = AC_MODE.HEAT;
                break;
            case 2:
                command.ac_mode = AC_MODE.COOL;
                break;
            default:
                command.ac_mode = AC_MODE.AUTO;
        }
        this.Send(this.EncodeACControl(command));
    }

    // Changes power independently while preserving the controller's selected mode.
    SetACPower(unitNumber: number, active: boolean): void {
        this.Send(this.EncodeACControl({
            ac_unit_number: unitNumber,
            ac_power_state: active ? AC_POWER.ON : AC_POWER.OFF
        }));
    }

    // Changes the controller mode without turning an inactive AC unit on.
    SetACMode(unitNumber: number, mode: number): void {
        this.Send(this.EncodeACControl({ ac_unit_number: unitNumber, ac_mode: mode }));
    }

    // Sets the target temperature for the specified AC unit.
    SetACTargetTemperature(unitNumber: number, temperature: number): void {
        this.Send(this.EncodeACControl({
            ac_unit_number: unitNumber,
            ac_target_value: temperature,
            ac_setpoint_control: SETPOINT.SET_VALUE
        }));
    }

    // Sets the controller's discrete fan-speed value.
    SetACFanSpeed(unitNumber: number, speed: number): void {
        this.Send(this.EncodeACControl({ ac_unit_number: unitNumber, ac_fan_speed: speed }));
    }

    // Requests the status of all AC units.
    GetACStatus(): void {
        this.Send(Buffer.from([PROTOCOL.ACStatus, 0, 0, 0, 0, 0, 0, 0]));
    }

    // Requests the status of all controller groups.
    GetGroupStatus(): void {
        this.Send(Buffer.from([PROTOCOL.GroupStatus, 0, 0, 0, 0, 0, 0, 0]));
    }

    // Switches a controller group on or off.
    SetZoneActive(groupNumber: number, active: boolean): void {
        this.Send(this.EncodeZoneControl({
            group_number: groupNumber,
            group_power_state: active ? ZONE_POWER_CONTROL.ON : ZONE_POWER_CONTROL.OFF
        }));
    }

    // Sets a controller group's damper opening percentage.
    SetZoneDamperPosition(groupNumber: number, position: number): void {
        this.Send(this.EncodeZoneControl({
            group_number: groupNumber,
            group_target_type: ZONE_SETTING.SET_VALUE,
            group_target: position
        }));
    }

    // Validates repeated records before reading any fixed-width protocol fields.
    private ValidateStatus(data: Buffer, recordLength: number): boolean {
        if (data.length < 8 || data.readUInt16BE(4) !== recordLength
            || data.length !== 8 + data.readUInt16BE(6) * recordLength) {
            this.log("API | WARNING: invalid status message repeat data length");
            return false;
        }
        return true;
    }

    // Decodes AC status records into the same wire-named fields used by existing logs.
    DecodeACStatus(data: Buffer): void {
        if (!this.ValidateStatus(data, 10)) return;
        const statuses: ACStatus[] = [];
        for (let offset = 8; offset < data.length; offset += 10) {
            const identity = data.readUInt8(offset);
            const modeAndFan = data.readUInt8(offset + 1);
            const flags = data.readUInt8(offset + 3);
            statuses.push({
                ac_unit_number: identity & 0x0f,
                ac_power_state: identity >>> 4,
                ac_mode: modeAndFan >>> 4,
                ac_fan_speed: modeAndFan & 0x0f,
                ac_target: (data.readUInt8(offset + 2) + 100) / 10,
                ac_spill: (flags & 2) >>> 1,
                ac_timer_set: flags & 1,
                ac_temp: (data.readUInt16BE(offset + 4) - 500) / 10,
                ac_error_code: data.readUInt16BE(offset + 6)
            });
        }
        this.emit("ac_status", statuses);
    }

    // Decodes zone status records without reading beyond a complete message.
    DecodeGroupsStatus(data: Buffer): void {
        if (!this.ValidateStatus(data, 8)) return;
        const statuses: ZoneStatus[] = [];
        for (let offset = 8; offset < data.length; offset += 8) {
            const identity = data.readUInt8(offset);
            const flags = data.readUInt8(offset + 6);
            statuses.push({
                group_number: identity & 0x3f,
                group_power_state: identity >>> 6,
                group_damper_position: data.readUInt8(offset + 1) & 0x7f,
                group_has_turbo: flags >>> 7,
                group_has_spill: (flags & 2) >>> 1
            });
        }
        this.emit("groups_status", statuses);
    }

    // Accumulates TCP fragments and dispatches only complete, CRC-checked frames.
    ReceiveData(chunk: Buffer): void {
        this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);
        while (this.receiveBuffer.length >= 8) {
            const frame = this.receiveBuffer;
            if (frame[0] !== PROTOCOL.Header[0] || frame[1] !== PROTOCOL.Header[1]
                || frame[3] !== PROTOCOL.Address[0]) {
                this.log("API | WARNING: invalid header");
                this.receiveBuffer = frame.subarray(1);
                continue;
            }
            const dataLength = frame.readUInt16BE(6);
            const frameLength = dataLength + 10;
            if (frame.length < frameLength) return;
            this.receiveBuffer = frame.subarray(frameLength);
            const payload = frame.subarray(8, 8 + dataLength);
            if (frame.readUInt16BE(8 + dataLength) !== CalculateCRC16(frame.subarray(2, 8 + dataLength))) {
                this.log("API | ERROR: invalid crc");
                continue;
            }
            this.log(`API | Received message with id ${frame[4]} and data ${payload.toString("hex")}`);
            if (payload[0] === PROTOCOL.ACStatus) this.DecodeACStatus(payload);
            else if (payload[0] === PROTOCOL.GroupStatus) this.DecodeGroupsStatus(payload);
        }
    }

    // Clears polling and initial-query timers whenever a connection is closed.
    private ClearConnectionTimers(): void {
        clearInterval(this.pollingTimer);
        clearTimeout(this.groupRequestTimer);
        this.pollingTimer = undefined;
        this.groupRequestTimer = undefined;
    }

    // Connects to the controller and schedules status queries and reconnection.
    Connect(address: string): void {
        this.Disconnect();
        this.stopped = false;
        const device = new Socket();
        this.device = device;
        device.on("data", (data: Buffer) => this.ReceiveData(data));
        device.on("error", (error: Error) => {
            this.log(`API | Connection Error: ${error.message}`);
            device.destroy();
        });
        device.on("close", () => {
            if (this.device !== device) return;
            this.ClearConnectionTimers();
            this.receiveBuffer = Buffer.alloc(0);
            this.log("API | Disconnected from Airtouch");
            if (!this.stopped) {
                this.reconnectTimer = setTimeout(() => this.Connect(address), PROTOCOL.ReconnectDelay);
            }
        });
        device.connect(PROTOCOL.Port, address, () => {
            this.log("API | Connected to Airtouch");
            this.GetACStatus();
            this.groupRequestTimer = setTimeout(() => this.GetGroupStatus(), 2000);
            this.pollingTimer = setInterval(() => this.GetGroupStatus(), PROTOCOL.PollInterval);
        });
    }

    // Releases the socket and all timers during shutdown or connection replacement.
    Disconnect(): void {
        this.stopped = true;
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        this.ClearConnectionTimers();
        const device = this.device;
        this.device = undefined;
        this.receiveBuffer = Buffer.alloc(0);
        device?.destroy();
    }
}
