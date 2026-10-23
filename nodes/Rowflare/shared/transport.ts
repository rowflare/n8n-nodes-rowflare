import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IPollFunctions,
} from 'n8n-workflow';

export type RowflareContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

/** Query values; arrays are sent as repeated keys, for example fields[]=A&fields[]=B. */
export type Query = Record<string, string | number | boolean | string[] | undefined>;

export interface RowflareRecord {
	id: number;
	createdTime: string;
	fields: IDataObject;
}

export interface RowflareField {
	id: string;
	name: string;
	type: string;
}

export interface RowflareTable {
	id: string;
	name: string;
	primaryFieldId: string;
	fields: RowflareField[];
	views: Array<{ id: string; name: string; type: string }>;
}

/** Builds the query string by hand so that bracketed keys keep the shape the Rowflare API expects. */
export function buildQuery(qs: Query): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(qs)) {
		if (value === undefined || value === '') continue;
		const values = Array.isArray(value) ? value : [String(value)];
		for (const v of values) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
	}
	return parts.length ? `?${parts.join('&')}` : '';
}

export async function rowflareApiRequest(
	this: RowflareContext,
	method: IHttpRequestMethods,
	path: string,
	qs: Query = {},
	body?: IDataObject,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
	const credentials = await this.getCredentials('rowflareApi');
	const baseUrl = String(credentials.baseUrl || 'https://app.rowflare.com').replace(/\/+$/, '');
	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}/api/v1${path}${buildQuery(qs)}`,
		headers: { Accept: 'application/json' },
		json: true,
	};
	if (body !== undefined) options.body = body;
	return this.helpers.httpRequestWithAuthentication.call(this, 'rowflareApi', options);
}

/** Fetches every page of a record list, stopping once `limit` records are collected. */
export async function rowflareListRecords(
	this: RowflareContext,
	baseId: string,
	table: string,
	qs: Query,
	limit?: number,
): Promise<RowflareRecord[]> {
	const records: RowflareRecord[] = [];
	let offset: string | undefined;
	do {
		const pageSize = limit === undefined ? 100 : Math.min(100, limit - records.length);
		const response = (await rowflareApiRequest.call(this, 'GET', recordsPath(baseId, table), {
			...qs,
			pageSize,
			offset,
		})) as { records: RowflareRecord[]; offset?: string };
		records.push(...response.records);
		offset = response.offset;
	} while (offset !== undefined && (limit === undefined || records.length < limit));
	return limit === undefined ? records : records.slice(0, limit);
}

export function recordsPath(baseId: string, table: string, recordId?: string | number): string {
	const path = `/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`;
	return recordId === undefined ? path : `${path}/${encodeURIComponent(String(recordId))}`;
}

export async function getTables(this: RowflareContext, baseId: string): Promise<RowflareTable[]> {
	const response = (await rowflareApiRequest.call(
		this,
		'GET',
		`/bases/${encodeURIComponent(baseId)}/tables`,
	)) as { tables: RowflareTable[] };
	return response.tables;
}
