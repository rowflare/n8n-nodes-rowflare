import type { INodeProperties } from 'n8n-workflow';

export const baseLocator: INodeProperties = {
	displayName: 'Base',
	name: 'base',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'The Rowflare base',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: { searchListMethod: 'searchBases', searchable: true },
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: 'appXXXXXXXXXXXXXXXX',
			validation: [
				{
					type: 'regex',
					properties: { regex: 'app[A-Za-z0-9]+', errorMessage: 'Not a valid base ID' },
				},
			],
		},
	],
};

export const tableLocator: INodeProperties = {
	displayName: 'Table',
	name: 'table',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'The table, by ID or by name',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: { searchListMethod: 'searchTables', searchable: true },
		},
		{
			displayName: 'By ID or Name',
			name: 'id',
			type: 'string',
			placeholder: 'tblXXXXXXXXXXXXXX or Tasks',
		},
	],
};
