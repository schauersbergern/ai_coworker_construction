import { registerCoworker } from "./registry";
import { validateRegisteredManifests } from "./validate";
import { franzManifest } from "./franz/manifest";
import { miraManifest } from "./mira/manifest";
import { theoManifest } from "./theo/manifest";
import { bodoManifest } from "./bodo/manifest";

registerCoworker(franzManifest);
registerCoworker(miraManifest);
registerCoworker(theoManifest);
registerCoworker(bodoManifest);

// Harter Startfehler, falls ein Default sein Schema verletzt.
validateRegisteredManifests();

export { getAllCoworkers, getCoworker } from "./registry";
export { getResolvedCoworkers, getResolvedCoworker, isAvailable, resolveConfig } from "./resolve";
export { requireAvailable } from "./guard";
