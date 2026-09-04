/// <reference lib="webworker" />
import {
	DEFAULT_SIMULATION,
	fromSeed,
	simulate,
	type FixtureOverride,
	type PreparedSeason,
	type SeasonSeed,
	type SimulationResult
} from '../engine/simulate.ts';

/**
 * 「もしも」シミュレーター用のワーカー。
 * ビルド時にサイトへ焼き込んでいるのと同じ src/engine のコードをそのまま動かす。
 * 実装を二重に持たないことがこの構成の狙い。
 */

export type WorkerRequest =
	| { type: 'init'; id: number; league: string; seed: SeasonSeed }
	| { type: 'run'; id: number; league: string; overrides: FixtureOverride[]; iterations: number };

export type WorkerResponse =
	| { type: 'ready'; id: number; league: string }
	| { type: 'result'; id: number; league: string; result: SimulationResult }
	| { type: 'error'; id: number; message: string };

const prepared = new Map<string, PreparedSeason>();

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
	const message = event.data;
	try {
		if (message.type === 'init') {
			prepared.set(message.league, fromSeed(message.seed));
			post({ type: 'ready', id: message.id, league: message.league });
			return;
		}

		const season = prepared.get(message.league);
		if (!season) throw new Error(`${message.league} が初期化されていない`);

		const result = simulate(season, {
			...DEFAULT_SIMULATION,
			iterations: message.iterations,
			overrides: message.overrides
		});
		post({ type: 'result', id: message.id, league: message.league, result });
	} catch (error) {
		post({
			type: 'error',
			id: message.id,
			message: error instanceof Error ? error.message : String(error)
		});
	}
};

function post(response: WorkerResponse) {
	(self as unknown as Worker).postMessage(response);
}
