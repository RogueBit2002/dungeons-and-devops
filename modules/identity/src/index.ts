import { Effect, Data, Context} from "effect";

import { Principal } from "@dndevops/library-identity";

import { InvalidPermissionsError } from "@dndevops/library-errors";

export class MissingUserError extends Data.TaggedError("MissingUserError")<{}> {}
export class MissingTeamError extends Data.TaggedError("MissingTeamError")<{}> {}
export class DuplicateUserError extends Data.TaggedError("DuplicateUserError")<{}> {}
export class DuplicateTeamError extends Data.TaggedError("DuplicationTeamTerror")<{}> {}

export class IdentityService extends Context.Tag("IdentityService")<
	IdentityService,
	{
		readonly sendRefreshToken: (email: string) => Effect.Effect<void, MissingUserError>
		readonly getAccessToken: (email: string) => Effect.Effect<string>

		readonly createUser: (p: Principal, email: string) => Effect.Effect<void, InvalidPermissionsError | DuplicateUserError>
		readonly deleteUser: (p: Principal, email: string) => Effect.Effect<void, InvalidPermissionsError | MissingUserError>
		readonly setUserLevel: (p: Principal, email: string, admin: boolean) => Effect.Effect<void, InvalidPermissionsError | MissingUserError>

		readonly getUsers: (p: Principal) => Effect.Effect<string[], InvalidPermissionsError>
		readonly createTeam: (p: Principal, id: string) => Effect.Effect<void, InvalidPermissionsError | DuplicateTeamError>
		readonly deleteTeam: (p: Principal, id: string) => Effect.Effect<void, InvalidPermissionsError | MissingTeamError>

		readonly assignUserToTeam: (p: Principal, user: string, team: string) => Effect.Effect<void, InvalidPermissionsError | MissingUserError | MissingTeamError>
		readonly removeUserFromTeam: (p: Principal, user: string, team: string) => Effect.Effect<void, InvalidPermissionsError | MissingUserError | MissingTeamError>
	}
>() {
	static readonly Live = IdentityService.of({
		sendRefreshToken: (email: string) => Effect.gen(function* () {
			return yield* Effect.fail(new MissingUserError());
		}),
		getAccessToken: function (email: string): Effect.Effect<string> {
			throw new Error("Function not implemented.");
		},
		createUser: (p: Principal, email: string) => Effect.gen(function* () {
			if(!p.isAdmin)
				return yield* Effect.fail(new InvalidPermissionsError());

			//const exists = yield* storage.exists(email)
			//if(exists)
			//    return yield* Effect.fail(new DuplicateUserError());

			//yield* await(?) storage.createUser(email);


		}),
		deleteUser: function (p: Principal, email: string) {
			throw new Error("Function not implemented.");
		},
		setUserLevel: function (p: Principal, email: string, admin: boolean) {
			throw new Error("Function not implemented.");
		},
		getUsers: (p: Principal) => Effect.gen(function*() {
			return [];
		}),
		createTeam: function (p: Principal, id: string) {
			throw new Error("Function not implemented.");
		},
		deleteTeam: function (p: Principal, id: string) {
			throw new Error("Function not implemented.");
		},
		assignUserToTeam: function (p: Principal, user: string, team: string) {
			throw new Error("Function not implemented.");
		},
		removeUserFromTeam: function (p: Principal, user: string, team: string) {
			throw new Error("Function not implemented.");
		}
	});
};