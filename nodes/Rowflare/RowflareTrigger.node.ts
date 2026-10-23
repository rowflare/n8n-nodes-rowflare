import {
	NodeConnectionTypes,
	type IDataObject,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type IPollFunctions,
} from 'n8n-workflow';
import { baseLocator, tableLocator } from './shared/descriptions';
import { getViews, searchBases, searchTables } from './shared/methods';
import { createdSinceFormula, newRecords, nextState, type PollState } from './shared/poll';
import { rowflareListRecords, type Query } from './shared/transport';

export class RowflareTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Rowflare Trigger',
		name: 'rowflareTrigger',
		icon: { light: 'file:../../icons/rowflare.svg', dark: 'file:../../icons/rowflare.dark.svg' },
		group: ['trigger'],
		version: 1,
		description: 'Starts the workflow when a record is created in a Rowflare table',
		subtitle: '=New records',
		defaults: {
			name: 'Rowflare Trigger',
		},
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'rowflareApi',
				required: true,
			},
		],
		properties: [
			{
				displayName:
					'Polls the table and emits records created since the last poll, oldest first. Records that existed when the workflow was activated are not emitted.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			baseLocator,
			tableLocator,
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Additional Formula',
						name: 'filterByFormula',
						type: 'string',
						default: '',
						placeholder: '{Status} = "Review"',
						description: 'Only emit new records for which this formula is also truthy',
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
							'Only emit new records that are visible in this view. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
		],
	};

	methods = {
		listSearch: { searchBases, searchTables },
		loadOptions: { getViews },
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const baseId = this.getNodeParameter('base', '', { extractValue: true }) as string;
		const table = this.getNodeParameter('table', '', { extractValue: true }) as string;
		const options = this.getNodeParameter('options', {}) as IDataObject;
		const staticData = this.getWorkflowStaticData('node') as PollState;
		const extra = String(options.filterByFormula ?? '').trim() || undefined;
		const qs: Query = {};
		if (options.view) qs.view = options.view as string;

		if (this.getMode() === 'manual') {
			// While building the workflow, show the newest matching record as sample data.
			if (extra) qs.filterByFormula = extra;
			const records = await rowflareListRecords.call(this, baseId, table, qs);
			const newest = newRecords(records, {}).pop();
			return newest ? [this.helpers.returnJsonArray([newest as unknown as IDataObject])] : null;
		}

		if (!staticData.lastCreatedTime) {
			// First activation: start from the newest existing record so that only later records are emitted.
			const records = await rowflareListRecords.call(this, baseId, table, qs);
			const state = nextState(newRecords(records, {}), {});
			staticData.lastCreatedTime = state.lastCreatedTime ?? new Date().toISOString();
			staticData.lastIds = state.lastIds ?? [];
			return null;
		}

		qs.filterByFormula = createdSinceFormula(staticData.lastCreatedTime, extra);
		const emitted = newRecords(await rowflareListRecords.call(this, baseId, table, qs), staticData);
		const state = nextState(emitted, staticData);
		staticData.lastCreatedTime = state.lastCreatedTime;
		staticData.lastIds = state.lastIds;
		if (!emitted.length) return null;
		return [this.helpers.returnJsonArray(emitted as unknown as IDataObject[])];
	}
}
