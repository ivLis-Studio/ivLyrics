import { getRuntimeService, publishRuntimeService } from "../../spicetify/runtimeServices.mjs";

const serviceName = "MarketplaceManager";
export const readMarketplaceManager = (host) => getRuntimeService(serviceName, host);
export const publishMarketplaceManager = (host, manager) => publishRuntimeService(serviceName, manager, host);
