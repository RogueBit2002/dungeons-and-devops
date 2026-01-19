import { HttpApiMiddleware, HttpApiSecurity } from "@effect/platform";
import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";
import { createTransport } from "nodemailer";
import { UnauthorizedError } from "@dndevops/domain/errors";
import { Principal, PrincipalSchema } from "@dndevops/domain/identity";


import * as jwt from "jsonwebtoken";
import { AuthGatekeeper } from "@dndevops/domain/api";
import * as amqplib from "amqplib";

export class MailSender extends Context.Tag("@dndevops/backend-core/MailSender")<MailSender, 
(receiver: string, subject: string, content: string) => Effect.Effect<void, never, never>
>(){
	static readonly make = Effect.fn(function*(uri: string, sender: string) {
		const transport = createTransport(uri, {
			socketTimeout: 5000,
			greetingTimeout: 5000,
			connectionTimeout: 5000
		});

		return Effect.fn(function*(receiver: string | string[], subject: string, content: string) {
			yield* Effect.promise(() => transport.sendMail({from: `<${sender}>`, to: receiver, subject, text: content}));
		});
	});
};

export class AppConfig extends Effect.Service<AppConfig>()("@dndevops/backend-core/AppConfig", {
	effect: Effect.gen(function*() {
	
		const admins = (yield* Config.string("DNDEVOPS_ADMINS").pipe(Config.withDefault(""))).split(";");
		const jwtSecret = yield* Config.redacted("DNDEVOPS_JWT_SECRET");

		return Object.freeze({
			admins: Object.freeze(admins),
			jwtSecret
		})
	})
}){};


export class AMQPService extends Context.Tag("@dndevops/backend-core/AMQPService")<AMQPService, {
	readonly use: <T>(callback: (conn: Awaited<ReturnType<typeof amqplib.connect>>) => T | Promise<T>) => Effect.Effect<T>;
}>(){
	static readonly make = Effect.fn(function*(uri: string) {

		const conn = yield* Effect.acquireRelease(
					Effect.promise(() => amqplib.connect(uri)), 
					(conn, exit) => Effect.promise(() => conn.close()));

		return AMQPService.of({
			use: Effect.fn(function*<T>(callback: (conn: Awaited<ReturnType<typeof amqplib.connect>>) => T | Promise<T>) {
				const result = yield* Effect.try({
					try: () => callback(conn),
					catch: (e) => {
						console.error("Throwing because error handling hasn't been implemented yet");
						throw e;
					}
				});
				
				if(result instanceof Promise)
					return yield* Effect.tryPromise({
						try: () => result,
						catch: (e) => {
							console.error("Throwing because error handling hasn't been implemented yet");
							throw e;
						}
					});

				return result;
			})
		});
	})
}

export const LiveAuthGatekeeper = Layer.effect(
	AuthGatekeeper,
	Effect.gen(function*() {

		const appConfig = yield* AppConfig;
		const secret = Redacted.value(appConfig.jwtSecret);
		return {
			auth: Effect.fn(function*(token) {
				const value = Redacted.value(token);

				let decoded : Principal;
				try {
					decoded = Schema.decodeUnknownSync(PrincipalSchema)(jwt.verify(value, secret));
				} catch {
					return yield* new UnauthorizedError;
				}

				return { principal: decoded };
			})
		}
	})
).pipe(Layer.provide(AppConfig.Default));