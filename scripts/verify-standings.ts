/**
 * 復元した順位表を NPB 公式（/bis/<year>/stats/std_c.html, std_p.html）と突き合わせる。
 *
 *   npx tsx scripts/verify-standings.ts [year]
 *
 * 試合数・勝敗分・対戦相手ごとの成績・交流戦成績まで比較し、1つでもズレたら
 * 終了コード1で落ちる。games.json のパースが壊れていないことの担保。
 */
import { load } from 'cheerio';
import { readFile } from 'node:fs/promises';
import { buildRecords } from '../src/engine/standings.ts';
import { TEAMS, TEAM_BY_ID, getTeam } from '../src/engine/teams.ts';
import type { Game, LeagueId, TeamId, TeamRecord } from '../src/engine/types.ts';

const YEAR = process.argv[2] ?? '2026';

/** 公式順位表の列見出し「対神」などを球団IDに対応づける */
const COLUMN_TO_TEAM: Record<string, TeamId> = {
	対神: 't',
	対巨: 'g',
	対デ: 'db',
	対ヤ: 's',
	対広: 'c',
	対中: 'd',
	対ソ: 'h',
	対西: 'l',
	対日: 'f',
	対オ: 'b',
	対ロ: 'm',
	対楽: 'e'
};

interface OfficialRow {
	teamId: TeamId;
	games: number;
	wins: number;
	losses: number;
	draws: number;
	/** 対戦相手ごとの 勝-敗(分) */
	h2h: Map<TeamId, { wins: number; losses: number; draws: number }>;
	interleague: { wins: number; losses: number; draws: number } | null;
}

function text(value: string): string {
	return value.replace(/ /g, ' ').replace(/　/g, '').replace(/\s+/g, '').trim();
}

/** "16-7" や "9-8(1)" を読む。"***" は自分自身の列 */
function parseSplit(raw: string): { wins: number; losses: number; draws: number } | null {
	const value = text(raw);
	const match = /^(\d+)-(\d+)(?:\((\d+)\))?$/.exec(value);
	if (!match) return null;
	return {
		wins: Number(match[1]),
		losses: Number(match[2]),
		draws: match[3] ? Number(match[3]) : 0
	};
}

function parseOfficial(html: string): OfficialRow[] {
	const $ = load(html);
	const table = $('table.tablefix2').first();
	const headers = table
		.find('thead th')
		.toArray()
		.map((th) => text($(th).text()));

	const rows: OfficialRow[] = [];
	table.find('tbody tr').each((_, tr) => {
		const cells = $(tr)
			.find('td, th')
			.toArray()
			.map((cell) => text($(cell).text()));
		if (cells.length < headers.length) return;

		const name = cells[0] ?? '';
		const team = TEAMS.find((t) => t.name === name);
		if (!team) return;

		const pick = (label: string): string => {
			const index = headers.indexOf(label);
			return index >= 0 ? (cells[index] ?? '') : '';
		};

		const h2h = new Map<TeamId, { wins: number; losses: number; draws: number }>();
		for (const [label, opponentId] of Object.entries(COLUMN_TO_TEAM)) {
			const index = headers.indexOf(label);
			if (index < 0) continue;
			const split = parseSplit(cells[index] ?? '');
			if (split) h2h.set(opponentId, split);
		}

		rows.push({
			teamId: team.id,
			games: Number(pick('試合')),
			wins: Number(pick('勝利')),
			losses: Number(pick('敗北')),
			draws: Number(pick('引分')),
			h2h,
			interleague: parseSplit(pick('交流戦'))
		});
	});
	return rows;
}

function compareRow(official: OfficialRow, mine: TeamRecord, problems: string[]) {
	const label = getTeam(official.teamId).short;
	const check = (field: string, expected: number, actual: number) => {
		if (expected !== actual) {
			problems.push(`${label} ${field}: 公式=${expected} / 計算=${actual}`);
		}
	};

	check('試合', official.games, mine.games);
	check('勝', official.wins, mine.wins);
	check('敗', official.losses, mine.losses);
	check('分', official.draws, mine.draws);

	for (const [opponentId, expected] of official.h2h) {
		const actual = mine.h2h[opponentId] ?? { wins: 0, losses: 0, draws: 0 };
		const expectedText = `${expected.wins}-${expected.losses}-${expected.draws}`;
		const actualText = `${actual.wins}-${actual.losses}-${actual.draws}`;
		if (expectedText !== actualText) {
			problems.push(
				`${label} 対${getTeam(opponentId).short}: 公式=${expectedText} / 計算=${actualText}`
			);
		}
	}

	if (official.interleague) {
		const interleagueWins = mine.wins - mine.leagueWins;
		const interleagueLosses = mine.losses - mine.leagueLosses;
		const interleagueDraws = mine.draws - mine.leagueDraws;
		const expectedText = `${official.interleague.wins}-${official.interleague.losses}-${official.interleague.draws}`;
		const actualText = `${interleagueWins}-${interleagueLosses}-${interleagueDraws}`;
		if (expectedText !== actualText) {
			problems.push(`${label} 交流戦: 公式=${expectedText} / 計算=${actualText}`);
		}
	}
}

async function main() {
	const games = JSON.parse(await readFile(`data/${YEAR}/games.json`, 'utf8')) as Game[];
	const records = buildRecords(games);
	const problems: string[] = [];
	let checked = 0;

	for (const [league, page] of [
		['central', 'std_c'],
		['pacific', 'std_p']
	] as [LeagueId, string][]) {
		const url = `https://npb.jp/bis/${YEAR}/stats/${page}.html`;
		const response = await fetch(url, { headers: { 'user-agent': 'npb-pennant/0.1 verify' } });
		if (!response.ok) throw new Error(`${url} が ${response.status} を返した`);
		const rows = parseOfficial(await response.text());

		if (rows.length !== 6) {
			problems.push(`${league}: 公式順位表から6球団読めなかった (${rows.length}件)`);
			continue;
		}
		for (const row of rows) {
			const mine = records.get(row.teamId);
			if (!mine) {
				problems.push(`${row.teamId} の計算結果がない`);
				continue;
			}
			compareRow(row, mine, problems);
			checked++;
		}
	}

	if (problems.length > 0) {
		console.error(`不一致 ${problems.length}件:`);
		for (const problem of problems) console.error(`  - ${problem}`);
		process.exit(1);
	}
	console.log(`${checked}球団すべてが NPB 公式順位表と一致（試合数・勝敗分・対戦成績・交流戦）`);
	console.log(`未知の球団ID: ${[...TEAM_BY_ID.keys()].length === 12 ? 'なし' : 'あり'}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
