# Scalar Proxy in Bun/SvelteKit

A secure proxy server for Scalar APIs, implemented as a single SvelteKit route and running on Bun. Handles CORS, preserves headers, blocks private network requests, and supports all HTTP methods.

## Features

- Works with Scalar Docs `proxyUrl`.
- Full CORS support for browser clients.
- Blocks private, loopback, and link-local IPs.
- Preserves headers and body for all HTTP methods.
- Health check endpoint at `/ping`.
- Serves `openapi.yaml` from `public/`.

## Installation

Make sure you have [Bun](https://bun.sh/) installed.

1. Clone or copy the project.
2. Install dependencies:

```sh
bun install
```

## Developing

Start the development server:

```sh
bun run dev
```

You can also open in a browser directly if your `package.json` includes a dev script that runs SvelteKit:

```sh
npm run dev -- --open
```

## Usage

In your Scalar Docs configuration:

```ts
export default {
	title: 'My API Docs',
	spec: {
		url: '/openapi.yaml'
	},
	proxyUrl: 'https://some-proxy.domain.nl' // points to your hosted proxy instance
};
```

Make requests like:

```
GET /?scalar_url=https%3A%2F%2Fledenpas.hub.allunited.dev%2Fapi%2Fendpoint
```

## Building for Production

```sh
bun run build
```

You can preview the production build with:

```sh
bun run preview
```

> To deploy, use a SvelteKit adapter suitable for your environment (e.g., Node, Cloudflare, Vercel).

## Security Notes

- Only external Scalar endpoints should be allowed; private network IPs are blocked.
- Consider adding authentication or rate-limiting in production.
- The proxy reflects `Origin` headers and supports credentials for proper browser access.
