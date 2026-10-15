import type { API } from "homebridge" with { "resolution-mode": "import" };
import type { AirtouchAccessory, ThermoHistory } from "./types";

interface HistoryHomebridge {
    hap: API["hap"];
    user: API["user"];
    globalFakeGatoTimer?: { stop(): void };
}

type HistoryConstructor = new (
    accessoryType: "thermo",
    accessory: AirtouchAccessory,
    options: { storage: "fs" }
) => ThermoHistory;

// Creates an isolated compatibility boundary for the untyped history dependency.
export function CreateHistoryFactory(homebridge: API): HistoryConstructor {
    const { Characteristic, Formats, Perms } = homebridge.hap;

    // Supplies the retired enum aliases without changing Homebridge's global class.
    class HistoryCharacteristic extends Characteristic {
        static readonly Formats = { DATA: Formats.DATA };
        static readonly Perms = {
            READ: Perms.PAIRED_READ, WRITE: Perms.PAIRED_WRITE,
            NOTIFY: Perms.NOTIFY, HIDDEN: Perms.HIDDEN
        };
    }

    const historyHomebridge: HistoryHomebridge = {
        hap: { ...homebridge.hap, Characteristic: HistoryCharacteristic },
        user: homebridge.user
    };
    const InitialiseHistory = require("fakegato-history") as (api: HistoryHomebridge) => HistoryConstructor;
    homebridge.on("shutdown", () => historyHomebridge.globalFakeGatoTimer?.stop());
    return InitialiseHistory(historyHomebridge);
}
