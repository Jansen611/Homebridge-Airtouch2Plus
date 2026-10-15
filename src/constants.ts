export const PLUGIN_NAME = "@jansen611/homebridge-airtouch2plus";
export const PLATFORM_NAME = "Airtouch2";
export const SPILL_UUID = "154c4ebb-a16f-488b-8968-2e5bbe15809d";
export const TIMER_UUID = "2f9bfcd0-00ff-481a-873c-188a2e93d316";

export const PROTOCOL = {
    Header: [0x55, 0x55],
    Address: [0x80, 0xb0],
    MessageType: 0xc0,
    GroupControl: 0x20,
    GroupStatus: 0x21,
    ACControl: 0x22,
    ACStatus: 0x23,
    Port: 9200,
    PollInterval: 285000,
    ReconnectDelay: 10000
} as const;

// Control power values differ from the values returned in status messages.
export const AC_POWER = { KEEP: 0, NEXT: 1, OFF: 2, ON: 3 } as const;
export const AC_MODE = { AUTO: 0, HEAT: 1, DRY: 2, FAN: 3, COOL: 4, KEEP: 5 } as const;
export const FAN_SPEED = { AUTO: 0, QUIET: 1, LOW: 2, MEDIUM: 3, HIGH: 4, POWERFUL: 5, TURBO: 6 } as const;
export const FAN_KEEP = 7;
export const SETPOINT = { KEEP: 0, SET_VALUE: 64, DEFAULT_TEMPERATURE: 24 } as const;
export const ZONE_POWER_CONTROL = { KEEP: 0, NEXT: 1, OFF: 2, ON: 3, TURBO: 5 } as const;
export const ZONE_POWER_STATUS = { OFF: 0, ON: 1, TURBO: 2 } as const;
export const ZONE_SETTING = { KEEP: 0, DECREMENT: 2, INCREMENT: 3, SET_VALUE: 4 } as const;
