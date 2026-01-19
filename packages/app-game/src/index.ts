import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { DrizzleService } from "@dndevops/backend-core/database";
import { AMQPService, LiveAuthGatekeeper } from "@dndevops/backend-core";
import { Exchanges, Event, TeamCreatedEvent, TeamDeletedEvent } from "@dndevops/backend-core/messaging";
import { BoardStorageService } from "./services/board-storage";
import { InventoryService } from "./services/inventory";

import {
	HttpApiBuilder,
	HttpMiddleware,
	HttpServer
} from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";


import { Console, Effect, Either, Layer, Schema, flow, Config, pipe, Match, Logger } from "effect"

import { createServer } from "node:http"

import LiveApi from "./api";
import { Principal, TeamID } from '@dndevops/domain/identity';

const drizzleLayer = Layer.scoped(
	DrizzleService,
	Effect.gen(function*() {
		const uri = yield* Config.string("DNDEVOPS_GAME_POSTGRES_URI");

		const service = yield* DrizzleService.make(uri);

		yield* service.use(async db => migrate(db, { migrationsFolder: "drizzle"}));

		return service;
	})
);

const amqpLayer = Layer.scoped(
	AMQPService,
	Effect.gen(function*() {
		const uri = yield* Config.string("DNDEVOPS_AMQP_URI");

		const service = yield* AMQPService.make(uri);

		return service;
	})
);

const coreLayer = Layer.mergeAll(drizzleLayer, amqpLayer);

const appLayer = Layer.mergeAll(BoardStorageService.Default, InventoryService.Default, coreLayer).pipe(Layer.provide(coreLayer));

const eventListenerProgram = Effect.gen(function*() {

	const servicePrincipal: Principal = {
		admin: true,
		email: "<service>",
		teams: []
	};

	const amqp = yield* AMQPService;
	
	const inventoryService = yield* InventoryService;
	const boardStorageService = yield* BoardStorageService;

	const channel = yield* amqp.use(conn => conn.createChannel());

	const queue = "dndevops.game.events";
	const routingKey = "#";

	yield* amqp.use(conn => channel.assertExchange(Exchanges.EVENTS.name, Exchanges.EVENTS.type, { durable: Exchanges.EVENTS.durable }));
	yield* amqp.use(conn => channel.assertQueue(queue, { durable: true }));
	yield* amqp.use(conn => channel.bindQueue(queue, Exchanges.EVENTS.name, routingKey));

	yield* amqp.use(async conn => channel.consume(queue, async (msg) => {
		if(msg === null)
			return;

		const content = msg.content.toString();
		let decoded;
		
		try {
			const encoded = JSON.parse(msg.content.toString());
			decoded = Schema.decodeUnknownSync(Event)(encoded);
		} catch(e) {
			console.error(`Invalid event: ${content}`);
			console.error(e);
			channel.ack(msg); // Remove from queue
			return;
		}
		
		const action = pipe(
			Match.value(decoded),
			Match.tag(TeamCreatedEvent._tag, Effect.fn(function*(event: TeamCreatedEvent) {
				yield* inventoryService.ensureInventory(servicePrincipal, event.id);

				yield* boardStorageService.ensureBoard(servicePrincipal, event.id);
			})),
			Match.tag(TeamDeletedEvent._tag, Effect.fn(function*(event: TeamDeletedEvent) {
				yield* inventoryService.deleteInventory(servicePrincipal, event.id as TeamID);

				yield* boardStorageService.deleteBoard(servicePrincipal, event.id as TeamID);
			})),
			Match.orElse(() => undefined)
		);


		if(action)
			await Effect.runPromise(action).catch(e => console.error(e));
		
		channel.ack(msg);
	}));

	yield* Effect.never;
}).pipe(Effect.provide(appLayer));


const { port, host } = Effect.runSync(Effect.gen(function*() { 
	return { 
		port: yield* Config.number("DNDEVOPS_HTTP_PORT").pipe(Config.withDefault(3000)),
		host: yield* Config.string("DNDEVOPS_HTTP_HOST").pipe(Config.withDefault("0.0.0.0"))
	}
}));

const HttpLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
	// Add CORS middleware to handle cross-origin requests
	Layer.provide(HttpApiBuilder.middlewareCors()),
	// Provide the API implementation
	Layer.provide(LiveApi),
	// Log the server's listening address
	HttpServer.withLogAddress,
	// Set up the Node.js HTTP server
	Layer.provide(NodeHttpServer.layer(createServer, { port, host })),
	
	Layer.provide(appLayer),
	Layer.provide(LiveAuthGatekeeper),
	Layer.annotateLogs("service", "GAME")
);

// Launch the server
Layer.launch(HttpLive).pipe(Effect.provide(Logger.json), NodeRuntime.runMain);

Effect.runFork(eventListenerProgram.pipe(Effect.annotateLogs("service", "GAME"), Effect.provide(Logger.json)));