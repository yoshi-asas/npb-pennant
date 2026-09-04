import { remainingHeadToHead } from './standings.ts';
import { teamsOf } from './teams.ts';
import type { Game, LeagueId, SeasonShape, TeamId, TeamRecord } from './types.ts';

export interface RemainingFixture {
	date: string;
	home: TeamId;
	away: TeamId;
	/**
	 * false は「中止になったがまだ再編成日が決まっていない試合」を最終盤に仮置きしたもの。
	 * 優勝決定日の予測はこの仮置きぶんだけ後ろにずれる可能性がある。
	 */
	confirmed: boolean;
}

function pairKey(a: TeamId, b: TeamId): string {
	return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function addDays(date: string, days: number): string {
	const parsed = new Date(`${date}T00:00:00Z`);
	parsed.setUTCDate(parsed.getUTCDate() + days);
	return parsed.toISOString().slice(0, 10);
}

/**
 * 残りの対戦カードを組み立てる。
 *
 * 日程表に載っている未消化カードをそのまま使うだけでは、雨天中止でまだ再編成日が
 * 決まっていない試合が抜け落ちる。そこで「残り直接対決数（25 − 消化数）」を正とし、
 * 日程表に足りないぶんはシーズン最終盤に仮置きする。
 */
export function buildRemainingSchedule(
	games: readonly Game[],
	records: ReadonlyMap<TeamId, TeamRecord>,
	league: LeagueId,
	season: SeasonShape
): RemainingFixture[] {
	const teamIds = new Set(teamsOf(league).map((t) => t.id));

	const scheduled = games
		.filter(
			(game) => game.status === 'scheduled' && teamIds.has(game.home) && teamIds.has(game.away)
		)
		.map<RemainingFixture>((game) => ({
			date: game.date,
			home: game.home,
			away: game.away,
			confirmed: true
		}));

	// 日程表に載っているカードの数をペアごとに数える
	const scheduledPerPair = new Map<string, number>();
	const homeCount = new Map<string, number>();
	for (const fixture of scheduled) {
		const key = pairKey(fixture.home, fixture.away);
		scheduledPerPair.set(key, (scheduledPerPair.get(key) ?? 0) + 1);
		homeCount.set(`${key}#${fixture.home}`, (homeCount.get(`${key}#${fixture.home}`) ?? 0) + 1);
	}

	// 消化済みの本拠地開催数も数えておく（仮置き試合のホームを決めるため）
	for (const game of games) {
		if (game.status !== 'final') continue;
		if (!teamIds.has(game.home) || !teamIds.has(game.away)) continue;
		const key = pairKey(game.home, game.away);
		homeCount.set(`${key}#${game.home}`, (homeCount.get(`${key}#${game.home}`) ?? 0) + 1);
	}

	const lastDate = scheduled.reduce((latest, f) => (f.date > latest ? f.date : latest), '');
	const matrix = remainingHeadToHead(records, league, season);
	const extra: RemainingFixture[] = [];
	const seen = new Set<string>();

	for (const [teamA, row] of matrix) {
		for (const [teamB, remaining] of row) {
			const key = pairKey(teamA, teamB);
			if (seen.has(key)) continue;
			seen.add(key);

			const deficit = remaining - (scheduledPerPair.get(key) ?? 0);
			for (let i = 0; i < deficit; i++) {
				// 本拠地開催が少ないほうをホームにする
				const homeA = homeCount.get(`${key}#${teamA}`) ?? 0;
				const homeB = homeCount.get(`${key}#${teamB}`) ?? 0;
				const home = homeA <= homeB ? teamA : teamB;
				const away = home === teamA ? teamB : teamA;
				homeCount.set(`${key}#${home}`, (homeCount.get(`${key}#${home}`) ?? 0) + 1);
				extra.push({
					date: lastDate === '' ? '9999-12-31' : addDays(lastDate, 1 + Math.floor(i / 3)),
					home,
					away,
					confirmed: false
				});
			}
		}
	}

	return [...scheduled, ...extra].sort(
		(a, b) => a.date.localeCompare(b.date) || a.home.localeCompare(b.home)
	);
}

/** 日付の昇順ユニーク一覧 */
export function scheduleDates(fixtures: readonly RemainingFixture[]): string[] {
	return [...new Set(fixtures.map((f) => f.date))].sort();
}
