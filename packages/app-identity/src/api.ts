
import { Console, Effect, Either, Layer, Schema, flow, Config } from "effect";
import {
	HttpApi,
	HttpApiBuilder
} from "@effect/platform";


import { AuthenticationInfo, IdentityGroup,  } from "@dndevops/domain/api";

import { UnauthorizedError, UserNotFoundError } from "@dndevops/domain/errors";
import { AuthenticationService } from "./services/auth";
import { TeamService } from "./services/team";

const IsolatedApi = HttpApi.make("DnDevOps-Identity").add(IdentityGroup);


const identityGroupLive = HttpApiBuilder.group(IsolatedApi, "Identity", (handlers) => handlers
	.handle("getAccessToken", ({ request, headers }) => Effect.gen(function*() {
		const authService = yield* AuthenticationService;

		const refreshToken = headers.authorization.substring("Bearer ".length);

		const result = yield* Effect.either(authService.getAccessToken(refreshToken));

		if(Either.isRight(result))
			return result.right;

		return yield* new UnauthorizedError;
	}))
	.handle("getRefreshToken", ({ request, headers }) => Effect.gen(function*() {

		const authService = yield* AuthenticationService;

		const encoded = headers.authorization.substring("Basic ".length);
		const decoded = atob(encoded);

		const [ email, code ] = decoded.split(":");

		if(email == undefined || code == undefined)
			return yield*  new UnauthorizedError;

		const either = yield* Effect.either(authService.getRefreshToken(email, code));

		//Wtf is going on?? left is right and right is left????
		if(Either.isRight(either))
			return either.right;


		return yield* new UnauthorizedError;
	}))
	.handle("sendRefreshRequest", ({ request, payload }) => Effect.gen(function*() {
		const authService = yield* AuthenticationService;

		const result = yield* Effect.either(authService.requestRefreshToken(payload.email));

		if(Either.isLeft(result))
			return yield* new UserNotFoundError;
	}))
	.handle("getTeams", ({ request,  }) => Effect.gen(function*() {
		const info = yield* AuthenticationInfo;

		const teamService = yield* TeamService;

		return yield* teamService.getTeams(info.principal);
	}))
	.handle("getTeam", ({ request, path }) => Effect.gen(function*() {
		const info = yield* AuthenticationInfo;

		const teamService = yield* TeamService;

		return yield* teamService.getTeam(info.principal, path.team);
	}))
	.handle("createTeam", ({ request, payload}) => Effect.gen(function*() {

		const authInfo = yield* AuthenticationInfo;

		const teamService = yield* TeamService;

		const id = yield* teamService.createTeam(authInfo.principal, payload.displayName);
		return id;
	}))
	.handle("deleteTeam", ({ request, path }) => Effect.gen(function*() {
		const authInfo = yield* AuthenticationInfo;

		const teamService = yield* TeamService;

		yield* teamService.deleteTeam(authInfo.principal, path.team);
	}))
	.handle("updateTeam", ({ request, path, payload}) => Effect.gen(function*() {
		const authInfo = yield* AuthenticationInfo;

		const teamService = yield* TeamService;

		yield* teamService.updateTeam(authInfo.principal, path.team, payload.displayName);
	}))
	.handle("assignUserToTeam", ({ request, path, payload}) => Effect.gen(function*() {
		const authInfo = yield* AuthenticationInfo;

		const teamService = yield* TeamService;

		yield* teamService.assignUserToTeam(authInfo.principal, path.team, payload.email);
	}))
	.handle("removeUserFromTeam", ({ request, path }) => Effect.gen(function*() {
		const authInfo = yield* AuthenticationInfo;

		const teamService = yield* TeamService;

		yield* teamService.removeUserFromTeam(authInfo.principal, path.team, path.user);
	}))
);

export default HttpApiBuilder.api(IsolatedApi).pipe(Layer.provide(identityGroupLive));