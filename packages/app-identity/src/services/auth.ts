import { Context, DateTime, Effect, Redacted } from "effect";
import { TeamService } from "./team";
import { UnauthorizedError, UserNotFoundError } from "@dndevops/domain/errors";
import { AppConfig, MailSender } from "@dndevops/backend-core";
import { DrizzleService } from "@dndevops/backend-core/database";

import { TeamID } from "@dndevops/domain/identity";
import { refreshCodeTable, refreshTokenTable, teamMemberTable } from "../db/schema";
import { and, eq } from "drizzle-orm/pg-core/expressions";

import * as jwt from "jsonwebtoken";
import * as crypto from "crypto";
import * as uuid from "uuid";
import { number } from "effect/Equivalence";

export class AuthenticationService extends Effect.Service<AuthenticationService>()("@dndevops/app-identity/AuthenticationService", {
	dependencies: [ AppConfig.Default ],
	effect: Effect.gen(function*() {

		const appConfig = yield* AppConfig;
		const sendMail = yield* MailSender;
		
		const drizzle = yield* DrizzleService;
		const REFRESH_CODE_LENGTH = 6;

		const hash = Effect.fnUntraced(function*(value: string, salt: string) { return crypto.createHash("SHA-256").update(value).update(salt).digest("hex"); });
		const makeSalt = Effect.fnUntraced(function*() { return crypto.randomBytes(16).toString("hex"); });

		const getTeamsByUser = Effect.fnUntraced(function*(email: string) {
			const rows = yield* drizzle.use(async db => db.select().from(teamMemberTable).where(eq(teamMemberTable.email, email)));
			return rows.map(r => r.id);
		});

		return {
			requestRefreshToken: Effect.fn(function*(email: string) {
				const teams = yield* getTeamsByUser(email);

				if(teams.length == 0 && !appConfig.admins.includes(email))
					return yield* new UserNotFoundError;


				const digits = Array.from({ length: REFRESH_CODE_LENGTH}, () => Math.floor(Math.random() * 10))
				const code = digits.join("");

				const now = yield* DateTime.now;
				const expires_at = DateTime.add(now, { minutes: 5 });

				const salt = yield* makeSalt();
				const hashedCode = yield* hash(code, salt);

				// TODO: Add code to database
				const r = yield* drizzle.use(async db => db.insert(refreshCodeTable)
					.values({ email, hashed_code: hashedCode, salt, expires_at: new Date(expires_at.epochMillis) })/*.onConflictDoUpdate({
					target: [ refreshCodeTable.email, refreshCodeTable.hashed_code ],
					set: { expires_at: new Date(expires_at.epochMillis) }
				})*/);

				yield* sendMail(email, "Login code", `${code}`);
			}),

			getRefreshToken: Effect.fn(function*(email: string, code: string) {
				const teams = yield* getTeamsByUser(email);

				if(teams.length == 0 && !appConfig.admins.includes(email))
					return yield* new UserNotFoundError;

				// Check code existance

				//const salt = yield* makeSalt();
				//const hashedCode = yield* hash(code, salt);

				const now = yield* DateTime.now;

				const codeRows = yield* drizzle.use(async db => db.select().from(refreshCodeTable).where(eq(refreshCodeTable.email, email)));

				let validRow: typeof codeRows[number] | undefined = undefined;

				for(const row of codeRows)
				{
					if(now.epochMillis > row.expires_at.getTime())
						continue;

					const hashedCode = yield* hash(code, row.salt);

					if(row.hashed_code != hashedCode)
						continue;

					validRow = row;
					break;
				}

				if(!validRow)
					return yield* new UnauthorizedError;

				yield* drizzle.use(async db => db.delete(refreshCodeTable).where(and(
					eq(refreshCodeTable.email, validRow.email),
					eq(refreshCodeTable.hashed_code, validRow.hashed_code),
					eq(refreshCodeTable.salt, validRow.salt)
				)).returning());

				const expiresAt = DateTime.add(now, { days: 7 });
				
				const payload = {
						email,
						exp: Math.floor(expiresAt.epochMillis / 1000)
				}

				const refreshToken = jwt.sign(payload, Redacted.value(appConfig.jwtSecret), { algorithm: "HS512" });

				const salt = yield* makeSalt();
				const hashedToken = yield* hash(refreshToken, salt);

				const id = uuid.v4();
				yield* drizzle.use(async db => db.insert(refreshTokenTable).values({
					id,
					email,
					hashed_token: hashedToken,
					salt,
					expires_at: new Date(expiresAt.epochMillis)
				}));

				yield* Effect.logInfo("Refresh token generated").pipe(Effect.annotateLogs({client: email}));

				return refreshToken;
			}),

			getAccessToken: Effect.fn(function*(refreshToken: string) {

				let decoded;

				try {
					decoded = jwt.verify(refreshToken, Redacted.value(appConfig.jwtSecret)) as any;
				} catch {
					return yield* new UnauthorizedError;
				}

				const email = decoded.email;
				
				const now = yield* DateTime.now;

				const tokenRows = yield* drizzle.use(async db => db.select().from(refreshTokenTable).where(eq(refreshTokenTable.email, email)));

				let tokenId: string | undefined;
				for(const row of tokenRows) {
					if(now.epochMillis > row.expires_at.getTime())
						continue;

					const hashedToken = yield* hash(refreshToken, row.salt);

					if(row.hashed_token != hashedToken)
						continue;

					tokenId = row.id;
					break;
				}

				if(!tokenId)
					return yield* new UnauthorizedError;
				
				// TODO: Generate new refresh token and swap
				
				let newRefreshToken: string;
				let accessToken: string;

				{
					const expiresAt = DateTime.add(now, { days: 7 });
				
					const payload = {
							email,
							exp: Math.floor(expiresAt.epochMillis / 1000)
					}

					newRefreshToken = jwt.sign(payload, Redacted.value(appConfig.jwtSecret), { algorithm: "HS512" });

					const salt = yield* makeSalt();
					const hashedToken = yield* hash(newRefreshToken, salt);

					yield* drizzle.use(async db => db.update(refreshTokenTable).set({
						hashed_token: hashedToken,
						salt,
						expires_at: new Date(expiresAt.epochMillis)
					}).where(eq(refreshTokenTable.id, tokenId)));
					
					yield* Effect.logInfo("Refresh token swapped").pipe(Effect.annotateLogs({client: email}));
				}

				{
					const teams = yield* getTeamsByUser(email);
					
					const payload = {
						email,
						exp: Math.floor(DateTime.add(now, { minutes: 5}).epochMillis / 1000),
						admin: appConfig.admins.includes(email),
						teams
					};

					accessToken = jwt.sign(payload, Redacted.value(appConfig.jwtSecret), { algorithm: "HS512" });
				}

				return {
					refreshToken: newRefreshToken,
					accessToken
				} as const;
			})
		}
	})
}){};