import { DrizzleService } from "@dndevops/backend-core/database";
import { Effect, Schema } from "effect";
import { TeamID, Principal, TeamData } from "@dndevops/domain/identity";
import { InvalidPermissionsError, TeamNotFoundError } from "@dndevops/domain/errors";

import { teamMemberTable, teamTable } from "../db/schema";
import { and, eq } from "drizzle-orm/pg-core/expressions";
import * as uuid from "uuid";
import { AMQPService } from "@dndevops/backend-core";
import { Exchanges, TeamCreatedEvent, TeamDeletedEvent } from "@dndevops/backend-core/messaging";

export class TeamService extends Effect.Service<TeamService>()('@dndevops/app-identity/TeamService', {
	effect: Effect.gen(function*() {
		const drizzle = yield* DrizzleService;
		const amqp = yield* AMQPService;


		const channel = yield* amqp.use(async conn => conn.createChannel());
		const exchange = yield* amqp.use(async conn => channel.assertExchange(Exchanges.EVENTS.name, Exchanges.EVENTS.type, { durable: Exchanges.EVENTS.durable }));

		return {
			getTeams: Effect.fn(function*(principal: Principal) {
				const teams = yield* drizzle.use(async db => db.select().from(teamTable))
				return teams.map(t => t.id);
			}),

			getTeam: Effect.fn(function*(principal: Principal, id: TeamID) {
				const [teamData] = yield* drizzle.use(async db => db.select().from(teamTable).where(eq(teamTable.id, id)));

				if(!teamData)
					return yield* new TeamNotFoundError;

				const members = yield* drizzle.use(async db => db.select().from(teamMemberTable).where(eq(teamTable.id, id)));

				return { 
					id,
					displayName: teamData.name,
					members: members.map(m => m.email)
				} as TeamData & {id: TeamID};
			}),

			createTeam: Effect.fn(function*(principal: Principal, displayName: string) {
				if(!principal.admin)
					return yield* new InvalidPermissionsError;

				const id = uuid.v4();
				
				yield* drizzle.use(async db => db.insert(teamTable).values({ id, name: displayName }));

				const event = new TeamCreatedEvent({ id });

				yield* amqp.use(async conn => channel.publish(exchange.exchange, event.routingKey, Buffer.from(JSON.stringify(Schema.encodeSync(TeamCreatedEvent)(event)))));

				yield* Effect.logInfo(`Team created`).pipe(Effect.annotateLogs({
					teamId: id,
					displayName,
					client: principal.email
				}));
				return id as TeamID;
			}),

			deleteTeam: Effect.fn(function*(principal: Principal, id: TeamID) {
				if(!principal.admin)
					return yield* new InvalidPermissionsError;

				const rows = yield* drizzle.use(async db => db.delete(teamTable).where(eq(teamTable.id, id)).returning());

				if(rows.length == 0)
					return yield* new TeamNotFoundError;

				const event = new TeamDeletedEvent({ id });
				
				yield* amqp.use(async conn => channel.publish(exchange.exchange, event.routingKey, Buffer.from(JSON.stringify(Schema.encodeSync(TeamDeletedEvent)(event)))));

				yield* Effect.logInfo(`Team deleted`).pipe(Effect.annotateLogs({
					teamId: id,
					client: principal.admin
				}));

			}),

			updateTeam: Effect.fn(function*(principal: Principal, id: TeamID, displayName: string) {
				if(!principal.admin)
					return yield* new InvalidPermissionsError;

				const change = yield* drizzle.use(async db => db.update(teamTable).set({ name: displayName }).where(eq(teamTable.id, id)));

				if(change.rowCount ?? 0 == 0)
					return yield* new TeamNotFoundError;

				yield* Effect.logInfo("Team updated").pipe(Effect.annotateLogs({ teamId: id, displayName, client: principal.email }));
			}),
			
			assignUserToTeam: Effect.fn(function*(principal: Principal, team: TeamID, email: string) {
				if(!principal.admin)
					return yield* new InvalidPermissionsError;

				const exists = (yield* drizzle.use(async db => db.select().from(teamTable).where(eq(teamTable.id, team)))).length > 0;

				if(!exists)
					return yield* new TeamNotFoundError;

				// Just ignore double assignments, it's fine
				yield* drizzle.use(async db => db.insert(teamMemberTable).values({ email, id: team }).onConflictDoNothing());

				yield* Effect.logInfo("User assigned").pipe(Effect.annotateLogs({ teamId: team, user: email, client: principal.email }));
			}),

			removeUserFromTeam: Effect.fn(function*(principal: Principal, team: TeamID, email: string) {
				if(!principal.admin)
					return yield* new InvalidPermissionsError;

				yield* drizzle.use(async db => db.delete(teamMemberTable).where(and(eq(teamMemberTable.email, email), eq(teamMemberTable.id, team))));

				yield* Effect.logInfo("User removed").pipe(Effect.annotateLogs({ teamId: team, user: email, client: principal.email }));
			}),
		};
	})
}){};