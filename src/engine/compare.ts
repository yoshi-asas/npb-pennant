import { getTeam } from './teams.ts';
import type { LeagueId, TeamId, TeamRecord, WinLoss } from './types.ts';

/**
 * このファイルが NPB の順位決定規定を実装する唯一の場所。
 * 順位表・マジック・敗退判定・シミュレーションは全てここを経由する。
 *
 * 勝率 = 勝 ÷ (勝 + 負)。引き分けは分母から除外される。
 *
 * 同率時のタイブレーク（2022年のセ・リーグ規定改定以降）:
 *   セ: ①勝率 ②勝利数 ③当該球団間の対戦勝率 ④リーグ内対戦成績（交流戦除く）の勝率 ⑤前年順位
 *   パ: ①勝率 ②当該球団間の対戦勝率 ③リーグ内対戦成績の勝率 ④前年順位
 *
 * セだけ「勝利数」が2番目に入るため、同じ成績でもリーグによって順位が入れ替わりうる。
 */

/** 勝率。決着がついた試合が0なら .000 とする（NPBの慣例） */
export function winPct(record: WinLoss): number {
	const decided = record.wins + record.losses;
	return decided === 0 ? 0 : record.wins / decided;
}

/** 勝率を .580 形式に整形する */
export function formatPct(pct: number): string {
	return pct.toFixed(3).replace(/^0/, '');
}

/**
 * 勝率の厳密比較。浮動小数の等価判定を避けるため、割り算せず交差積で比べる。
 * 戻り値 > 0 なら a が上位。
 */
export function compareWinPct(a: WinLoss, b: WinLoss): number {
	const decidedA = a.wins + a.losses;
	const decidedB = b.wins + b.losses;
	if (decidedA === 0 && decidedB === 0) return 0;
	if (decidedA === 0) return -Math.sign(b.wins);
	if (decidedB === 0) return Math.sign(a.wins);
	return a.wins * decidedB - b.wins * decidedA;
}

/** 「当該球団間」＝ まだ同率で並んでいる球団の集合。その中での対戦成績を集計する */
function headToHeadWithinGroup(team: TeamRecord, group: readonly TeamRecord[]): WinLoss {
	let wins = 0;
	let losses = 0;
	for (const other of group) {
		if (other.teamId === team.teamId) continue;
		const record = team.h2h[other.teamId];
		if (!record) continue;
		wins += record.wins;
		losses += record.losses;
	}
	return { wins, losses };
}

interface Criterion {
	name: string;
	/** 戻り値 > 0 なら a が上位。group はまだ同率で並んでいる球団の集合 */
	compare: (a: TeamRecord, b: TeamRecord, group: readonly TeamRecord[]) => number;
}

const BY_WIN_PCT: Criterion = {
	name: '勝率',
	compare: (a, b) => compareWinPct(a, b)
};

const BY_WINS: Criterion = {
	name: '勝利数',
	compare: (a, b) => a.wins - b.wins
};

const BY_HEAD_TO_HEAD: Criterion = {
	name: '当該球団間の対戦勝率',
	compare: (a, b, group) =>
		compareWinPct(headToHeadWithinGroup(a, group), headToHeadWithinGroup(b, group))
};

const BY_INTRA_LEAGUE_PCT: Criterion = {
	name: 'リーグ内対戦成績の勝率',
	compare: (a, b) =>
		compareWinPct(
			{ wins: a.leagueWins, losses: a.leagueLosses },
			{ wins: b.leagueWins, losses: b.leagueLosses }
		)
};

const BY_PREV_RANK: Criterion = {
	name: '前年順位',
	// 前年順位は小さいほど上位
	compare: (a, b) => getTeam(b.teamId).prevRank - getTeam(a.teamId).prevRank
};

const CRITERIA: Record<LeagueId, readonly Criterion[]> = {
	central: [BY_WIN_PCT, BY_WINS, BY_HEAD_TO_HEAD, BY_INTRA_LEAGUE_PCT, BY_PREV_RANK],
	pacific: [BY_WIN_PCT, BY_HEAD_TO_HEAD, BY_INTRA_LEAGUE_PCT, BY_PREV_RANK]
};

/**
 * リーグの順位を確定させる。
 *
 * 「当該球団間の対戦勝率」は3球団以上が並んだ場合に意味が変わる（並んでいる球団同士の
 * 総当たり成績になる）ため、単純な二者比較のソートではなく、上位条件で並んだ塊を
 * 段階的に細分化していく方式で実装する。
 */
export function rankTeams(records: readonly TeamRecord[], league: LeagueId): TeamRecord[] {
	return refine(records.slice(), CRITERIA[league]);
}

function refine(group: TeamRecord[], criteria: readonly Criterion[]): TeamRecord[] {
	if (group.length <= 1 || criteria.length === 0) return group;

	const [head, ...rest] = criteria;
	if (!head) return group;

	const sorted = group.slice().sort((a, b) => head.compare(b, a, group));

	const result: TeamRecord[] = [];
	let start = 0;
	while (start < sorted.length) {
		let end = start + 1;
		while (end < sorted.length) {
			const prev = sorted[start];
			const current = sorted[end];
			if (!prev || !current || head.compare(prev, current, group) !== 0) break;
			end++;
		}
		const tied = sorted.slice(start, end);
		result.push(...(tied.length === 1 ? tied : refine(tied, rest)));
		start = end;
	}
	return result;
}

/**
 * 最終成績 a が b より確実に上位か。
 *
 * 「勝敗数だけで決着がつくか」を問う。決着がつかない条件（当該球団間の対戦成績など）に
 * 持ち越される場合は false を返す。優勝確定・マジックの判定はこの厳しい側を使う。
 */
export function guaranteedAbove(a: WinLoss, b: WinLoss, league: LeagueId): boolean {
	const pct = compareWinPct(a, b);
	if (pct > 0) return true;
	if (pct < 0) return false;
	// 勝率が並んだ場合、セは次の条件が「勝利数」なのでここで決着しうる。
	// パは「当該球団間の対戦勝率」で、勝敗数だけでは決まらない。
	return league === 'central' && a.wins > b.wins;
}

/** 最終成績 a が b 以上になる可能性があるか（同率でタイブレークに勝つ余地を含む） */
export function possiblyAbove(a: WinLoss, b: WinLoss, league: LeagueId): boolean {
	return !guaranteedAbove(b, a, league);
}

/** 順位表の表示用。同順位は発生しない（規定上必ず単独順位が決まる） */
export function rankIndexOf(ranked: readonly TeamRecord[], teamId: TeamId): number {
	return ranked.findIndex((r) => r.teamId === teamId);
}
