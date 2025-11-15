import * as eventReceiverModule from "@dndevops/module-event-receiver";
import * as eventWorkerModule from "@dndevops/module-event-worker";

const receiver = await eventReceiverModule.default({}, {});
const worker = await eventWorkerModule.default({}, {});

console.log("Hello World!");