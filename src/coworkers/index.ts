import { registerCoworker } from "./registry";
import { validateRegisteredManifests } from "./validate";
import { franzManifest } from "./franz/manifest";
import { miraManifest } from "./mira/manifest";
import { theoManifest } from "./theo/manifest";

registerCoworker(franzManifest);
registerCoworker(miraManifest);
registerCoworker(theoManifest);

// Harter Startfehler, falls ein Default sein Schema verletzt.
validateRegisteredManifests();

export { getAllCoworkers, getCoworker } from "./registry";
export { getResolvedCoworkers, getResolvedCoworker, isAvailable } from "./resolve";
export { requireAvailable } from "./guard";
