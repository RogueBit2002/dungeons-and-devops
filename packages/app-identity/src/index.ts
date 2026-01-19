
import {
	HttpApiBuilder,
	HttpMiddleware,
	HttpServer
} from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Console, Effect, Either, Layer, Schema, flow, Config, Logger } from "effect"

import { createServer } from "node:http"
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { AMQPService, LiveAuthGatekeeper, MailSender } from "@dndevops/backend-core";
import { DrizzleService } from "@dndevops/backend-core/database";

import { AuthenticationService } from "./services/auth";
import { TeamService } from "./services/team";


import LiveApi from "./api";


const mailLayer = Layer.effect(
	MailSender,
	Effect.gen(function*() {
		const uri = yield* Config.string("DNDEVOPS_SMTP_URI");
		const sender = yield* Config.string("DNDEVOPS_SMTP_SENDER");

		return yield* MailSender.make(uri, sender);
	})
);


const drizzleLayer = Layer.scoped(
	DrizzleService,
	Effect.gen(function*() {
		const uri = yield* Config.string("DNDEVOPS_IDENTITY_POSTGRES_URI");

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

Layer.annotateLogs("service", "IDENTITY");

const coreLayer = Layer.mergeAll(mailLayer, drizzleLayer, amqpLayer);

const appLayer = Layer.mergeAll(AuthenticationService.Default, TeamService.Default).pipe(Layer.provide(coreLayer));

// Configure and serve the API

const { port, host } = Effect.runSync(Effect.gen(function*() { 
	return { 
		port: yield* Config.number("DNDEVOPS_HTTP_PORT").pipe(Config.withDefault(3000)),
		host: yield* Config.string("DNDEVOPS_HTTP_HOST").pipe(Config.withDefault("0.0.0.0"))
	}
}));

// Use JSON logger for production (or Logger.pretty for dev)
const LoggerLive = Logger.json
// Annotate all logs from this layer with service name

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
	Layer.annotateLogs("service","IDENTITY")
);

// Launch the server
Layer.launch(HttpLive).pipe(Effect.provide(Logger.json), NodeRuntime.runMain);