// File: src/routes/proxy/+server.ts
import type { RequestHandler } from '@sveltejs/kit';

// Blocked network CIDRs: loopback, link-local, private, CGNAT, local IPv6
const blockedCIDRs = [
	'0.0.0.0/32',
	'127.0.0.0/8',
	'::1/128',
	'::/128',
	'169.254.0.0/16',
	'fe80::/10',
	'10.0.0.0/8',
	'172.16.0.0/12',
	'192.168.0.0/16',
	'100.64.0.0/10',
	'fc00::/7'
].map((cidr) => {
	const [ip, mask] = cidr.split('/');
	return { ip, mask: parseInt(mask) };
});

function ipInCidr(ip: string, cidr: { ip: string; mask: number }) {
	const ipParts = ip.split('.').map(Number);
	const cidrParts = cidr.ip.split('.').map(Number);
	const mask = cidr.mask;
	let ipNum = 0,
		cidrNum = 0;
	for (let i = 0; i < 4; i++) {
		ipNum = (ipNum << 8) + ipParts[i];
		cidrNum = (cidrNum << 8) + cidrParts[i];
	}
	const maskShift = 32 - mask;
	return ipNum >> maskShift === cidrNum >> maskShift;
}

async function isBlockedHost(host: string) {
	const [hostname] = host.split(':');
	if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
		return blockedCIDRs.some((cidr) => ipInCidr(hostname, cidr));
	}
	try {
		const ips = await Bun.resolve(hostname); // Bun-native DNS resolution
		return ips.some((ip) => blockedCIDRs.some((cidr) => ipInCidr(ip, cidr)));
	} catch {
		return true; // block on DNS failure
	}
}

async function executeProxyRequest(request: Request, targetUrl: URL) {
	if (await isBlockedHost(targetUrl.host)) {
		return new Response(JSON.stringify({ error: 'Forbidden: private network access' }), {
			status: 403
		});
	}

	const headers = new Headers(request.headers);
	headers.delete('origin');

	if (headers.has('x-scalar-cookie')) {
		headers.set('cookie', headers.get('x-scalar-cookie')!);
		headers.delete('x-scalar-cookie');
	}

	const fetchOptions: RequestInit = {
		method: request.method,
		headers,
		body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
		...(['GET', 'HEAD'].includes(request.method) ? {} : { duplex: 'half' })
	};

	const resp = await fetch(targetUrl.toString(), fetchOptions);

	const responseHeaders = new Headers(resp.headers);
	[
		'access-control-allow-origin',
		'access-control-allow-credentials',
		'access-control-allow-methods',
		'access-control-allow-headers',
		'access-control-expose-headers'
	].forEach((h) => responseHeaders.delete(h));

	responseHeaders.set('Access-Control-Allow-Origin', request.headers.get('origin') || '*');
	responseHeaders.set('Access-Control-Allow-Credentials', 'true');
	responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
	responseHeaders.set('Access-Control-Allow-Headers', '*');
	responseHeaders.set('Access-Control-Expose-Headers', '*');
	responseHeaders.set('X-Forwarded-Host', resp.url);

	const body = await resp.arrayBuffer();
	return new Response(body, { status: resp.status, headers: responseHeaders });
}

const handleRequest: RequestHandler = async ({ request, url }) => {
	// Preflight CORS
	if (request.method === 'OPTIONS') {
		const headers = new Headers();
		headers.set('Access-Control-Allow-Origin', '*');
		headers.set('Access-Control-Allow-Credentials', 'true');
		headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
		headers.set('Access-Control-Allow-Headers', '*');
		headers.set('Access-Control-Expose-Headers', '*');
		return new Response(null, { status: 204, headers });
	}

	// Health check
	if (url.pathname === '/ping') return new Response('pong');

	// Serve OpenAPI document
	if (url.pathname === '/openapi.yaml') {
		try {
			const content = await Bun.file('public/openapi.yaml').text(); // Bun-native file reading
			return new Response(content, { headers: { 'Content-Type': 'text/yaml' } });
		} catch {
			return new Response('Error reading openapi.yaml', { status: 500 });
		}
	}

	const target = url.searchParams.get('scalar_url');
	if (!target) return new Response('Missing scalar_url', { status: 400 });

	let targetUrl: URL;
	try {
		targetUrl = new URL(target);
	} catch {
		return new Response('Invalid URL', { status: 400 });
	}

	return executeProxyRequest(request, targetUrl);
};

export const GET = handleRequest;
export const POST = handleRequest;
export const PATCH = handleRequest;
export const PUT = handleRequest;
export const DELETE = handleRequest;
export const OPTIONS = handleRequest;
export const HEAD = handleRequest;
