# @egulatee/pulumi-spring-cloud-config

> Pulumi Dynamic Provider for integrating Spring Cloud Config Server with infrastructure-as-code projects

[![npm version](https://badge.fury.io/js/%40egulatee%2Fpulumi-spring-cloud-config.svg)](https://badge.fury.io/js/%40egulatee%2Fpulumi-spring-cloud-config)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Test](https://github.com/egulatee/pulumi-spring-cloud-config/actions/workflows/test.yml/badge.svg)](https://github.com/egulatee/pulumi-spring-cloud-config/actions/workflows/test.yml)

## Overview

This package provides a Pulumi Dynamic Provider that fetches configuration from Spring Cloud Config Server and makes it available to your infrastructure-as-code projects. It eliminates code duplication and provides standardized, secure configuration retrieval across your Pulumi stacks.

## Features

- ✅ **Smart Diffing**: Only fetches configuration when inputs change
- ✅ **Automatic Secret Detection**: Intelligently detects and marks sensitive properties as Pulumi secrets
- ✅ **Property Source Filtering**: Filter configuration by source (e.g., Vault-only)
- ✅ **Basic Authentication**: Secure communication with config-server
- ✅ **TypeScript Support**: Full type definitions and IntelliSense support
- ✅ **Configurable Timeouts**: Adjust request timeouts to match your environment
- ✅ **Debug Mode**: Verbose logging for troubleshooting

## Installation

```bash
npm install @egulatee/pulumi-spring-cloud-config
```

## Requirements

- Node.js >= 18.0.0
- Pulumi >= 3.0.0
- Spring Cloud Config Server >= 2.3.0

## Quick Start

```typescript
import * as pulumi from '@pulumi/pulumi';
import { ConfigServerConfig } from '@egulatee/pulumi-spring-cloud-config';

const config = new pulumi.Config();

// Fetch configuration from Spring Cloud Config Server
const dbConfig = new ConfigServerConfig('database-config', {
  configServerUrl: 'https://config-server.example.com',
  application: 'my-service',
  profile: pulumi.getStack(), // 'dev', 'staging', 'prod'
  username: config.require('configServerUsername'),
  password: config.requireSecret('configServerPassword'),
  propertySources: ['vault'], // Optional: filter to Vault-only
});

// Get individual properties
const dbPassword = dbConfig.getProperty('database.password', true); // marked as secret
const dbHost = dbConfig.getProperty('database.host');
const dbPort = dbConfig.getProperty('database.port');

// Use in other resources
export const databaseUrl = pulumi.interpolate`postgresql://${dbHost}:${dbPort}`;
```

## Configuration Options

### ConfigServerConfigArgs

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `configServerUrl` | `string` | Yes | - | The URL of the Spring Cloud Config Server |
| `application` | `string` | Yes | - | The application name to fetch configuration for |
| `profile` | `string` | Yes | - | The profile(s) to fetch configuration for (comma-separated) |
| `label` | `string` | No | - | The label/branch to fetch configuration from |
| `username` | `string` | No | - | Username for Basic Authentication |
| `password` | `string` | No | - | Password for Basic Authentication |
| `propertySources` | `string[]` | No | - | Filter property sources by name (e.g., `["vault"]`) |
| `timeout` | `number` | No | `10000` | Request timeout in milliseconds |
| `debug` | `boolean` | No | `false` | Enable debug logging |
| `autoDetectSecrets` | `boolean` | No | `true` | Automatically detect and mark secrets |
| `enforceHttps` | `boolean` | No | `false` | Enforce HTTPS (fail on HTTP except localhost) |

## How Smart Diffing Works

### Understanding Configuration Refresh Behavior

This provider uses **smart diffing** to determine when to fetch configuration from the Spring Cloud Config Server:

#### When Configuration is Fetched

Configuration is fetched from the config-server in these scenarios:

1. **Initial Creation**: When you first create a `ConfigServerConfig` resource
2. **Input Changes**: When any of these inputs change:
   - `configServerUrl`
   - `application`
   - `profile`
   - `label`
   - `username`
   - `password`
   - `propertySources`

#### When Configuration is NOT Fetched

Configuration is **not** fetched in these scenarios:

- Running `pulumi up` without any changes to inputs
- Running `pulumi preview` (read-only operation)
- Updating unrelated resources in your stack

### Detecting Upstream Configuration Changes

If configuration changes on the config-server **without** changing your Pulumi code, use `pulumi refresh`:

```bash
# Explicitly fetch latest configuration from config-server
pulumi refresh
```

This will detect changes made directly on the config-server (e.g., rotated secrets, updated values).

### Best Practices

#### Development Workflow

```bash
# Normal deployments (only fetches if inputs changed)
pulumi up

# After rotating secrets on config-server
pulumi refresh  # Detect upstream changes
pulumi up       # Apply any resulting infrastructure changes
```

#### Production Workflow

```bash
# Regular deployments
pulumi up

# Scheduled configuration sync (optional)
# Run this periodically to detect upstream changes
pulumi refresh && pulumi up
```

### Trade-offs

**Smart Diffing (Current Approach)**
- ✅ Efficient: Fewer API calls to config-server
- ✅ Predictable: Only fetches when inputs change
- ✅ Production-friendly: Less dependency on config-server availability
- ⚠️ Requires manual refresh to detect upstream changes

**Always Refresh (Alternative)**
- ❌ More API calls on every `pulumi up`
- ❌ Requires highly available config-server
- ❌ Slower operations
- ✅ Automatically detects upstream changes

## Security Best Practices

### HTTPS Enforcement

Always use HTTPS in production:

```typescript
const config = new ConfigServerConfig('config', {
  configServerUrl: 'https://config-server.example.com', // ✅ HTTPS
  enforceHttps: true, // Fail if HTTP used (except localhost)
  // ...
});
```

HTTP URLs will trigger warnings unless `enforceHttps` is explicitly set to `false` or the URL is localhost.

### Secret Detection

The provider automatically detects and marks secrets based on key patterns:

**Detected Patterns:**
- `password`, `passwd`, `pwd`
- `secret`, `token`
- `api_key`, `apikey`, `api-key`
- `private_key`, `privatekey`
- `access_key`, `accesskey`

**Override Secret Detection:**

```typescript
// Disable auto-detection globally
const config = new ConfigServerConfig('config', {
  autoDetectSecrets: false,
  // ...
});

// Override per-property
const publicKey = dbConfig.getProperty('public_key', false); // NOT marked as secret
const apiKey = dbConfig.getProperty('api_key', true); // Force mark as secret
```

### Credential Management

Store config-server credentials securely:

```typescript
import * as pulumi from '@pulumi/pulumi';

const pulumiConfig = new pulumi.Config();

const config = new ConfigServerConfig('config', {
  configServerUrl: pulumiConfig.require('configServerUrl'),
  username: pulumiConfig.require('configServerUsername'),
  password: pulumiConfig.requireSecret('configServerPassword'), // ✅ Encrypted
  // ...
});
```

Set encrypted configuration:

```bash
pulumi config set configServerUsername admin
pulumi config set --secret configServerPassword 'your-password'
```

## Advanced Usage

### Filtering by Property Source

Fetch only from specific property sources (e.g., Vault):

```typescript
const vaultConfig = new ConfigServerConfig('vault-config', {
  configServerUrl: 'https://config-server.example.com',
  application: 'my-service',
  profile: 'prod',
  propertySources: ['vault'], // Only fetch from Vault
  username: config.require('configServerUsername'),
  password: config.requireSecret('configServerPassword'),
});

// Get all properties from Vault sources
const allVaultProps = vaultConfig.getSourceProperties(['vault']);
```

### Debug Mode

Enable verbose logging for troubleshooting:

```typescript
const config = new ConfigServerConfig('debug-config', {
  configServerUrl: 'https://config-server.example.com',
  application: 'my-service',
  profile: 'dev',
  debug: true, // ✅ Enable debug logging
});
```

### Custom Timeout

Adjust timeout for slow config-servers:

```typescript
const config = new ConfigServerConfig('slow-config', {
  configServerUrl: 'https://slow-config-server.example.com',
  application: 'my-service',
  profile: 'prod',
  timeout: 30000, // 30 seconds (default: 10 seconds)
});
```

## API Reference

### ConfigServerConfig

#### Constructor

```typescript
new ConfigServerConfig(name: string, args: ConfigServerConfigArgs, opts?: pulumi.CustomResourceOptions)
```

#### Methods

##### getProperty(key: string, markAsSecret?: boolean): pulumi.Output<string | undefined>

Get a single property value from the configuration.

**Parameters:**
- `key`: The property key (e.g., `"database.password"`)
- `markAsSecret`: Whether to mark this property as a Pulumi secret (default: `false`)

**Returns:** The property value as a Pulumi Output

##### getSourceProperties(sourceNames?: string[]): pulumi.Output<Record<string, unknown>>

Get all properties from specific property sources.

**Parameters:**
- `sourceNames`: Filter by source names (e.g., `["vault"]`). If not provided, returns all properties.

**Returns:** All properties from matching sources

## Examples

See the [examples](./examples) directory for complete examples:

- [Basic Usage](./examples/basic/) - Simple configuration fetch
- [With Authentication](./examples/with-auth/) - Using Basic Auth
- [Vault Only](./examples/vault-only/) - Filtering to Vault property sources

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/egulatee/pulumi-spring-cloud-config.git
cd pulumi-spring-cloud-config

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run clean` - Remove build artifacts
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Lint code
- `npm run lint:fix` - Lint and auto-fix issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

### Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## Roadmap

### v0.1.0 (Current)
- ✅ Smart diffing with input comparison
- ✅ Basic Authentication
- ✅ Automatic secret detection
- ✅ Property source filtering
- ✅ Configurable timeout

### v0.2.0 (Future)
- ⏸️ OAuth2/JWT authentication
- ⏸️ Retry with exponential backoff
- ⏸️ Partial results support
- ⏸️ Config-server version detection
- ⏸️ Rate limiting and request caching
- ⏸️ Docker-based integration tests

## Troubleshooting

### Configuration Not Updating

If configuration on the config-server changed but Pulumi doesn't detect it:

```bash
# Explicitly refresh to detect upstream changes
pulumi refresh

# Then apply
pulumi up
```

### Timeout Errors

If requests are timing out:

```typescript
const config = new ConfigServerConfig('config', {
  // Increase timeout
  timeout: 30000, // 30 seconds
  // ...
});
```

### HTTPS Warnings

To suppress HTTPS warnings for localhost development:

```typescript
const config = new ConfigServerConfig('config', {
  configServerUrl: 'http://localhost:8888', // Localhost is allowed
  // ...
});
```

Or explicitly allow HTTP:

```typescript
const config = new ConfigServerConfig('config', {
  configServerUrl: 'http://config-server.internal', // Internal network
  enforceHttps: false, // Disable HTTPS enforcement
  // ...
});
```

## License

Apache-2.0 - See [LICENSE](./LICENSE) for details

## Support

- **Issues**: https://github.com/egulatee/pulumi-spring-cloud-config/issues
- **Security**: See [SECURITY.md](./SECURITY.md)

## Acknowledgments

Built with:
- [Pulumi](https://www.pulumi.com/) - Modern Infrastructure as Code
- [Spring Cloud Config](https://spring.io/projects/spring-cloud-config) - Centralized Configuration Management
- [TypeScript](https://www.typescriptlang.org/) - Typed JavaScript
