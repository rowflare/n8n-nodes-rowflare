import type {
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
} from 'n8n-workflow';
import { getTables, rowflareApiRequest } from './transport';

function matches(name: string, filter?: string): boolean {
	return !filter || name.toLowerCase().includes(filter.toLowerCase());
}

function currentBase(this: ILoadOptionsFunctions): string {
	return String(this.getCurrentNodeParameter('base', { extractValue: true }) ?? '');
}

function currentTable(this: ILoadOptionsFunctions): string {
	return String(this.getCurrentNodeParameter('table', { extractValue: true }) ?? '');
}

export async function searchBases(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const response = (await rowflareApiRequest.call(this, 'GET', '/bases')) as {
		bases: Array<{ id: string; name: string }>;
	};
	return {
		results: response.bases
			.filter((b) => matches(b.name, filter) || matches(b.id, filter))
			.map((b) => ({ name: b.name, value: b.id })),
	};
}

export async function searchTables(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const baseId = currentBase.call(this);
	if (!baseId) return { results: [] };
	const tables = await getTables.call(this, baseId);
	return {
		results: tables
			.filter((t) => matches(t.name, filter) || matches(t.id, filter))
			.map((t) => ({ name: t.name, value: t.id })),
	};
}

async function currentTableSchema(this: ILoadOptionsFunctions) {
	const baseId = currentBase.call(this);
	const table = currentTable.call(this);
	if (!baseId || !table) return undefined;
	const tables = await getTables.call(this, baseId);
	return tables.find((t) => t.id === table || t.name === table);
}

export async function getFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const schema = await currentTableSchema.call(this);
	if (!schema) return [];
	return schema.fields.map((f) => ({ name: f.name, value: f.name, description: f.type }));
}

export async function getViews(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const schema = await currentTableSchema.call(this);
	if (!schema) return [];
	return schema.views.map((v) => ({ name: v.name, value: v.id }));
}
