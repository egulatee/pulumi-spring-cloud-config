# Pulumi Spring Cloud Config Examples

This directory contains working examples demonstrating different use cases and features of the `@egulatee/pulumi-spring-cloud-config` package.

## Prerequisites

- **Node.js** >= 18.0.0
- **Pulumi CLI** >= 3.0.0
- **Docker** and **Docker Compose** (for running the test config server)
- **AWS CLI** configured (for Example 4 only)

## Quick Start

### 1. Start the Config Server

All examples use a shared Spring Cloud Config Server for testing:

```bash
cd examples
docker-compose up -d
```

Wait for the config server to be healthy:

```bash
docker-compose ps
# Wait until config-server shows "healthy"
```

The config server will be available at `http://localhost:8888` with:
- **Username**: `admin`
- **Password**: `secret123`

### 2. Stop the Config Server

When you're done with the examples:

```bash
docker-compose down
```

## Available Examples

### [Example 1: Basic Usage](./basic/)

Minimal example demonstrating:
- Simple configuration fetching
- Basic property access
- Output unwrapping with `.apply()`

**Run it:**
```bash
cd basic
npm install
pulumi stack init dev
pulumi preview
```

### [Example 2: With Authentication](./with-auth/)

Production-ready example demonstrating:
- Basic Authentication with config server
- Secure credential storage using Pulumi Config
- HTTPS enforcement
- Secret handling best practices

**Run it:**
```bash
cd with-auth
npm install
pulumi stack init dev
pulumi config set configServerUsername admin
pulumi config set --secret configServerPassword secret123
pulumi preview
```

### [Example 3: Vault-Only Configuration](./vault-only/)

Property source filtering example demonstrating:
- Filtering to specific property sources (simulating Vault)
- `getSourceProperties()` method usage
- `getAllSecrets()` method for secret extraction
- Automatic secret detection

**Run it:**
```bash
cd vault-only
npm install
pulumi stack init dev
pulumi preview
```

### [Example 4: Complete AWS Infrastructure](./complete/)

Real-world production scenario demonstrating:
- Full AWS infrastructure deployment
- RDS PostgreSQL with config-sourced credentials
- ECS Fargate service with environment variables from config
- AWS Secrets Manager integration
- VPC, security groups, IAM roles

**Note:** This example will create real AWS resources that may incur costs.

**Run it:**
```bash
cd complete
npm install
pulumi stack init dev
pulumi config set aws:region us-east-1
pulumi preview
pulumi up  # WARNING: Creates real AWS resources
```

### [Example 5: Multi-Environment](./multi-environment/)

Multi-stack example demonstrating:
- Environment-specific configuration (dev/staging/prod)
- Dynamic profile selection using `pulumi.getStack()`
- Conditional logic based on stack
- Stack-specific Pulumi configuration

**Run it:**
```bash
cd multi-environment
npm install

# Create and preview each environment
pulumi stack init dev
pulumi preview

pulumi stack init staging
pulumi preview

pulumi stack init prod
pulumi preview
```

## Configuration Repository

The `config-repo/` directory contains sample YAML files served by the Spring Cloud Config Server:

- `application.yml` - Common default configuration
- `basic-app.yml` - Configuration for Example 1
- `auth-app.yml` - Configuration for Example 2 (includes secrets)
- `vault-app.yml` - Base configuration for Example 3
- `vault-app-vault.yml` - Simulated Vault secrets for Example 3
- `complete-app.yml` - Production configuration for Example 4
- `multi-env-app.yml` - Base configuration for Example 5
- `multi-env-app-dev.yml` - Development environment (Example 5)
- `multi-env-app-staging.yml` - Staging environment (Example 5)
- `multi-env-app-prod.yml` - Production environment (Example 5)

## Troubleshooting

### Config Server Not Starting

Check Docker logs:
```bash
docker-compose logs config-server
```

### Config Server Health Check

Verify the config server is running:
```bash
curl http://localhost:8888/actuator/health
```

### Authentication Errors

Test authentication manually:
```bash
curl -u admin:secret123 http://localhost:8888/basic-app/development
```

### Port Already in Use

If port 8888 is already in use, modify the `docker-compose.yml` ports mapping:
```yaml
ports:
  - "8889:8888"  # Use port 8889 instead
```

Then update examples to use `http://localhost:8889` instead.

## Learning Path

We recommend following the examples in order:

1. **Basic** - Learn the fundamentals
2. **With Auth** - Understand security and secrets
3. **Vault-Only** - Master property source filtering
4. **Multi-Environment** - Manage multiple environments
5. **Complete** - See real-world AWS integration

## Additional Resources

- [Main Package README](../README.md)
- [Spring Cloud Config Documentation](https://docs.spring.io/spring-cloud-config/docs/current/reference/html/)
- [Pulumi Documentation](https://www.pulumi.com/docs/)

## Clean Up

To remove all example resources and stop the config server:

```bash
# Stop config server
cd examples
docker-compose down -v

# Clean up each example (if you ran pulumi up)
cd basic && pulumi destroy && pulumi stack rm dev
cd ../with-auth && pulumi destroy && pulumi stack rm dev
cd ../vault-only && pulumi destroy && pulumi stack rm dev
cd ../complete && pulumi destroy && pulumi stack rm dev
cd ../multi-environment && pulumi destroy && pulumi stack rm dev
```
