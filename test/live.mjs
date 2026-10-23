// Live test: runs the built nodes against a real Rowflare instance.
// The n8n execution context is replaced by a small stand-in whose HTTP helper performs real requests,
// applying the credential's `authenticate` block the way n8n does (Authorization: Bearer <token>).
//
// Usage: ROWFLARE_URL=http://127.0.0.1:28787 ROWFLARE_TOKEN=rf_... ROWFLARE_BASE=app... npm run test:live
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
import https from 'node:https';

function send(method, target, headers, body) {
	const payload = body === undefined ? undefined : JSON.stringify(body);
	const lib = target.startsWith('https:') ? https : http;
	return new Promise((resolve, reject) => {
		const req = lib.request(target, { method, headers, agent: false, timeout: 180000 }, (res) => {
			const chunks = [];
			res.on('data', (c) => chunks.push(c));
			res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
		});
		req.on('timeout', () => req.destroy(new Error('timeout')));
		req.on('error', reject);
		if (payload !== undefined) req.write(payload);
		req.end();
	});
}

const require = createRequire(import.meta.url);
const { Rowflare } = require('../dist/nodes/Rowflare/Rowflare.node.js');
const { RowflareTrigger } = require('../dist/nodes/Rowflare/RowflareTrigger.node.js');
const { RowflareApi } = require('../dist/credentials/RowflareApi.credentials.js');

const url = process.env.ROWFLARE_URL;
const token = process.env.ROWFLARE_TOKEN;
const baseId = process.env.ROWFLARE_BASE;
if (!url || !token || !baseId) throw new Error('Set ROWFLARE_URL, ROWFLARE_TOKEN and ROWFLARE_BASE');

const credentials = { apiToken: token, baseUrl: `${url}/` };
const credentialType = new RowflareApi();
let requests = 0;

async function httpRequestWithAuthentication(type, options) {
	assert.equal(type, 'rowflareApi');
	requests++;
	const auth = credentialType.authenticate.properties.headers.Authorization;
	assert.equal(auth, '=Bearer {{$credentials.apiToken}}');
	const headers = { ...options.headers, Authorization: `Bearer ${credentials.apiToken}` };
	if (options.body !== undefined) headers['Content-Type'] = 'application/json';
	// One connection per request: the machine running these tests was heavily loaded and reused
	// keep-alive sockets were closed by the server mid-request.
	const res = await send(options.method, options.url, headers, options.body);
	const text = res.text;
	const data = text ? JSON.parse(text) : undefined;
	if (res.status >= 400) {
		const err = new Error(`Request failed with status code ${res.status}: ${text}`);
		err.httpCode = String(res.status);
		throw err;
	}
	return data;
}

function getParam(params, name, fallback, opts) {
	let v = name in params ? params[name] : fallback;
	if (opts?.extractValue && v && typeof v === 'object' && '__rl' in v) v = v.value;
	return v;
}

function executeContext(params, items = [{ json: {} }], continueOnFail = false) {
	return {
		getInputData: () => items,
		getNodeParameter: (name, _i, fallback, opts) => getParam(params, name, fallback, opts),
		getCredentials: async () => credentials,
		getNode: () => ({ name: 'Rowflare', type: 'n8n-nodes-rowflare.rowflare', typeVersion: 1, parameters: {} }),
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication,
			returnJsonArray: (d) => (Array.isArray(d) ? d : [d]).map((json) => ({ json })),
			constructExecutionMetaData: (data, { itemData }) => data.map((d) => ({ ...d, pairedItem: itemData })),
		},
	};
}

function loadOptionsContext(params) {
	return {
		getCurrentNodeParameter: (name, opts) => getParam(params, name, undefined, opts),
		getCredentials: async () => credentials,
		helpers: { httpRequestWithAuthentication },
	};
}

function pollContext(params, staticData, mode = 'trigger') {
	return {
		getNodeParameter: (name, fallback, opts) => getParam(params, name, fallback, opts),
		getWorkflowStaticData: () => staticData,
		getMode: () => mode,
		getCredentials: async () => credentials,
		helpers: {
			httpRequestWithAuthentication,
			returnJsonArray: (d) => d.map((json) => ({ json })),
		},
	};
}

const rl = (value, mode = 'id') => ({ __rl: true, mode, value });
const node = new Rowflare();
const run = async (params, items, continueOnFail) =>
	(await node.execute.call(executeContext(params, items, continueOnFail)))[0].map((x) => x.json);

let passed = 0;
async function test(name, fn) {
	await fn();
	passed++;
	console.log(`PASS ${name}`);
}

const table = 'Tasks';
const created = [];

// Remove records left behind by an interrupted earlier run, so the assertions below see a known state.
{
	const leftovers = await httpRequestWithAuthentication('rowflareApi', {
		method: 'GET',
		url: `${url}/api/v1/${baseId}/${table}?filterByFormula=${encodeURIComponent('OR(SEARCH("n8n ", {Name}), SEARCH("trigger ", {Name}), {Name} = "small", {Name} = "big")')}`,
		headers: {},
	});
	for (const r of leftovers.records) {
		await httpRequestWithAuthentication('rowflareApi', { method: 'DELETE', url: `${url}/api/v1/${baseId}/${table}/${r.id}`, headers: {} });
	}
	if (leftovers.records.length) console.log(`cleaned up ${leftovers.records.length} records from an earlier run`);
}

await test('credential test request points at /api/v1/bases', async () => {
	assert.equal(credentialType.test.request.url, '/api/v1/bases');
	assert.equal(credentialType.properties.find((p) => p.name === 'baseUrl').default, 'https://app.rowflare.com');
});

await test('base: get many', async () => {
	const out = await run({ resource: 'base', operation: 'getAll' }, [{ json: {} }, { json: {} }]);
	assert.ok(out.some((b) => b.id === baseId), 'test base is listed');
	assert.equal(out.length, new Set(out.map((b) => b.id)).size, 'listed once even with two input items');
});

await test('table: get many returns fields and views', async () => {
	const out = await run({ resource: 'table', operation: 'getAll', base: rl(baseId) });
	const tasks = out.find((t) => t.name === table);
	assert.ok(tasks, 'Tasks table present');
	assert.ok(tasks.fields.some((f) => f.name === 'Estimate' && f.type === 'number'));
	assert.ok(Array.isArray(tasks.views));
});

await test('listSearch and loadOptions', async () => {
	const bases = await node.methods.listSearch.searchBases.call(loadOptionsContext({}), '');
	assert.ok(bases.results.some((b) => b.value === baseId));
	const tables = await node.methods.listSearch.searchTables.call(loadOptionsContext({ base: rl(baseId) }), 'tas');
	assert.deepEqual(tables.results.map((t) => t.name), ['Tasks']);
	const fields = await node.methods.loadOptions.getFields.call(loadOptionsContext({ base: rl(baseId), table: rl(table) }));
	assert.ok(fields.some((f) => f.value === 'Name'));
	const views = await node.methods.loadOptions.getViews.call(loadOptionsContext({ base: rl(baseId), table: rl(tables.results[0].value) }));
	assert.ok(views.length >= 1);
});

await test('record: create (define below, typecast)', async () => {
	const out = await run({
		resource: 'record', operation: 'create', base: rl(baseId), table: rl(table), dataMode: 'defineBelow',
		fieldsUi: { fieldValues: [{ fieldName: 'Name', fieldValue: 'n8n define-below' }, { fieldName: 'Estimate', fieldValue: '3' }] },
		options: { typecast: true },
	});
	assert.equal(out.length, 1);
	assert.equal(out[0].fields.Name, 'n8n define-below');
	assert.equal(out[0].fields.Estimate, 3, 'typecast turned "3" into a number');
	created.push(out[0].id);
});

await test('record: create (auto-map input, two items, ignore fields)', async () => {
	const out = await run(
		{ resource: 'record', operation: 'create', base: rl(baseId), table: rl(table), dataMode: 'autoMap', options: { ignoreFields: 'skip' } },
		[{ json: { Name: 'n8n auto-map 1', Estimate: 5, skip: 'x' } }, { json: { Name: 'n8n auto-map 2', Estimate: 8, skip: 'y' } }],
	);
	assert.deepEqual(out.map((r) => r.fields.Name), ['n8n auto-map 1', 'n8n auto-map 2']);
	created.push(...out.map((r) => r.id));
});

await test('record: create (JSON)', async () => {
	const out = await run({
		resource: 'record', operation: 'create', base: rl(baseId), table: rl(table, 'list'), dataMode: 'json',
		fieldsJson: '{"Name": "n8n json", "Estimate": 13, "Notes": "keep me"}', options: {},
	});
	assert.equal(out[0].fields.Estimate, 13);
	created.push(out[0].id);
});

await test('record: get', async () => {
	// An expression such as {{ $json.id }} yields a number, not a string.
	const out = await run({ resource: 'record', operation: 'get', base: rl(baseId), table: rl(table), recordId: created[3] });
	assert.equal(out[0].id, created[3]);
	assert.equal(out[0].fields.Notes, 'keep me');
});

await test('record: update (PATCH keeps other fields)', async () => {
	const out = await run({
		resource: 'record', operation: 'update', base: rl(baseId), table: rl(table), recordId: String(created[3]), dataMode: 'json',
		fieldsJson: { Estimate: 21 }, options: {},
	});
	assert.equal(out[0].fields.Estimate, 21);
	assert.equal(out[0].fields.Notes, 'keep me');
});

await test('record: update (replace all fields uses PUT)', async () => {
	const out = await run({
		resource: 'record', operation: 'update', base: rl(baseId), table: rl(table), recordId: String(created[3]), dataMode: 'json',
		fieldsJson: '{"Name": "n8n replaced"}', options: { replace: true },
	});
	assert.equal(out[0].fields.Name, 'n8n replaced');
	assert.equal(out[0].fields.Notes, undefined, 'PUT cleared Notes');
});

await test('record: get many with formula, sort, fields, limit', async () => {
	const out = await run({
		resource: 'record', operation: 'getAll', base: rl(baseId), table: rl(table), returnAll: false, limit: 2,
		options: {
			filterByFormula: 'SEARCH("n8n auto-map", {Name})',
			sort: { rules: [{ field: 'Estimate', direction: 'desc' }] },
			fields: ['Name', 'Estimate'],
		},
	});
	assert.deepEqual(out.map((r) => r.fields.Name), ['n8n auto-map 2', 'n8n auto-map 1']);
	assert.deepEqual(Object.keys(out[0].fields).sort(), ['Estimate', 'Name']);
});

await test('record: get many, return all pages (more than 100 records)', async () => {
	const out = await run({ resource: 'record', operation: 'getAll', base: rl(baseId), table: rl(table), returnAll: true, options: { fields: ['Name'] } });
	assert.ok(out.length > 100, `got ${out.length}`);
	assert.equal(out.length, new Set(out.map((r) => r.id)).size, 'no duplicates across pages');
});

await test('record: get many with limit across pages', async () => {
	const out = await run({ resource: 'record', operation: 'getAll', base: rl(baseId), table: rl(table), returnAll: false, limit: 150, options: {} });
	assert.equal(out.length, 150);
});

await test('record: get many with view and returnFieldsByFieldId', async () => {
	const views = await node.methods.loadOptions.getViews.call(loadOptionsContext({ base: rl(baseId), table: rl(table) }));
	const out = await run({
		resource: 'record', operation: 'getAll', base: rl(baseId), table: rl(table), returnAll: false, limit: 1,
		options: { view: views[0].value, returnFieldsByFieldId: true },
	});
	assert.ok(Object.keys(out[0].fields).every((k) => k.startsWith('fld')));
});

await test('errors: bad record ID, unknown table, continueOnFail', async () => {
	await assert.rejects(run({ resource: 'record', operation: 'get', base: rl(baseId), table: rl(table), recordId: 'abc' }), /must be an integer/);
	await assert.rejects(run({ resource: 'record', operation: 'get', base: rl(baseId), table: rl('NoSuchTable'), recordId: '1' }), (e) => e.constructor.name === 'NodeApiError' && e.httpCode === '404');
	const out = await run({ resource: 'record', operation: 'get', base: rl(baseId), table: rl(table), recordId: '99999999' }, undefined, true);
	assert.match(out[0].error, /404/);
});

await test('trigger: manual mode returns the newest record', async () => {
	const trigger = new RowflareTrigger();
	const out = await trigger.poll.call(pollContext({ base: rl(baseId), table: rl(table), options: {} }, {}, 'manual'));
	assert.equal(out[0].length, 1);
	assert.equal(out[0][0].json.id, Math.max(...created));
});

await test('trigger: first poll sets the watermark, later polls emit only new records once', async () => {
	const trigger = new RowflareTrigger();
	const state = {};
	const params = { base: rl(baseId), table: rl(table), options: {} };
	assert.equal(await trigger.poll.call(pollContext(params, state)), null, 'first activation emits nothing');
	assert.ok(state.lastCreatedTime);
	assert.equal(await trigger.poll.call(pollContext(params, state)), null, 'nothing new yet');
	const a = await run({ resource: 'record', operation: 'create', base: rl(baseId), table: rl(table), dataMode: 'json', fieldsJson: '{"Name": "trigger A"}', options: {} });
	const b = await run({ resource: 'record', operation: 'create', base: rl(baseId), table: rl(table), dataMode: 'json', fieldsJson: '{"Name": "trigger B"}', options: {} });
	created.push(a[0].id, b[0].id);
	const out = await trigger.poll.call(pollContext(params, state));
	assert.deepEqual(out[0].map((x) => x.json.fields.Name), ['trigger A', 'trigger B']);
	assert.equal(await trigger.poll.call(pollContext(params, state)), null, 'not emitted twice');
});

await test('trigger: additional formula filters new records', async () => {
	const trigger = new RowflareTrigger();
	const state = {};
	const params = { base: rl(baseId), table: rl(table), options: { filterByFormula: '{Estimate} > 10' } };
	await trigger.poll.call(pollContext(params, state));
	const c1 = await run({ resource: 'record', operation: 'create', base: rl(baseId), table: rl(table), dataMode: 'json', fieldsJson: '{"Name": "small", "Estimate": 1}', options: {} });
	const c2 = await run({ resource: 'record', operation: 'create', base: rl(baseId), table: rl(table), dataMode: 'json', fieldsJson: '{"Name": "big", "Estimate": 50}', options: {} });
	created.push(c1[0].id, c2[0].id);
	const out = await trigger.poll.call(pollContext(params, state));
	assert.deepEqual(out[0].map((x) => x.json.fields.Name), ['big']);
});

await test('record: delete', async () => {
	for (const id of created) {
		const out = await run({ resource: 'record', operation: 'delete', base: rl(baseId), table: rl(table), recordId: String(id) });
		assert.deepEqual(out[0], { id, deleted: true });
	}
	const out = await run({ resource: 'record', operation: 'get', base: rl(baseId), table: rl(table), recordId: String(created[0]) }, undefined, true);
	assert.match(out[0].error, /404/);
});

console.log(`\n${passed} tests passed, ${requests} real HTTP requests to ${url}`);
