import type { API, Characteristic, WithUUID } from "homebridge" with { "resolution-mode": "import" };
import { SPILL_UUID, TIMER_UUID } from "./constants";

export interface CustomCharacteristics {
    SpillStatus: WithUUID<typeof Characteristic & (new () => Characteristic)>;
    TimerStatus: WithUUID<typeof Characteristic & (new () => Characteristic)>;
}

// Defines read-only custom characteristics using the UUIDs from the original plugin.
export function CreateCustomCharacteristics(homebridge: API): CustomCharacteristics {
    const { Characteristic, Formats, Perms } = homebridge.hap;

    // Exposes the controller's spill flag to third-party HomeKit applications.
    class SpillStatus extends Characteristic {
        static readonly UUID = SPILL_UUID;

        // Initialises the spill characteristic with modern HAP permissions.
        constructor() {
            super("Spill Active", SpillStatus.UUID, {
                format: Formats.BOOL,
                perms: [Perms.PAIRED_READ, Perms.NOTIFY]
            });
            this.value = this.getDefaultValue();
        }
    }

    // Exposes the controller's timer flag to third-party HomeKit applications.
    class TimerStatus extends Characteristic {
        static readonly UUID = TIMER_UUID;

        // Initialises the timer characteristic with modern HAP permissions.
        constructor() {
            super("Timer Set", TimerStatus.UUID, {
                format: Formats.BOOL,
                perms: [Perms.PAIRED_READ, Perms.NOTIFY]
            });
            this.value = this.getDefaultValue();
        }
    }

    return { SpillStatus, TimerStatus };
}
