# Example 3: Vault-Only Configuration

This example demonstrates how to filter properties by their source, simulating a scenario where you only want secrets from HashiCorp Vault (or any other specific backend).

## What This Example Demonstrates

- Property source filtering with `getSourceProperties()`
- Extracting only Vault-managed secrets
- Auto-detecting all secrets with `getAllSecrets()`
- Inspecting property sources
- Separating configuration from secrets
- Real-world Vault integration patterns

## Use Case

In production environments, you might use Spring Cloud Config with multiple backends:

- **Git** - Application configuration, feature flags, non-sensitive settings
- **Vault** - Secrets, credentials, encryption keys, API tokens
- **Environment Variables** - Infrastructure-specific overrides

This example shows how to filter and extract only the properties from Vault, while ignoring configuration from other sources.

## Prerequisites

- Node.js >= 18.0.0
- Pulumi CLI >= 3.0.0
- Docker and Docker Compose (for the test config server)

## Setup Instructions

### 1. Start the Config Server

From the `examples/` directory:

```bash
cd ..
docker-compose up -d
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Initialize Pulumi Stack

```bash
pulumi stack init dev
```

### 4. Preview the Configuration

```bash
pulumi preview
```

### 5. Deploy

```bash
pulumi up
```

## What Happens

1. **Config Fetch**: Fetches configuration for `vault-app` with profile `vault`
2. **Property Sources**: Receives properties from multiple sources:
   - `file:///config/vault-app.yml` (base configuration)
   - `file:///config/vault-app-vault.yml` (simulated Vault secrets)
3. **Filtering**: Filters properties to get only those from sources containing "vault"
4. **Secret Detection**: Automatically detects and marks secrets
5. **Export**: Exports both filtered and unfiltered properties

## Configuration Files

### `vault-app.yml` (Base Configuration)

Non-sensitive application configuration:
- `app.title`, `app.description`
- `server.port`
- `database.host`, `database.port`
- `features.enableCache`

### `vault-app-vault.yml` (Simulated Vault Secrets)

Sensitive secrets that would come from Vault in production:
- `database.username`, `database.password`
- `api.externalService.apiKey`, `api.externalService.secret`
- `encryption.masterKey`, `encryption.rotationKey`
- `oauth.clientSecret`
- `aws.accessKey`, `aws.secretAccessKey`

## Expected Output

```
Outputs:
    allSecrets               : {
        "api.externalService.apiKey": [secret],
        "api.externalService.secret": [secret],
        "aws.secretAccessKey": [secret],
        "database.password": [secret],
        "encryption.masterKey": [secret],
        "encryption.rotationKey": [secret],
        "oauth.clientSecret": [secret],
    }
    appTitle                 : "Vault Integration Example"
    propertySourceInfo       : {
        application: "vault-app",
        profiles: ["vault"],
        sourceCount: 2,
        sources: [
            {
                name: "file:///config/vault-app.yml",
                propertyCount: 8,
                isVaultSource: false,
            },
            {
                name: "file:///config/vault-app-vault.yml",
                propertyCount: 10,
                isVaultSource: true,
            }
        ]
    }
    propertyCounts          : {
        totalProperties: 18,
        vaultProperties: 10,
        baseProperties: 8,
    }
    vaultOnlyProperties     : {
        "api.externalService.apiKey": [secret],
        "database.password": [secret],
        ...
    }
```

## Code Walkthrough

### Getting All Properties (Default)

```typescript
export const allSourcesProperties = config.getSourceProperties();
```

Without arguments, `getSourceProperties()` returns properties from **all** sources.

### Filtering by Source Name

```typescript
export const vaultOnlyProperties = config.getSourceProperties(["vault"]);
```

This returns only properties from sources whose names contain "vault" (case-insensitive substring match).

**Matching logic:**
- Source: `file:///config/vault-app-vault.yml` → **Matches** (contains "vault")
- Source: `file:///config/vault-app.yml` → **Matches** (contains "vault")
- Source: `file:///config/application.yml` → Does **not** match

In production with actual Vault backend:
- Source: `vault:/secret/application/production` → **Matches**
- Source: `git:https://github.com/org/config` → Does **not** match

### Getting All Auto-Detected Secrets

```typescript
export const allSecrets = config.getAllSecrets();
```

Returns only properties matching the secret pattern:
- `password`, `secret`, `token`, `credential`, `auth`
- Ending with `key`, `Key`
- `api_key`, `api-key`, `apiKey`

### Filtering Multiple Sources

```typescript
export const vaultOrGitProperties = config.getSourceProperties(["vault", "git"]);
```

Gets properties from sources containing "vault" **OR** "git".

### Inspecting Property Sources

```typescript
export const propertySourceInfo = config.config.apply(cfg => ({
    sourceCount: cfg.propertySources.length,
    sources: cfg.propertySources.map(ps => ({
        name: ps.name,
        propertyCount: Object.keys(ps.source).length,
    })),
}));
```

The full `config.config` output includes the `propertySources` array with:
- `name` - The source identifier
- `source` - The key-value properties from that source

## Real-World Vault Integration

In a production environment with actual HashiCorp Vault:

### Spring Cloud Config Server Setup

```yaml
# application.yml (config server)
spring:
  cloud:
    config:
      server:
        git:
          uri: https://github.com/myorg/config-repo
        vault:
          host: vault.example.com
          port: 8200
          scheme: https
          backend: secret
          defaultKey: application
```

### Property Source Names

With Vault backend enabled, Spring Cloud Config Server returns sources like:

```json
{
  "propertySources": [
    {
      "name": "vault:/secret/myapp/production",
      "source": {
        "database.password": "...",
        "api.key": "..."
      }
    },
    {
      "name": "git:https://github.com/myorg/config-repo/myapp.yml",
      "source": {
        "server.port": 8080,
        "app.title": "My App"
      }
    }
  ]
}
```

### Filtering Vault Secrets in Production

```typescript
// Get ONLY Vault secrets
const vaultSecrets = config.getSourceProperties(["vault"]);

// Use them with AWS Secrets Manager
import * as aws from "@pulumi/aws";

vaultSecrets.apply(secrets => {
    for (const [key, value] of Object.entries(secrets)) {
        new aws.secretsmanager.Secret(`vault-secret-${key}`, {
            name: key,
            secretString: value as string,
        });
    }
});
```

## Use Cases

### 1. Separate Secrets from Configuration

```typescript
const configOnly = config.getSourceProperties(["git"]);      // Non-sensitive
const secretsOnly = config.getSourceProperties(["vault"]);   // Sensitive
```

### 2. Push Vault Secrets to Cloud Secrets Manager

```typescript
const vaultSecrets = config.getSourceProperties(["vault"]);

vaultSecrets.apply(secrets => {
    // Push to AWS Secrets Manager, Azure Key Vault, etc.
});
```

### 3. Create Environment Variables from Vault Only

```typescript
export const vaultEnvVars = config.getSourceProperties(["vault"]).apply(props => {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(props)) {
        env[key.replace(/\./g, "_").toUpperCase()] = String(value);
    }
    return env;
});

// Use with ECS, Lambda, etc.
import * as aws from "@pulumi/aws";

new aws.ecs.TaskDefinition("app", {
    containerDefinitions: pulumi.interpolate`[{
        "environment": ${vaultEnvVars.apply(JSON.stringify)}
    }]`,
});
```

### 4. Audit Secret Usage

```typescript
const allSecrets = config.getAllSecrets();

export const secretAudit = allSecrets.apply(secrets => ({
    count: Object.keys(secrets).length,
    keys: Object.keys(secrets),
    timestamp: new Date().toISOString(),
}));
```

## Property Source Filtering vs. getAllSecrets()

| Method | Purpose | Filter Criteria |
|--------|---------|-----------------|
| `getSourceProperties(["vault"])` | Filter by **source backend** | Source name contains "vault" |
| `getAllSecrets()` | Filter by **property name pattern** | Property name matches secret pattern |

You can combine both:

```typescript
// Get properties from Vault sources that match secret patterns
const vaultProps = config.getSourceProperties(["vault"]);
const vaultSecrets = vaultProps.apply(props => {
    const pattern = /password|secret|token|.*key$|credential|auth|api[_-]?key/i;
    return Object.fromEntries(
        Object.entries(props).filter(([key]) => pattern.test(key))
    );
});
```

## Troubleshooting

### No Properties Returned from Filtering

Check the actual source names:

```typescript
config.config.apply(cfg => {
    console.log("Property sources:");
    cfg.propertySources.forEach(ps => console.log(`  - ${ps.name}`));
});
```

The filter is a substring match (case-insensitive):
- Filter `["vault"]` matches `"file:///config/vault-app-vault.yml"`
- Filter `["git"]` matches `"git:https://..."`

### Secrets Not Being Auto-Detected

Ensure `autoDetectSecrets: true` (default):

```typescript
const config = new ConfigServerConfig("config", {
    autoDetectSecrets: true,  // Enable auto-detection
    // ...
});
```

### getAllSecrets() Returns Empty

If `autoDetectSecrets: false`, `getAllSecrets()` returns an empty object.

## Next Steps

- Try **[Example 4: Complete AWS Infrastructure](../complete/)** to see real-world AWS integration
- Try **[Example 5: Multi-Environment](../multi-environment/)** to manage multiple environments
- Read about [Spring Cloud Config Vault Backend](https://cloud.spring.io/spring-cloud-config/reference/html/#vault-backend)

## Cleanup

```bash
pulumi destroy
pulumi stack rm dev
cd ..
docker-compose down
```
