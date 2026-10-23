import type { RowflareRecord } from './transport';

export interface PollState {
	/** Created time of the newest record already emitted (ISO string, millisecond precision). */
	lastCreatedTime?: string;
	/** IDs of the records emitted that share lastCreatedTime, so they are not emitted twice. */
	lastIds?: number[];
}

/** Builds the formula that selects records created at or after `since`. */
export function createdSinceFormula(since: string, extra?: string): string {
	const base = `NOT(IS_BEFORE(CREATED_TIME(), DATETIME_PARSE("${since}")))`;
	return extra ? `AND(${base}, ${extra})` : base;
}

/** Drops records already emitted and orders the rest from oldest to newest. */
export function newRecords(records: RowflareRecord[], state: PollState): RowflareRecord[] {
	const seen = new Set(state.lastIds ?? []);
	return records
		.filter((r) => !(r.createdTime === state.lastCreatedTime && seen.has(r.id)))
		.sort((a, b) => a.createdTime.localeCompare(b.createdTime) || a.id - b.id);
}

/** Moves the watermark to the newest emitted record. */
export function nextState(emitted: RowflareRecord[], state: PollState): PollState {
	if (!emitted.length) return state;
	const last = emitted[emitted.length - 1].createdTime;
	const sameAsBefore = last === state.lastCreatedTime ? (state.lastIds ?? []) : [];
	const ids = emitted.filter((r) => r.createdTime === last).map((r) => r.id);
	return { lastCreatedTime: last, lastIds: [...sameAsBefore, ...ids] };
}
