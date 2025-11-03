# @egulatee/pulumi-spring-cloud-config

> Pulumi Dynamic Provider for integrating Spring Cloud Config Server with infrastructure-as-code projects

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/egulatee/pulumi-spring-cloud-config)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Test](https://github.com/egulatee/pulumi-spring-cloud-config/actions/workflows/test.yml/badge.svg)](https://github.com/egulatee/pulumi-spring-cloud-config/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/egulatee/pulumi-spring-cloud-config/branch/main/graph/badge.svg)](https://codecov.io/gh/egulatee/pulumi-spring-cloud-config)

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

## Architecture

### How It Works

```
┌─────────────────┐
│ Pulumi Program  │
│                 │
│ ConfigServer    │
│ Config(...)     │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ Dynamic Provider        │
│ - Validates inputs      │
│ - Fetches config        │
│ - Detects secrets       │
│ - Smart diffing         │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ HTTP Client             │
│ - Basic Auth            │
│ - Retry logic           │
│ - Error handling        │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Spring Cloud Config Server  │
│ ┌─────────────────────────┐ │
│ │ Property Sources:       │ │
│ │ • Git Repository        │ │
│ │ • HashiCorp Vault       │ │
│ │ • Local Files           │ │
│ │ • Environment Variables │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

For a detailed architecture diagram, see [docs/architecture.txt](./docs/architecture.txt).

**Key Components:**

1. **ConfigServerConfig Resource** - User-facing API that creates a Pulumi resource
2. **Dynamic Provider** - Manages resource lifecycle (create, update, diff)
3. **HTTP Client** - Handles communication with config server (retry, auth, errors)
4. **Config Server** - External service that aggregates configuration from multiple sources

**Data Flow:**

1. Pulumi program creates ConfigServerConfig resource
2. Dynamic provider fetches configuration from config server
3. Provider flattens property sources and detects secrets
4. Properties are available via `getProperty()` and `getSourceProperties()`
5. Smart diffing ensures configuration is only re-fetched when inputs change

## Error Handling

The provider handles various error scenarios gracefully:

### HTTP Errors

| Status Code | Behavior | Retry? |
|-------------|----------|--------|
| **401** | Authentication failed - check username/password | ❌ No |
| **403** | Access forbidden - insufficient permissions | ❌ No |
| **404** | Configuration not found for application/profile | ❌ No |
| **500** | Config server internal error | ❌ No |
| **503** | Service unavailable | ✅ Yes (up to 3 times) |

### Network Errors

| Error Type | Description | Retry? |
|------------|-------------|--------|
| **ECONNREFUSED** | Cannot connect to config server | ✅ Yes |
| **ETIMEDOUT** | Request timeout | ✅ Yes |
| **ECONNABORTED** | Connection aborted | ✅ Yes |
| **ENOTFOUND** | DNS resolution failed | ✅ Yes |

### Retry Logic

- **Max Retries**: 3 (configurable)
- **Initial Delay**: 1000ms
- **Backoff Strategy**: Exponential (2x multiplier)
- **Total Max Time**: ~7 seconds (1s + 2s + 4s)

**Example with retries:**

```typescript
const config = new ConfigServerConfig('config', {
  configServerUrl: 'https://config-server.example.com',
  application: 'my-app',
  profile: 'prod',
  timeout: 15000, // Allow more time for retries
});
```

### Error Messages

All error messages are sanitized to remove credentials:

```
❌ Bad:  "Failed to connect to https://user:password@config-server.example.com"
✅ Good: "Failed to connect to https://***:***@config-server.example.com"
```

## API Reference

### ConfigServerConfig

#### Constructor

```typescript
new ConfigServerConfig(name: string, args: ConfigServerConfigArgs, opts?: pulumi.CustomResourceOptions)
```

**Parameters:**
- `name` - Unique name for this resource
- `args` - Configuration arguments (see [Configuration Options](#configuration-options))
- `opts` - Optional Pulumi resource options

#### Properties

##### config: pulumi.Output<ConfigServerResponse>

The full configuration response from the config server.

**Type Definition:**
```typescript
interface ConfigServerResponse {
  name: string;                    // Application name
  profiles: string[];              // Active profiles
  label: string | null;            // Git label/branch
  version: string | null;          // Git commit hash
  state: string | null;            // State information
  propertySources: PropertySource[]; // Array of property sources
}

interface PropertySource {
  name: string;                    // Source identifier (e.g., "vault:/secret/app/prod")
  source: Record<string, unknown>; // Key-value properties
}
```

##### properties: pulumi.Output<Record<string, unknown>>

All configuration properties flattened into a single key-value map. Later sources override earlier ones.

#### Methods

##### getProperty(key: string, markAsSecret?: boolean): pulumi.Output<string | undefined>

Get a single property value from the configuration.

**Parameters:**
- `key` - The property key using dot notation (e.g., `"database.password"`)
- `markAsSecret` (optional) - Override automatic secret detection:
  - `true` - Force mark as secret
  - `false` - Prevent marking as secret
  - `undefined` - Use automatic detection (default)

**Returns:** `pulumi.Output<string | undefined>` - The property value, or `undefined` if not found

**Examples:**
```typescript
// Auto-detect secrets
const dbPassword = config.getProperty("database.password");  // Marked as secret

// Force mark as secret
const apiKey = config.getProperty("api.endpoint", true);

// Prevent marking as secret
const publicKey = config.getProperty("rsa.publicKey", false);
```

##### getSourceProperties(sourceNames?: string[]): pulumi.Output<Record<string, unknown>>

Get properties from specific property sources.

**Parameters:**
- `sourceNames` (optional) - Array of source name filters (case-insensitive substring match)
  - If provided: Returns only properties from matching sources
  - If omitted: Returns all properties from all sources

**Returns:** `pulumi.Output<Record<string, unknown>>` - Filtered properties map

**Examples:**
```typescript
// Get all Vault properties
const vaultProps = config.getSourceProperties(["vault"]);

// Get properties from Vault OR Git sources
const vaultOrGit = config.getSourceProperties(["vault", "git"]);

// Get all properties (same as config.properties)
const allProps = config.getSourceProperties();
```

**Source Name Matching:**
- Source: `vault:/secret/app/prod` → Matches filter: `["vault"]` ✅
- Source: `git:https://github.com/org/config` → Matches filter: `["git"]` ✅
- Source: `file:///config/application.yml` → Matches filter: `["vault"]` ❌

##### getAllSecrets(): pulumi.Output<Record<string, string>>

Get all properties that were automatically detected as secrets.

**Returns:** `pulumi.Output<Record<string, string>>` - All auto-detected secrets

**Note:** Only works if `autoDetectSecrets: true` (default). Returns empty object if disabled.

**Secret Detection Pattern:**
```
/password|secret|token|.*key$|credential|auth|api[_-]?key/i
```

**Examples:**
```typescript
const secrets = config.getAllSecrets();

// Use with AWS Secrets Manager
secrets.apply(secretMap => {
  for (const [key, value] of Object.entries(secretMap)) {
    new aws.secretsmanager.Secret(`${key}`, {
      secretString: value,
    });
  }
});
```

## Migration Guide

### Migrating from Manual Config Fetching

If you're currently using custom HTTP client code to fetch configuration from Spring Cloud Config Server, here's how to migrate:

#### Before (Manual Approach)

```typescript
import * as pulumi from '@pulumi/pulumi';
import axios from 'axios';

// Manually fetch configuration
async function getConfig() {
  const response = await axios.get(
    'https://config-server.example.com/my-app/prod',
    {
      auth: {
        username: 'admin',
        password: 'secret',
      },
    }
  );

  // Manually flatten properties
  const props: Record<string, any> = {};
  for (const source of response.data.propertySources) {
    Object.assign(props, source.source);
  }

  return props;
}

// Use in Pulumi program (problematic!)
const configPromise = getConfig();
export const dbPassword = configPromise.then(c => c['database.password']);
```

**Problems with this approach:**
- ❌ Async/await doesn't work well with Pulumi Outputs
- ❌ No automatic secret detection
- ❌ No retry logic
- ❌ No smart diffing (fetches on every `pulumi up`)
- ❌ Credentials exposed in code or environment variables
- ❌ Error handling is manual

#### After (Using This Package)

```typescript
import * as pulumi from '@pulumi/pulumi';
import { ConfigServerConfig } from '@egulatee/pulumi-spring-cloud-config';

const pulumiConfig = new pulumi.Config();

const config = new ConfigServerConfig('config', {
  configServerUrl: 'https://config-server.example.com',
  application: 'my-app',
  profile: 'prod',
  username: pulumiConfig.require('configServerUsername'),
  password: pulumiConfig.requireSecret('configServerPassword'),
});

// Access properties with proper Pulumi Output handling
export const dbPassword = config.getProperty('database.password');
```

**Benefits:**
- ✅ Proper Pulumi Output handling
- ✅ Automatic secret detection and encryption
- ✅ Built-in retry logic with exponential backoff
- ✅ Smart diffing (only fetches when needed)
- ✅ Credentials stored securely in Pulumi config
- ✅ Comprehensive error handling

### Step-by-Step Migration

**1. Install the package:**

```bash
npm install @egulatee/pulumi-spring-cloud-config
```

**2. Replace manual HTTP calls with ConfigServerConfig:**

```typescript
// Remove
import axios from 'axios';

// Add
import { ConfigServerConfig } from '@egulatee/pulumi-spring-cloud-config';
```

**3. Store credentials in Pulumi config:**

```bash
pulumi config set configServerUsername admin
pulumi config set --secret configServerPassword your-password
```

**4. Replace config fetching logic:**

```typescript
// Remove manual fetching
const configData = await axios.get(...);

// Add resource
const config = new ConfigServerConfig('config', {
  configServerUrl: 'https://config-server.example.com',
  application: 'my-app',
  profile: pulumi.getStack(),
  username: pulumiConfig.require('configServerUsername'),
  password: pulumiConfig.requireSecret('configServerPassword'),
});
```

**5. Update property access:**

```typescript
// Replace direct property access
const dbHost = configData.properties['database.host'];

// With getProperty()
const dbHost = config.getProperty('database.host');
```

**6. Test the migration:**

```bash
pulumi preview
pulumi up
```

## Examples

See the [examples](./examples) directory for complete, runnable examples:

1. **[Basic Usage](./examples/basic/)** - Simple configuration fetch
   - Minimal working example
   - Property access and Output unwrapping
   - Introduction to the package

2. **[With Authentication](./examples/with-auth/)** - Security best practices
   - Basic Auth with username/password
   - Secure credential storage using Pulumi Config
   - Secret handling and detection
   - Production-ready patterns

3. **[Vault-Only Configuration](./examples/vault-only/)** - Property source filtering
   - Filter properties by source (simulating Vault)
   - `getSourceProperties()` usage
   - `getAllSecrets()` demonstration
   - Real-world Vault integration patterns

4. **[Complete AWS Infrastructure](./examples/complete/)** - Real-world deployment
   - Fully deployable AWS stack (VPC, RDS, ECS, ALB)
   - Using config server values with AWS resources
   - Secrets Manager integration
   - Production architecture

5. **[Multi-Environment](./examples/multi-environment/)** - Stack-based environments
   - Managing dev/staging/prod with Pulumi stacks
   - Dynamic profile selection
   - Environment-specific configuration
   - CI/CD integration patterns

All examples include:
- Complete, working Pulumi programs
- Detailed README with setup instructions
- Docker Compose test infrastructure
- Real configuration files

See [examples/README.md](./examples/README.md) for quick start instructions.

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
