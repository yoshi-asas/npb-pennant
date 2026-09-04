import type { LeagueId, TeamId } from '../engine/types.ts';

/**
 * 1日ぶんの計算結果。scripts/snapshot.ts が書き出し、Astro のページがビルド時に読む。
 *
 * 過去日のファイルは書き換えない。そのまま「予測の当たり外れ」を後から検証できる。
 */

export interface TeamSnapshot {
	teamId: TeamId;
	rank: number;
	games: number;
	wins: number;
	losses: number;
	draws: number;
	pct: number;
	gamesBehind: number;
	remaining: number;
	runsScored: number;
	runsAllowed: number;

	/** 推定した実力（リーグ平均 .500 に対する勝率） */
	strength: number;
	pythagoreanPct: number;

	magicConventional: number | null;
	magicStrict: number | null;
	magicTarget: TeamId | null;
	magicLit: boolean;
	selfClinchPossible: boolean;
	selfClinchBlockers: TeamId[];
	alive: boolean;
	eliminationReason: 'unbeatable' | 'collision' | null;

	championProbability: number;
	playoffProbability: number;
	rankProbabilities: number[];
	finalWins: { p10: number; median: number; p90: number };
	/** その球団が優勝を決める日ごとの確率（全試行に対する割合） */
	clinchDates: { date: string; probability: number }[];
}

export interface ClinchDatePoint {
	date: string;
	probability: number;
	cumulative: number;
}

export interface LeagueSnapshot {
	league: LeagueId;
	standings: TeamSnapshot[];
	/** 残り直接対決数 [自軍][相手] */
	remainingHeadToHead: Record<string, Record<string, number>>;
	clinchDateDistribution: ClinchDatePoint[];
	/** 優勝決定日の中央値と80%区間 */
	clinchDateSummary: { p10: string; median: string; p90: string } | null;
	tiebreakDecidedRate: number;
	remainingFixtures: number;
	/** 中止で再編成日が未定のため最終盤に仮置きした試合数 */
	unscheduledFixtures: number;
	iterations: number;
	elapsedMs: number;
}

export interface Snapshot {
	generatedAt: string;
	season: number;
	/** 結果が確定している最後の試合日 */
	asOfDate: string;
	/** 消化済みの試合数 */
	playedGames: number;
	context: { homeWinRate: number; drawRate: number; sampleSize: number };
	strengthOptions: {
		pythagoreanExponent: number;
		pythagoreanWeight: number;
		shrinkageGames: number;
	};
	leagues: Record<LeagueId, LeagueSnapshot>;
}
