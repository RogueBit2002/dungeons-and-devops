import * as gameSimulationModule from "@dndevops/module-game-simulation";
import * as gameManipulationModule from "@dndevops/module-game-manipulation";
import * as gameBoardStorageModule from "@dndevops/module-game-board-storage";

const simulation = await gameSimulationModule.default({}, {});
const manipulation = await gameManipulationModule.default({}, {});
const boardStorage = await gameBoardStorageModule.default({}, {});

console.log("Hello World!");