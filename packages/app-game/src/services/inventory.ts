import { DrizzleService } from "@dndevops/backend-core/database";
import { InvalidPermissionsError } from "@dndevops/domain/errors";
import { Principal, TeamID } from "@dndevops/domain/identity";
import { Inventory } from "@dndevops/domain/types";
import { Effect } from "effect";
import { inventoryTable } from "../db/schema";
import { and, eq } from "drizzle-orm/pg-core/expressions";

export class InventoryService extends Effect.Service<InventoryService>()('@dndevops/app-game/InventoryService', {
	dependencies: [ ],
	effect: Effect.gen(function*() {
		
		const drizzle = yield* DrizzleService;

		return {
			ensureInventory: Effect.fn(function*(principal: Principal, team: TeamID) {
				if(!principal.admin)
					return yield* new InvalidPermissionsError;

				const r = yield* drizzle.use(async db => db.insert(inventoryTable).values({
					team,
					currency: 0
				}).onConflictDoNothing().returning());

				if(r.length > 0)
					yield* Effect.logInfo("Inventory created").pipe(Effect.annotateLogs({ team, client: principal.email }));
			}),
			deleteInventory: Effect.fn(function*(principal: Principal, team: TeamID) {
				if(!principal.admin)
					return yield* new InvalidPermissionsError;

				const r= yield* drizzle.use(async db => db.delete(inventoryTable).where(eq(inventoryTable.team, team)).returning());

				if(r.length > 0)
					yield* Effect.logInfo("Inventory deleted").pipe(Effect.annotateLogs({ team, client: principal.email }));
			}),
			inventoryExists: Effect.fn(function*(principal: Principal, team: TeamID) {
				const rows = yield* drizzle.use(async db => db.select().from(inventoryTable).where(eq(inventoryTable.team, team)));
				return rows.length > 0;
			}),
			getInventory: Effect.fn(function*(principal: Principal, team: TeamID) {
				return { team, currency: 0} as Inventory;
			}),
			modifyInventory: Effect.fn(function*(principal: Principal, id: string) {

			})
		};
	})
}) {};