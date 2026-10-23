import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type JsonObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { baseLocator, tableLocator } from './shared/descriptions';
import { getFields, getViews, searchBases, searchTables } from './shared/methods';
import {
	getTables,
	recordsPath,
	rowflareApiRequest,
	rowflareListRecords,
	type Query,
} from './shared/transport';

const recordOps = ['create', 'delete', 'get', 'getAll', 'update'];
const writeOps = ['create', 'update'];

export class Rowflare implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Rowflare',
		name: 'rowflare',
		icon: { light: 'file:../../icons/rowflare.svg', dark: 'file:../../icons/rowflare.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Read and write records in Rowflare, the open-source Airtable alternative',
		defaults: {
			name: 'Rowflare',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'rowflareApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Base', value: 'base' },
					{ name: 'Record', value: 'record' },
					{ name: 'Table', value: 'table' },
				],
				default: 'record',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['base'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'List the bases the token can access',
						action: 'Get many bases',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['table'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'List the tables of a base with their fields and views',
						action: 'Get many tables',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['record'] } },
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Create a record',
						action: 'Create a record',
					},
					{
						name: 'Delete',
						value: 'delete',
						description: 'Delete a record',
						action: 'Delete a record',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get a record by ID',
						action: 'Get a record',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'List records, optionally filtered by a formula or a view',
						action: 'Get many records',
					},
					{
						name: 'Update',
						value: 'update',
						description: 'Update a record',
						action: 'Update a record',
					},
				],
				default: 'getAll',
			},
			{
				...baseLocator,
				displayOptions: { show: { resource: ['table', 'record'] } },
			},
			{
				...tableLocator,
				displayOptions: { show: { resource: ['record'] } },
			},
			{
				displayName: 'Record ID',
				name: 'recordId',
				type: 'string',
				required: true,
				default: '',
				placeholder: '17',
				description: 'ID of the record (an integer)',
				displayOptions: { show: { resource: ['record'], operation: ['delete', 'get', 'update'] } },
			},
			{
				displayName: 'Data to Send',
				name: 'dataMode',
				type: 'options',
				options: [
					{
						name: 'Auto-Map Input Data',
						value: 'autoMap',
						description: 'Use every key of the input item as a field name',
					},
					{
						name: 'Define Below',
						value: 'defineBelow',
						description: 'Pick fields and set their values',
					},
					{
						name: 'JSON',
						value: 'json',
						description: 'Send a JSON object of field names and values',
					},
				],
				default: 'defineBelow',
				displayOptions: { show: { resource: ['record'], operation: writeOps } },
			},
			{
				displayName: 'Fields',
				name: 'fieldsUi',
				placeholder: 'Add Field',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				default: {},
				displayOptions: {
					show: { resource: ['record'], operation: writeOps, dataMode: ['defineBelow'] },
				},
				options: [
					{
						displayName: 'Field',
						name: 'fieldValues',
						values: [
							{
								displayName: 'Field Name or ID',
								name: 'fieldName',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getFields',
									loadOptionsDependsOn: ['base.value', 'table.value'],
								},
								default: '',
								description:
									'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
							},
							{
								displayName: 'Field Value',
								name: 'fieldValue',
								type: 'string',
								default: '',
								description:
									'Value to write. Turn on Typecast to convert text to numbers, dates, select options and links.',
							},
						],
					},
				],
			},
			{
				displayName: 'Fields (JSON)',
				name: 'fieldsJson',
				type: 'json',
				default: '{\n  "Name": "New record"\n}',
				displayOptions: {
					show: { resource: ['record'], operation: writeOps, dataMode: ['json'] },
				},
				description: 'Object of field names (or field IDs) and values',
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				displayOptions: { show: { resource: ['record'], operation: ['getAll'] } },
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				description: 'Max number of results to return',
				displayOptions: { show: { resource: ['record'], operation: ['getAll'], returnAll: [false] } },
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { resource: ['record'], operation: ['getAll'] } },
				options: [
					{
						displayName: 'Fields Names or IDs',
						name: 'fields',
						type: 'multiOptions',
						typeOptions: {
							loadOptionsMethod: 'getFields',
							loadOptionsDependsOn: ['base.value', 'table.value'],
						},
						default: [],
						description:
							'Only return these fields. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Filter by Formula',
						name: 'filterByFormula',
						type: 'string',
						default: '',
						placeholder: 'AND({Status} = "Done", {Estimate} > 5)',
						description: 'Only return records for which this formula is truthy',
					},
					{
						displayName: 'Return Fields by Field ID',
						name: 'returnFieldsByFieldId',
						type: 'boolean',
						default: false,
						description: 'Whether to key fields by field ID instead of field name',
					},
					{
						displayName: 'Sort',
						name: 'sort',
						placeholder: 'Add Sort Rule',
						type: 'fixedCollection',
						typeOptions: { multipleValues: true },
						default: {},
						options: [
							{
								displayName: 'Rule',
								name: 'rules',
								values: [
									{
										displayName: 'Field Name or ID',
										name: 'field',
										type: 'options',
										typeOptions: {
											loadOptionsMethod: 'getFields',
											loadOptionsDependsOn: ['base.value', 'table.value'],
										},
										default: '',
										description:
											'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
									},
									{
										displayName: 'Direction',
										name: 'direction',
										type: 'options',
										options: [
											{ name: 'Ascending', value: 'asc' },
											{ name: 'Descending', value: 'desc' },
										],
										default: 'asc',
									},
								],
							},
						],
					},
					{
						displayName: 'View Name or ID',
						name: 'view',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getViews',
							loadOptionsDependsOn: ['base.value', 'table.value'],
						},
						default: '',
						description:
							'Apply the filters and sorts of this view. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { resource: ['record'], operation: writeOps } },
				options: [
					{
						displayName: 'Ignore Fields',
						name: 'ignoreFields',
						type: 'string',
						default: '',
						description:
							'Comma-separated keys of the input item to leave out when auto-mapping input data',
						displayOptions: { show: { '/dataMode': ['autoMap'] } },
					},
					{
						displayName: 'Replace All Fields',
						name: 'replace',
						type: 'boolean',
						default: false,
						description:
							'Whether to clear every writable field that is not sent (PUT) instead of leaving it unchanged (PATCH)',
						displayOptions: { show: { '/operation': ['update'] } },
					},
					{
						displayName: 'Typecast',
						name: 'typecast',
						type: 'boolean',
						default: false,
						description:
							'Whether to convert values: numeric strings to numbers, common date formats, unknown select options and linked records by primary field value',
					},
				],
			},
		],
	};

	methods = {
		listSearch: { searchBases, searchTables },
		loadOptions: { getFields, getViews },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let result: IDataObject | IDataObject[];
				if (resource === 'base') {
					const response = (await rowflareApiRequest.call(this, 'GET', '/bases')) as {
						bases: IDataObject[];
					};
					result = response.bases;
				} else if (resource === 'table') {
					const baseId = this.getNodeParameter('base', i, '', { extractValue: true }) as string;
					result = (await getTables.call(this, baseId)) as unknown as IDataObject[];
				} else if (resource === 'record' && recordOps.includes(operation)) {
					result = await executeRecord.call(this, operation, i, items[i].json);
				} else {
					throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}"`, {
						itemIndex: i,
					});
				}
				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(result),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
			// Bases and tables do not depend on the input item, so list them once.
			if (resource !== 'record') break;
		}
		return [returnData];
	}
}

async function executeRecord(
	this: IExecuteFunctions,
	operation: string,
	i: number,
	input: IDataObject,
): Promise<IDataObject | IDataObject[]> {
	const baseId = this.getNodeParameter('base', i, '', { extractValue: true }) as string;
	const table = this.getNodeParameter('table', i, '', { extractValue: true }) as string;

	if (operation === 'getAll') {
		const returnAll = this.getNodeParameter('returnAll', i) as boolean;
		const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
		const options = this.getNodeParameter('options', i, {}) as IDataObject;
		const qs: Query = {};
		if (options.filterByFormula) qs.filterByFormula = options.filterByFormula as string;
		if (options.view) qs.view = options.view as string;
		if (options.returnFieldsByFieldId) qs.returnFieldsByFieldId = 'true';
		const fields = options.fields as string[] | undefined;
		if (fields?.length) qs['fields[]'] = fields;
		const rules = ((options.sort as IDataObject | undefined)?.rules ?? []) as IDataObject[];
		rules.forEach((rule, n) => {
			qs[`sort[${n}][field]`] = rule.field as string;
			qs[`sort[${n}][direction]`] = rule.direction as string;
		});
		if (limit !== undefined) qs.maxRecords = limit;
		return (await rowflareListRecords.call(this, baseId, table, qs, limit)) as unknown as IDataObject[];
	}

	const recordId =
		operation === 'create' ? undefined : String(this.getNodeParameter('recordId', i)).trim();
	if (recordId !== undefined && !/^\d+$/.test(recordId)) {
		throw new NodeOperationError(this.getNode(), `Record ID must be an integer, got "${recordId}"`, {
			itemIndex: i,
		});
	}

	if (operation === 'get') {
		return rowflareApiRequest.call(this, 'GET', recordsPath(baseId, table, recordId));
	}
	if (operation === 'delete') {
		return rowflareApiRequest.call(this, 'DELETE', recordsPath(baseId, table, recordId));
	}

	const options = this.getNodeParameter('options', i, {}) as IDataObject;
	const fields = recordFields.call(this, i, input, options);
	const body: IDataObject = { fields };
	if (options.typecast) body.typecast = true;
	if (operation === 'create') {
		return rowflareApiRequest.call(this, 'POST', recordsPath(baseId, table), {}, body);
	}
	const method = options.replace ? 'PUT' : 'PATCH';
	return rowflareApiRequest.call(this, method, recordsPath(baseId, table, recordId), {}, body);
}

function recordFields(
	this: IExecuteFunctions,
	i: number,
	input: IDataObject,
	options: IDataObject,
): IDataObject {
	const mode = this.getNodeParameter('dataMode', i) as string;
	if (mode === 'autoMap') {
		const ignore = new Set(
			String(options.ignoreFields ?? '')
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean),
		);
		const fields: IDataObject = {};
		for (const [key, value] of Object.entries(input)) if (!ignore.has(key)) fields[key] = value;
		return fields;
	}
	if (mode === 'json') {
		const raw = this.getNodeParameter('fieldsJson', i) as string | IDataObject;
		let parsed: unknown = raw;
		if (typeof raw === 'string') {
			try {
				parsed = JSON.parse(raw);
			} catch {
				throw new NodeOperationError(this.getNode(), 'Fields (JSON) is not valid JSON', {
					itemIndex: i,
				});
			}
		}
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new NodeOperationError(this.getNode(), 'Fields (JSON) must be an object', {
				itemIndex: i,
			});
		}
		return parsed as IDataObject;
	}
	const ui = this.getNodeParameter('fieldsUi', i, {}) as IDataObject;
	const fields: IDataObject = {};
	for (const entry of (ui.fieldValues ?? []) as IDataObject[]) {
		if (entry.fieldName) fields[entry.fieldName as string] = entry.fieldValue;
	}
	return fields;
}
