# n8n-nodes-rowflare

This is an n8n community node. It lets you use [Rowflare](https://rowflare.com) in your n8n workflows.

Rowflare is an open-source (AGPL-3.0) Airtable alternative. You can use the hosted service at app.rowflare.com or run it yourself on Cloudflare or with Docker. Its REST API is modeled on the Airtable Web API.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation) · [Operations](#operations) · [Credentials](#credentials) · [Compatibility](#compatibility) · [Usage](#usage) · [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation and install `n8n-nodes-rowflare`.

## Operations

**Rowflare** node

| Resource | Operation | API call |
| --- | --- | --- |
| Base | Get Many | `GET /api/v1/bases` |
| Table | Get Many (with fields and views) | `GET /api/v1/bases/{baseId}/tables` |
| Record | Create | `POST /api/v1/{baseId}/{table}` |
| Record | Get | `GET /api/v1/{baseId}/{table}/{recordId}` |
| Record | Get Many (formula filter, view, sort, field selection, all pages) | `GET /api/v1/{baseId}/{table}` |
| Record | Update (only the fields you send, or replace all fields) | `PATCH` or `PUT /api/v1/{baseId}/{table}/{recordId}` |
| Record | Delete | `DELETE /api/v1/{baseId}/{table}/{recordId}` |

The node can also be used as a tool by n8n AI agents.

**Rowflare Trigger** node

Polls a table and starts the workflow for each record created since the last poll, oldest first. You can narrow it with an additional formula (for example `{Status} = "Review"`) or a view. Records that already exist when you activate the workflow are not emitted. The Rowflare API does not return a record's last modified time, so there is no "record updated" trigger; use a Rowflare automation with a webhook step if you need one.

## Credentials

1. In Rowflare, open **Settings, API tokens** and create a personal access token. It starts with `rf_` and is shown once.
2. In n8n, create a **Rowflare API** credential:
   - **API Token**: the token.
   - **Base URL**: keep `https://app.rowflare.com` for the hosted service, or enter the address of your own instance, for example `https://rowflare.example.com`.

A token acts as the user who created it, with that user's role in each workspace: a viewer's token can read but not write. n8n checks the credential by listing your bases.

## Compatibility

Built with `@n8n/node-cli` 0.53 and `n8n-workflow` 2.x (n8n 2.x). Tested against Rowflare 0.1.0 (Docker image `rowflare/rowflare:0.1.0`).

## Usage

- **Base and Table** can be picked from a list, or given by ID. A table can also be given by name, for example `Tasks`.
- **Record IDs** are integers.
- **Data to Send** for Create and Update:
  - *Define Below*: pick fields and type values. Values are sent as text, so turn on **Typecast** for numbers, dates, select options and links.
  - *Auto-Map Input Data*: every key of the incoming item becomes a field. Use **Ignore Fields** to leave keys out.
  - *JSON*: an object of field names (or field IDs) and values, for example `{"Name": "Ship it", "Estimate": 3, "Tags": ["web"]}`.
- **Typecast** converts numeric strings to numbers, common date formats to dates, creates unknown select options, and links records by their primary field value.
- **Filter by Formula** uses Rowflare formulas, which follow Airtable's: `AND({Status} = "Done", {Estimate} > 5)`.
- Records come back in the Airtable shape: `{ "id": 17, "createdTime": "...", "fields": { ... } }`. Empty cells are left out of `fields`.
- Computed fields (formula, lookup, rollup, created time, autonumber) are read-only; writing them fails with a 422 error.
- Attachments can be read but not uploaded through the API.

An example workflow is in [examples/create-and-list.json](examples/create-and-list.json).

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Rowflare REST API](https://github.com/rowflare/rowflare/blob/main/docs/api.md)
- [Rowflare OpenAPI description](https://rowflare.com/openapi.json)
- [Rowflare self-hosting](https://github.com/rowflare/rowflare/blob/main/docs/self-hosting.md)

## Development

```sh
npm install
npm run lint
npm run build
# Live test against a running Rowflare instance (creates and deletes records in the "Tasks" table
# of a base made from the "Project tracker" template):
ROWFLARE_URL=http://127.0.0.1:8787 ROWFLARE_TOKEN=rf_... ROWFLARE_BASE=app... npm run test:live
```

Releases are published to npm by `.github/workflows/publish.yml` with an npm provenance statement when a version tag (for example `0.1.0`) is pushed.

## Version history

- 0.1.0: first release.
