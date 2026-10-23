import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class RowflareApi implements ICredentialType {
	name = 'rowflareApi';

	displayName = 'Rowflare API';

	icon: Icon = { light: 'file:../icons/rowflare.svg', dark: 'file:../icons/rowflare.dark.svg' };

	documentationUrl = 'https://github.com/rowflare/n8n-nodes-rowflare?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'rf_...',
			description: 'Personal access token from Settings, API tokens in Rowflare',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://app.rowflare.com',
			required: true,
			description:
				'Address of your Rowflare instance. Keep the default for the hosted service, or enter the URL of your self-hosted instance.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/v1/bases',
			method: 'GET',
		},
	};
}
