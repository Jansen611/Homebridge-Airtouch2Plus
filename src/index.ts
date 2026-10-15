import type { API } from "homebridge" with { "resolution-mode": "import" };
import { PLATFORM_NAME, PLUGIN_NAME } from "./constants";
import { AirtouchPlatform } from "./platform";

// Registers the dynamic platform using the existing plugin and platform identifiers.
function RegisterPlugin(homebridge: API): void {
    homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, AirtouchPlatform);
}

export = RegisterPlugin;
