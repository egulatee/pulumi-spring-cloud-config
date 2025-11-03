# Example 2: With Authentication

This example demonstrates secure configuration fetching with authentication, secret handling, and security best practices.

## What This Example Demonstrates

- Basic Authentication with username and password
- Secure credential storage using Pulumi Config
- Automatic secret detection
- Manual secret marking/unmarking
- HTTPS enforcement options
- Working with sensitive configuration values
- Security best practices

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

The config server is configured with Basic Authentication:
- **Username**: `admin`
- **Password**: `secret123`

### 2. Install Dependencies

```bash
npm install
```

### 3. Initialize Pulumi Stack

```bash
pulumi stack init dev
```

### 4. Configure Credentials

Store the config server credentials securely using Pulumi Config:

```bash
# Set username (not encrypted, but not sensitive in this case)
pulumi config set configServerUsername admin

# Set password as a SECRET (encrypted in Pulumi state)
pulumi config set --secret configServerPassword secret123
```

Verify your configuration:

```bash
pulumi config
```

You should see:
```
KEY                        VALUE
configServerPassword       [secret]
configServerUsername       admin
```

### 5. Preview the Configuration

```bash
pulumi preview
```

You should see configuration being fetched with authentication, and various properties marked as secrets.

### 6. Deploy

```bash
pulumi up
```

## What Happens

1. **Credentials Retrieved**: Username and password are retrieved from Pulumi Config
2. **Authenticated Request**: The package sends an HTTP request with Basic Auth headers
3. **Configuration Fetched**: Config server validates credentials and returns configuration
4. **Secret Detection**: Properties matching secret patterns are automatically marked as secrets
5. **Secure Storage**: Secret values are encrypted in Pulumi state

## Configuration Files

This example uses `/config-repo/auth-app.yml`, which contains both sensitive and non-sensitive properties.

### Secret Properties (Auto-Detected)

The following properties are automatically detected as secrets based on their names:

- `database.password`
- `security.jwt.secret`
- `api.external.apiKey`
- `encryption.key`

### Non-Secret Properties

- `database.host`
- `database.port`
- `server.port`
- `app.title`

## Expected Output

After running `pulumi up`, you should see:

```
Outputs:
    apiKey              : [secret]
    appTitle            : "Authenticated Application"
    databaseHost        : "secure-db.example.com"
    databasePassword    : [secret]
    databaseUrl         : [secret]  (because it contains password)
    databaseUsername    : "app_user"
    encryptionKey       : [secret]
    jwtSecret           : [secret]
    secretCount         : 4
    securityNotes       : {
        authentication: "Using Basic Auth...",
        ...
    }
    serverPort          : 8443
```

Notice that sensitive values are shown as `[secret]` and are encrypted in your state file.

## Code Walkthrough

### Retrieving Credentials from Pulumi Config

```typescript
const pulumiConfig = new pulumi.Config();
const username = pulumiConfig.require("configServerUsername");
const password = pulumiConfig.requireSecret("configServerPassword");
```

- `require()` - Gets a non-secret config value
- `requireSecret()` - Gets an encrypted config value, returns `pulumi.Output<string>`

### Passing Credentials to Config Server

```typescript
const config = new ConfigServerConfig("auth-config", {
    configServerUrl: "http://localhost:8888",
    application: "auth-app",
    profile: "production",
    username: username,
    password: password,  // Already a secret Output
});
```

### Automatic Secret Detection

Properties with these patterns are automatically marked as secrets:

- Contains: `password`, `secret`, `token`, `credential`, `auth`
- Ends with: `key`, `Key`
- Matches: `api_key`, `api-key`, `apiKey`

```typescript
// Automatically detected as secret
export const databasePassword = config.getProperty("database.password");
export const apiKey = config.getProperty("api.external.apiKey");
```

### Manual Secret Control

**Force a property to be a secret:**

```typescript
export const explicitSecret = config.getProperty("some.property", true);
```

**Prevent auto-detection** (use with caution):

```typescript
export const notASecret = config.getProperty("database.password", false);
```

### Working with Secret Outputs

When you combine secret values with non-secret values, the result is marked as a secret:

```typescript
export const databaseUrl = pulumi.all([
    config.getProperty("database.host"),      // Not a secret
    config.getProperty("database.password"),  // Secret
]).apply(([host, password]) =>
    `postgresql://user:${password}@${host}`   // Result is a secret
);
```

## Security Best Practices

### 1. Always Use HTTPS in Production

```typescript
const config = new ConfigServerConfig("prod-config", {
    configServerUrl: "https://config.production.example.com",
    enforceHttps: true,  // Fails if not HTTPS
    // ...
});
```

### 2. Store Credentials Securely

**DO:**
```bash
pulumi config set --secret password "my-secret"
```

**DON'T:**
```typescript
password: "hardcoded-secret"  // Never do this!
```

### 3. Use Environment-Specific Stacks

```bash
# Development
pulumi stack init dev
pulumi config set configServerUrl http://localhost:8888

# Production
pulumi stack init prod
pulumi config set configServerUrl https://config.prod.example.com
pulumi config set enforceHttps true
```

### 4. Audit Secret Access

Review which properties are being marked as secrets:

```bash
pulumi stack output secretCount
```

### 5. Rotate Credentials Regularly

When credentials change:

```bash
# Update Pulumi config
pulumi config set --secret configServerPassword new-password

# Refresh configuration from server
pulumi refresh
```

## Troubleshooting

### Error: 401 Unauthorized

Your credentials are incorrect. Verify:

```bash
pulumi config
curl -u admin:secret123 http://localhost:8888/auth-app/production
```

### Error: Config value 'configServerPassword' not found

You haven't set the required configuration:

```bash
pulumi config set configServerUsername admin
pulumi config set --secret configServerPassword secret123
```

### Secrets Not Being Detected

Check if `autoDetectSecrets` is enabled (it's `true` by default):

```typescript
const config = new ConfigServerConfig("config", {
    // ...
    autoDetectSecrets: true,  // Enable auto-detection
});
```

### HTTPS Enforcement Failing for Localhost

Localhost is automatically exempted from HTTPS enforcement. If you're using a different hostname for local testing:

```typescript
enforceHttps: false,  // Disable for local testing
```

## Production Deployment

For a production deployment:

1. **Use HTTPS config server:**
```typescript
configServerUrl: "https://config.production.example.com"
```

2. **Enable HTTPS enforcement:**
```typescript
enforceHttps: true
```

3. **Use secrets for all credentials:**
```bash
pulumi config set --secret configServerPassword "${PROD_PASSWORD}"
```

4. **Use appropriate timeout for production:**
```typescript
timeout: 10000  // 10 seconds (default)
```

5. **Consider using a secrets manager:**

Instead of Pulumi Config, you might retrieve credentials from:
- AWS Secrets Manager
- Azure Key Vault
- HashiCorp Vault
- Google Secret Manager

Example:
```typescript
import * as aws from "@pulumi/aws";

const secret = aws.secretsmanager.getSecretVersion({
    secretId: "config-server-password",
});

const config = new ConfigServerConfig("config", {
    username: "admin",
    password: secret.then(s => s.secretString),
    // ...
});
```

## Next Steps

- Try **[Example 3: Vault-Only](../vault-only/)** to learn about property source filtering
- Try **[Example 5: Multi-Environment](../multi-environment/)** to see how to manage multiple environments
- Review the main [README.md](../../README.md) for complete API documentation

## Cleanup

```bash
pulumi destroy
pulumi stack rm dev
cd ..
docker-compose down
```
