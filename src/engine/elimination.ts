import { guaranteedAbove, possiblyAbove } from './compare.ts';
import { currentOf, finalRecord, h2hOf, remainingOf, type LeagueState } from './leagueState.ts';
import { MaxFlow } from './maxflow.ts';
import type { LeagueId, TeamId, WinLoss } from './types.ts';

/**
 * 数学的敗退（優勝の可能性が完全に消えたか）の判定。
 *
 * 「自力優勝が不可能」とは違う。自力優勝の判定はライバルが全員同時に勝ち続けられる
 * 前提で見るが、実際にはライバル同士も潰し合うため、全員が勝ち続けることはできない。
 * これを正しく解くのが baseball elimination problem（Schwartz 1966）で、
 * 最大流／最小カットで厳密に解ける。
 *
 * 前提: 残り試合に引き分けは発生しない（ライバル同士の試合は必ずどちらかが勝つ）。
 */

/**
 * ライバル j が「対象チーム i を上回らずに済む」追加勝利数の上限。
 * 上限が負なら、j は何をしても i を上回るので i は敗退。
 */
function allowedWins(
	selfFinal: WinLoss,
	rivalCurrent: WinLoss,
	rivalRemaining: number,
	league: LeagueId
): number {
	// possiblyAbove は追加勝利数について単調減少なので、上から見て最初に成立する値を取る
	for (let wins = rivalRemaining; wins >= 0; wins--) {
		const rivalFinal = finalRecord(rivalCurrent, rivalRemaining, wins);
		if (possiblyAbove(selfFinal, rivalFinal, league)) return wins;
	}
	return -1;
}

export interface EliminationResult {
	/** 優勝の可能性が残っているか */
	alive: boolean;
	/** 単独で（他チームの結果に関わらず）上回れないライバル。alive=false の直接原因 */
	unbeatable: TeamId[];
	/**
	 * ライバル同士の潰し合いまで考慮した最大流が、必要な流量に届いたか。
	 * false なら「個別には抑えられるが全員同時には抑えられない」ことで敗退している。
	 */
	flowFeasible: boolean;
}

/**
 * 対象チームが残り全勝したうえで、他球団の結果をどう割り振っても1位になれないなら敗退。
 */
export function eliminationStatus(state: LeagueState, self: TeamId): EliminationResult {
	const selfRemaining = remainingOf(state, self);
	const selfFinal = finalRecord(currentOf(state, self), selfRemaining, selfRemaining);

	const rivals = state.teamIds.filter((id) => id !== self);
	const unbeatable: TeamId[] = [];
	const capacity = new Map<TeamId, number>();

	for (const rival of rivals) {
		const rivalRemaining = remainingOf(state, rival);
		const max = allowedWins(selfFinal, currentOf(state, rival), rivalRemaining, state.league);
		if (max < 0) {
			unbeatable.push(rival);
			continue;
		}
		// 対象チームは全勝するので、ライバルは直接対決分を必ず落とす。
		// ライバルが勝ち星を積めるのはライバル同士の試合だけ。
		capacity.set(rival, Math.min(max, rivalRemaining - h2hOf(state, self, rival)));
	}

	if (unbeatable.length > 0) {
		return { alive: false, unbeatable, flowFeasible: false };
	}

	// ライバル同士の残り試合を、誰の上限も超えないように割り振れるか
	const pairs: { a: TeamId; b: TeamId; games: number }[] = [];
	for (let i = 0; i < rivals.length; i++) {
		for (let j = i + 1; j < rivals.length; j++) {
			const a = rivals[i]!;
			const b = rivals[j]!;
			const games = h2hOf(state, a, b);
			if (games > 0) pairs.push({ a, b, games });
		}
	}

	const totalGames = pairs.reduce((sum, pair) => sum + pair.games, 0);
	if (totalGames === 0) {
		return { alive: true, unbeatable: [], flowFeasible: true };
	}

	const SOURCE = 0;
	const SINK = 1;
	const pairNode = new Map<string, number>();
	const teamNode = new Map<TeamId, number>();
	let next = 2;
	for (const pair of pairs) pairNode.set(`${pair.a}|${pair.b}`, next++);
	for (const rival of rivals) teamNode.set(rival, next++);

	const flow = new MaxFlow(next);
	for (const pair of pairs) {
		const node = pairNode.get(`${pair.a}|${pair.b}`)!;
		flow.addEdge(SOURCE, node, pair.games);
		flow.addEdge(node, teamNode.get(pair.a)!, pair.games);
		flow.addEdge(node, teamNode.get(pair.b)!, pair.games);
	}
	for (const rival of rivals) {
		flow.addEdge(teamNode.get(rival)!, SINK, capacity.get(rival) ?? 0);
	}

	const feasible = flow.run(SOURCE, SINK) === totalGames;
	return { alive: feasible, unbeatable: [], flowFeasible: feasible };
}

export interface TeamOutlook {
	teamId: TeamId;
	alive: boolean;
	/** 敗退の理由。'unbeatable' は単独で追い抜けない相手がいる、'collision' はライバル同士の潰し合いを考えても不可能 */
	eliminationReason: 'unbeatable' | 'collision' | null;
	unbeatable: TeamId[];
}

export function leagueOutlook(state: LeagueState): TeamOutlook[] {
	return state.teamIds.map((teamId) => {
		const result = eliminationStatus(state, teamId);
		return {
			teamId,
			alive: result.alive,
			eliminationReason: result.alive
				? null
				: result.unbeatable.length > 0
					? 'unbeatable'
					: 'collision',
			unbeatable: result.unbeatable
		};
	});
}

/** 現時点で確実に上位が決まっている関係かどうか（表示用の補助） */
export function alreadyDecided(a: WinLoss, b: WinLoss, league: LeagueId): boolean {
	return guaranteedAbove(a, b, league);
}
