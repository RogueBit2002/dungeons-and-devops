import { DrizzleService } from "@dndevops/backend-core/database";
import { BoardNotFoundError, InvalidPermissionsError } from "@dndevops/domain/errors";
import { Principal, TeamID } from "@dndevops/domain/identity";
import { Effect } from "effect";
import { Board, BoardData } from "@dndevops/domain/types";
import { boardTable } from "../db/schema";
import { and, eq } from "drizzle-orm/pg-core/expressions";
import * as uuid from "uuid";

export class BoardStorageService extends Effect.Service<BoardStorageService>()('@dndevops/app-game/BoardStorageService', {
	dependencies: [ ],
	effect: Effect.gen(function*() {
		
		const drizzle = yield* DrizzleService;

		return {
			boardExists: Effect.fn(function*(principal: Principal, team: TeamID) {
				const rows = yield* drizzle.use(async db => db.select().from(boardTable).where(eq(boardTable.team, team)));
				return rows.length > 0;
			}),
			ensureBoard: Effect.fn(function*(principal: Principal, team: TeamID) {
				if(!principal.admin)
					return yield* new InvalidPermissionsError;

				const id = uuid.v4();

				const data: BoardData = { tiles: Array.from({ length: 9}, () => null) };

				const r = yield* drizzle.use(async db => db.insert(boardTable).values({
					team,
					data,
				}).onConflictDoNothing().returning());

				if(r.length > 0)
					yield* Effect.logInfo("Board created").pipe(Effect.annotateLogs({ team, client: principal.email }));
			}),
			deleteBoard: Effect.fn(function*(principal: Principal, team: TeamID) {
				if(!principal.admin)
					return yield* new InvalidPermissionsError;

				const r= yield* drizzle.use(async db => db.delete(boardTable).where(eq(boardTable.team, team)).returning());
				if(r.length > 0)
					yield* Effect.logInfo("Board deleted").pipe(Effect.annotateLogs({ team, client: principal.email }));
			}),
			getBoard: Effect.fn(function*(principal: Principal, team: TeamID) {
				const rows = yield* drizzle.use(async db => db.select().from(boardTable).where(eq(boardTable.team, team)));

				if(rows.length == 0)
					return yield* new BoardNotFoundError;

				const row = rows[0];

				return { team: row.team, data: row.data } as Board;
			})/*,
			getBoardsByTeam: Effect.fn(function*(principal: Principal, team: TeamID) {
				const rows = yield* drizzle.use(async db => db.select().from(boardTable).where(eq(boardTable.team, team)));

				return rows.map(row => row.id) as BoardID[];
			})*/
		};
	})
}) {};