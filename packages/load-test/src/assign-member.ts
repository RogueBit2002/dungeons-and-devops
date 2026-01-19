import http from "k6/http";
import { sleep, check } from "k6";
import { randomBytes, createHash } from "k6/crypto"

export const options = {
	scenarios: {
		constant_request_rate: {
			executor: 'constant-arrival-rate',
			rate: 1000,           // 100 iterations per second
			timeUnit: '1s',      // the rate is per second
			duration: '30s',     // total test duration
			preAllocatedVUs: 200, // initial number of VUs
			maxVUs: 1000,         // maximum number of VUs
		},
	},
};

const token = __ENV.TOKEN;
const team = __ENV.TEAM;
export default function() {

	const headers = { 
			'Content-Type': 'application/json',
			"Authorization": `Bearer ${token}`
		};

	const h = createHash("sha1");
	h.update( randomBytes(16));

	const x = h.digest("hex");
	const res = http.post(`http://dndevops.laurens.me:8080/api/identity/teams/${team}/users`, JSON.stringify({
		"email": `${x}@${x}.com`
	}), { headers });

	check(res, { 'status is 2xx': (r) => r.status >= 200 && r.status <= 299});
}