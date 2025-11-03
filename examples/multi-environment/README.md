# Example 5: Multi-Environment Configuration

This example demonstrates how to manage multiple environments (development, staging, production) using Pulumi stacks with Spring Cloud Config Server profiles. This is a fundamental pattern for real-world infrastructure management.

## What This Example Demonstrates

- **Stack-based environments** (dev, staging, prod)
- **Dynamic profile selection** based on stack name
- **Environment-specific configuration** from config server
- **Conditional logic** based on environment
- **Environment-specific resource sizing**
- Best practices for multi-environment IaC

## The Multi-Environment Pattern

```
Pulumi Stack    →    Spring Profile    →    Configuration File
─────────────────────────────────────────────────────────────────
dev             →    dev                →    multi-env-app-dev.yml
staging         →    staging            →    multi-env-app-staging.yml
prod            →    prod               →    multi-env-app-prod.yml
```

## Use Case

Organizations typically have multiple environments:

- **Development** - For active development and testing
- **Staging** - Pre-production testing and QA
- **Production** - Live customer-facing environment

Each environment needs different configuration:
- Different database endpoints
- Different API keys and secrets
- Different resource sizes (smaller in dev, larger in prod)
- Different feature flags
- Different logging levels

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

### 3. Create and Test Multiple Stacks

Create stacks for each environment:

```bash
# Development environment
pulumi stack init dev
pulumi preview

# Staging environment
pulumi stack init staging
pulumi preview

# Production environment
pulumi stack init prod
pulumi preview
```

### 4. Switch Between Environments

```bash
# Work with development
pulumi stack select dev
pulumi up

# Work with staging
pulumi stack select staging
pulumi up

# Work with production
pulumi stack select prod
pulumi up
```

## How It Works

### 1. Stack Name Detection

```typescript
const stack = pulumi.getStack();
// Returns: "dev", "staging", or "prod"
```

### 2. Profile Mapping

```typescript
const profileMap: Record<string, string> = {
    "dev": "dev",
    "development": "dev",
    "staging": "staging",
    "stage": "staging",
    "prod": "prod",
    "production": "prod",
};

const profile = profileMap[stack] || "dev";
```

This allows flexibility in stack naming while maintaining consistent profiles.

### 3. Dynamic Configuration Fetching

```typescript
const config = new ConfigServerConfig("multi-env-config", {
    configServerUrl: "http://localhost:8888",
    application: "multi-env-app",
    profile: profile,  // Automatically changes per stack!
});
```

## Configuration Per Environment

### Development (`multi-env-app-dev.yml`)

```yaml
app:
  environment: "development"

server:
  port: 3000

database:
  host: "dev-db.local"
  maxConnections: 10

api:
  external:
    endpoint: "https://api-dev.example.com"
    timeout: 60000

logging:
  level:
    root: "DEBUG"

features:
  enableDebugMode: true
  enableHotReload: true
  enableMockData: true
```

**Characteristics:**
- Debug logging enabled
- Mock data for testing
- Smaller resource limits
- Development API endpoints

### Staging (`multi-env-app-staging.yml`)

```yaml
app:
  environment: "staging"

server:
  port: 8080

database:
  host: "staging-db.example.com"
  maxConnections: 25

api:
  external:
    endpoint: "https://api-staging.example.com"
    timeout: 30000

logging:
  level:
    root: "INFO"

features:
  enableDebugMode: false
  enableHotReload: false
  enableMockData: false
  enablePerformanceMonitoring: true
```

**Characteristics:**
- INFO-level logging
- Performance monitoring enabled
- Medium resource limits
- Staging API endpoints

### Production (`multi-env-app-prod.yml`)

```yaml
app:
  environment: "production"

server:
  port: 8080

database:
  host: "prod-db.example.com"
  maxConnections: 100
  ssl:
    enabled: true

api:
  external:
    endpoint: "https://api.example.com"
    timeout: 10000

logging:
  level:
    root: "WARN"

features:
  enableDebugMode: false
  enablePerformanceMonitoring: true
  enableAdvancedSecurity: true

backup:
  enabled: true
  retentionDays: 30
```

**Characteristics:**
- WARN-level logging (less verbose)
- Advanced security features
- Larger resource limits
- Production API endpoints
- Backups enabled

## Expected Output Per Environment

### Development Stack

```bash
pulumi stack select dev
pulumi up
```

```
Outputs:
    apiEndpoint              : "https://api-dev.example.com"
    databaseHost             : "dev-db.local"
    databaseMaxConnections   : "10"
    deploymentMode           : "development-mode"
    environment              : "development"
    featuresDebugMode        : true
    logLevel                 : "DEBUG"
    selectedProfile          : "dev"
    serverPort               : "3000"
    shouldEnableBackups      : false
    shouldEnableDebug        : true
```

### Staging Stack

```bash
pulumi stack select staging
pulumi up
```

```
Outputs:
    apiEndpoint              : "https://api-staging.example.com"
    databaseHost             : "staging-db.example.com"
    databaseMaxConnections   : "25"
    deploymentMode           : "staging-mode"
    environment              : "staging"
    featuresDebugMode        : false
    logLevel                 : "INFO"
    selectedProfile          : "staging"
    serverPort               : "8080"
    shouldEnableBackups      : false
    shouldEnableDebug        : false
```

### Production Stack

```bash
pulumi stack select prod
pulumi up
```

```
Outputs:
    apiEndpoint              : "https://api.example.com"
    databaseHost             : "prod-db.example.com"
    databaseMaxConnections   : "100"
    deploymentMode           : "production-mode"
    environment              : "production"
    featuresDebugMode        : false
    logLevel                 : "WARN"
    selectedProfile          : "prod"
    serverPort               : "8080"
    shouldEnableBackups      : true
    shouldEnableDebug        : false
```

## Conditional Resource Creation

### Example 1: Enable Backups Only in Production

```typescript
const shouldEnableBackups = pulumi.output(profile).apply(p => p === "prod");

// Use in resource creation
if (shouldEnableBackups) {
    new aws.backup.Plan("backup-plan", { ... });
}
```

### Example 2: Different Instance Types Per Environment

```typescript
const instanceType = pulumi.output(profile).apply(p => {
    switch (p) {
        case "dev": return "t3.micro";
        case "staging": return "t3.small";
        case "prod": return "t3.large";
        default: return "t3.micro";
    }
});

new aws.ec2.Instance("app-server", {
    instanceType: instanceType,
    // ...
});
```

### Example 3: Replica Count Based on Environment

```typescript
const replicaCount = pulumi.output(profile).apply(p => {
    switch (p) {
        case "dev": return 1;
        case "staging": return 2;
        case "prod": return 5;
        default: return 1;
    }
});
```

## Stack-Specific Configuration

You can also use `Pulumi.<stack>.yaml` files for stack-specific overrides:

### `Pulumi.dev.yaml`

```yaml
config:
  aws:region: us-west-2
  multi-environment-example:debug: "true"
```

### `Pulumi.staging.yaml`

```yaml
config:
  aws:region: us-east-1
  multi-environment-example:debug: "false"
```

### `Pulumi.prod.yaml`

```yaml
config:
  aws:region: us-east-1
  multi-environment-example:debug: "false"
  multi-environment-example:backups: "true"
```

Access in code:

```typescript
const config = new pulumi.Config();
const debug = config.getBoolean("debug") || false;
const backupsEnabled = config.getBoolean("backups") || false;
```

## Real-World Usage Patterns

### Pattern 1: Promote Through Environments

```bash
# 1. Develop in dev
pulumi stack select dev
pulumi up

# 2. Test changes, then promote to staging
pulumi stack select staging
pulumi up

# 3. After QA approval, promote to production
pulumi stack select prod
pulumi up
```

### Pattern 2: Environment-Specific Secrets

```bash
# Development secrets
pulumi stack select dev
pulumi config set --secret dbPassword "dev-password"

# Staging secrets
pulumi stack select staging
pulumi config set --secret dbPassword "staging-password"

# Production secrets
pulumi stack select prod
pulumi config set --secret dbPassword "prod-super-secret-password"
```

### Pattern 3: Different Config Servers Per Environment

```typescript
const configServerUrl = pulumi.output(profile).apply(p => {
    switch (p) {
        case "dev":
            return "http://localhost:8888";
        case "staging":
            return "https://config-staging.example.com";
        case "prod":
            return "https://config.example.com";
        default:
            return "http://localhost:8888";
    }
});

const config = new ConfigServerConfig("config", {
    configServerUrl: configServerUrl,
    // ...
});
```

## Best Practices

### 1. Consistent Naming

Use consistent stack names across projects:
- `dev`, `staging`, `prod`
- NOT: `development`, `test`, `production` (unless you update the mapping)

### 2. Separate State Backends

For production, use separate state backends:

```bash
# Development: local state
pulumi stack select dev

# Production: encrypted cloud state
pulumi stack select prod --secrets-provider="awskms://..."
```

### 3. Environment Validation

Add validation to prevent mistakes:

```typescript
const validEnvironments = ["dev", "staging", "prod"];
if (!validEnvironments.includes(profile)) {
    throw new Error(`Invalid profile: ${profile}. Must be one of ${validEnvironments.join(", ")}`);
}
```

### 4. Resource Tagging

Always tag resources with environment:

```typescript
const tags = {
    Environment: profile,
    Stack: stack,
    ManagedBy: "Pulumi",
};
```

### 5. Cost Management

- Use smaller instances in dev/staging
- Enable auto-shutdown for dev instances
- Monitor costs per environment

## Troubleshooting

### Wrong Configuration Loaded

Verify the current stack:

```bash
pulumi stack ls
pulumi stack
```

The active stack is marked with `*`.

### Profile Not Found

Check config server has the profile:

```bash
curl http://localhost:8888/multi-env-app/dev
curl http://localhost:8888/multi-env-app/staging
curl http://localhost:8888/multi-env-app/prod
```

### Stack Confusion

List all stacks and their last update:

```bash
pulumi stack ls
```

Switch to the correct stack:

```bash
pulumi stack select <stack-name>
```

## Comparing Environments

View differences between environments:

```bash
# Compare dev and prod outputs
diff <(pulumi stack output --stack dev --json) <(pulumi stack output --stack prod --json)

# View specific output across all stacks
pulumi stack output databaseHost --stack dev
pulumi stack output databaseHost --stack staging
pulumi stack output databaseHost --stack prod
```

## Cleanup

Remove all stacks:

```bash
# Destroy each environment
pulumi stack select dev
pulumi destroy
pulumi stack rm dev

pulumi stack select staging
pulumi destroy
pulumi stack rm staging

pulumi stack select prod
pulumi destroy
pulumi stack rm prod

# Stop config server
cd ..
docker-compose down
```

## Advanced: CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy to Environment

on:
  push:
    branches:
      - main  # Production
      - develop  # Development

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: pulumi/actions@v3
        with:
          command: up
          stack-name: ${{ github.ref == 'refs/heads/main' && 'prod' || 'dev' }}
        env:
          PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
```

## Next Steps

- Combine with **[Example 4: Complete AWS](../complete/)** for multi-environment AWS infrastructure
- Add environment-specific CI/CD pipelines
- Implement blue-green deployments per environment
- Set up cross-environment promotion workflows

## Related Documentation

- [Pulumi Stacks](https://www.pulumi.com/docs/intro/concepts/stack/)
- [Spring Cloud Config Profiles](https://docs.spring.io/spring-cloud-config/docs/current/reference/html/#_spring_profiles)
- [Pulumi Stack Configuration](https://www.pulumi.com/docs/intro/concepts/config/)
