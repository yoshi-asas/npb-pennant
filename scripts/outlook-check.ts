import { readFile } from 'node:fs/promises';
import { formatPct, rankTeams, winPct } from '../src/engine/compare.ts';
import { leagueOutlook } from '../src/engine/elimination.ts';
import { buildLeagueState } from '../src/engine/leagueState.ts';
import { magicNumber } from '../src/engine/magic.ts';
import { buildRecords, gamesBehind, remainingGames } from '../src/engine/standings.ts';
import { getTeam, teamsOf } from '../src/engine/teams.ts';
import { SEASON_2026, type Game, type LeagueId } from '../src/engine/types.ts';

const year = process.argv[2] ?? '2026';
const games = JSON.parse(await readFile(`data/${year}/games.json`, 'utf8')) as Game[];
const records = buildRecords(games);

for (const league of ['central', 'pacific'] as LeagueId[]) {
	const state = buildLeagueState(records, league, SEASON_2026);
	const ranked = rankTeams(
		teamsOf(league).map((t) => records.get(t.id)!),
		league
	);
	const outlook = new Map(leagueOutlook(state).map((o) => [o.teamId, o]));
	const leader = ranked[0]!;

	console.log(`\n=== ${league} ===`);
	console.log('順 球団         試合 勝-敗-分   勝率   差  残  M(慣用) M(厳密) 自力 状況');
	for (const [index, record] of ranked.entries()) {
		const team = getTeam(record.teamId);
		const magic = magicNumber(state, record.teamId);
		const status = outlook.get(record.teamId)!;
		console.log(
			[
				String(index + 1).padStart(2),
				team.short.padEnd(6, '　'),
				String(record.games).padStart(4),
				`${record.wins}-${record.losses}-${record.draws}`.padStart(9),
				formatPct(winPct(record)).padStart(6),
				index === 0 ? '   -' : gamesBehind(leader, record).toFixed(1).padStart(5),
				String(remainingGames(record, SEASON_2026)).padStart(3),
				(magic.conventional === null ? '-' : `M${magic.conventional}`).padStart(7),
				(magic.strict === null ? '-' : String(magic.strict)).padStart(7),
				(magic.selfClinchPossible ? '○' : '×').padStart(4),
				status.alive ? '' : `敗退(${status.eliminationReason})`
			].join(' ')
		);
	}
}
