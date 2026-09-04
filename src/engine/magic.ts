import { guaranteedAbove } from './compare.ts';
import { currentOf, finalRecord, h2hOf, remainingOf, type LeagueState } from './leagueState.ts';
import type { LeagueId, TeamId, WinLoss } from './types.ts';

/**
 * 優勝確定・マジックナンバーの判定。
 *
 * 前提: 残り試合に引き分けは発生しないものとする。
 * 引き分けは勝率の分母から外れるため、ライバルにとっては「敗け」より有利に働く。
 * つまり引き分けを許すと優勝確定はここでの判定より遅くなりうる。
 * この前提は報道のマジックナンバーと同じで、計算方法ページに明記する。
 *
 * なぜ最大流が要らないか:
 * 「ライバル j が自分を上回れるか」は j が単独で全勝すれば達成できるので、
 * ライバル同士の潰し合いを考える必要がない。潰し合いの考慮が要るのは
 * 「j がリーグ1位になれるか」＝ 数学的敗退の判定のほう（elimination.ts）。
 */

/** 優勝確定の判定に必要な、ライバル1球団ぶんの情報 */
export interface RivalSnapshot {
	wins: number;
	losses: number;
	/** ライバルの残り試合数 */
	remaining: number;
	/** 対象チームとの残り直接対決数 */
	directRemaining: number;
}

/**
 * 対象チームが残りのうち selfWins 勝したとき、他の結果に関わらず全ライバルの上に立てるか。
 *
 * 対象チームの最終成績は最悪ケース（selfWins 勝、残りは全敗）で固定する。
 * ライバルは残りを全勝したいが、直接対決のうち対象チームが勝つぶんは勝てない。
 */
export function clinchedOverRivals(
	league: LeagueId,
	selfCurrent: WinLoss,
	selfRemaining: number,
	selfWins: number,
	rivals: readonly RivalSnapshot[]
): number[] {
	const selfFinal = finalRecord(selfCurrent, selfRemaining, selfWins);
	const selfLosses = selfRemaining - selfWins;
	const blockers: number[] = [];

	for (let index = 0; index < rivals.length; index++) {
		const rival = rivals[index]!;
		const forcedLosses = Math.max(0, rival.directRemaining - Math.max(0, selfLosses));
		const ceiling: WinLoss = {
			wins: rival.wins + rival.remaining - forcedLosses,
			losses: rival.losses + forcedLosses
		};
		if (!guaranteedAbove(selfFinal, ceiling, league)) blockers.push(index);
	}

	return blockers;
}

function rivalsOf(state: LeagueState, self: TeamId): { ids: TeamId[]; snapshots: RivalSnapshot[] } {
	const ids = state.teamIds.filter((id) => id !== self);
	const snapshots = ids.map<RivalSnapshot>((id) => {
		const current = currentOf(state, id);
		return {
			wins: current.wins,
			losses: current.losses,
			remaining: remainingOf(state, id),
			directRemaining: h2hOf(state, self, id)
		};
	});
	return { ids, snapshots };
}

export interface ClinchCheck {
	clinched: boolean;
	/** 優勝確定を妨げている（上回りうる）ライバル */
	blockers: TeamId[];
}

export function clinchesWith(state: LeagueState, self: TeamId, wins: number): ClinchCheck {
	const { ids, snapshots } = rivalsOf(state, self);
	const blockers = clinchedOverRivals(
		state.league,
		currentOf(state, self),
		remainingOf(state, self),
		wins,
		snapshots
	).map((index) => ids[index]!);

	return { clinched: blockers.length === 0, blockers };
}

export interface MagicNumber {
	/**
	 * 厳密マジック。優勝確定に必要な最小の勝ち数。
	 * 残り全勝しても確定しない（＝自力優勝が不可能）場合は null。
	 */
	strict: number | null;
	/**
	 * 報道で使われる慣用式 M = (ライバルの最大到達勝利数) − 自チーム勝利数 + 1。
	 * 勝利数だけで計算するため、引き分け数が違う相手とは厳密値とズレうる。
	 */
	conventional: number | null;
	/** 慣用式の計算対象になったライバル（最大到達勝利数が最も大きい球団） */
	conventionalTarget: TeamId | null;
	/** 自力優勝が可能か（残り全勝すれば必ず優勝できるか） */
	selfClinchPossible: boolean;
	/** 自力優勝を妨げているライバル */
	selfClinchBlockers: TeamId[];
}

export function magicNumber(state: LeagueState, self: TeamId): MagicNumber {
	const remaining = remainingOf(state, self);
	const current = currentOf(state, self);

	const selfCheck = clinchesWith(state, self, remaining);
	const selfClinchPossible = selfCheck.clinched;

	let strict: number | null = null;
	let conventional: number | null = null;
	let conventionalTarget: TeamId | null = null;

	if (selfClinchPossible) {
		// clinchesWith は勝ち数について単調なので、0 から順に見て最初に立つ値でよい
		for (let wins = 0; wins <= remaining; wins++) {
			if (clinchesWith(state, self, wins).clinched) {
				strict = wins;
				break;
			}
		}

		let bestCeiling = -1;
		for (const rival of state.teamIds) {
			if (rival === self) continue;
			const ceiling = currentOf(state, rival).wins + remainingOf(state, rival);
			if (ceiling > bestCeiling) {
				bestCeiling = ceiling;
				conventionalTarget = rival;
			}
		}
		conventional = Math.max(0, bestCeiling - current.wins + 1);
	}

	return {
		strict,
		conventional,
		conventionalTarget,
		selfClinchPossible,
		selfClinchBlockers: selfCheck.blockers
	};
}

/** 既に優勝が確定しているか（＝厳密マジックが 0） */
export function hasClinched(state: LeagueState, self: TeamId): boolean {
	return clinchesWith(state, self, 0).clinched;
}

/** リーグで優勝が確定している球団があれば返す */
export function clinchedChampion(state: LeagueState): TeamId | null {
	for (const teamId of state.teamIds) {
		if (hasClinched(state, teamId)) return teamId;
	}
	return null;
}

export interface LeagueMagic {
	teamId: TeamId;
	magic: MagicNumber;
	/**
	 * マジックが「点灯」しているか。
	 * NPB の慣例では、自チーム以外の全球団で自力優勝の可能性が消えたときに点灯する。
	 */
	lit: boolean;
}

export function leagueMagic(state: LeagueState): LeagueMagic[] {
	const magics = new Map<TeamId, MagicNumber>(
		state.teamIds.map((id) => [id, magicNumber(state, id)])
	);

	return state.teamIds.map((teamId) => {
		const magic = magics.get(teamId)!;
		const othersCannotSelfClinch = state.teamIds
			.filter((id) => id !== teamId)
			.every((id) => !magics.get(id)!.selfClinchPossible);

		return { teamId, magic, lit: magic.selfClinchPossible && othersCannotSelfClinch };
	});
}
