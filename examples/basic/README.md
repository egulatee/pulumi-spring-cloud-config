# Example 1: Basic Usage

This example demonstrates the simplest use case of the `@egulatee/pulumi-spring-cloud-config` package: fetching configuration from a Spring Cloud Config Server and accessing properties in your Pulumi program.

## What This Example Demonstrates

- Creating a `ConfigServerConfig` resource
- Fetching configuration from a config server
- Accessing individual properties with `getProperty()`
- Using Pulumi Outputs and `.apply()`
- Property overriding with profiles
- Exporting configuration values

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

Wait for the config server to be healthy (about 20-30 seconds):

```bash
docker-compose ps
# Should show config-server as "healthy"
```

Verify it's working:

```bash
curl http://localhost:8888/basic-app/development
```

You should see a JSON response with configuration properties.

### 2. Install Dependencies

```bash
npm install
```

This will install:
- `@egulatee/pulumi-spring-cloud-config` (from the parent directory)
- `@pulumi/pulumi`
- TypeScript and type definitions

### 3. Initialize Pulumi Stack

```bash
pulumi stack init dev
```

### 4. Preview the Configuration

```bash
pulumi preview
```

You should see output showing the configuration being fetched and various properties being exported.

### 5. Deploy (Optional)

```bash
pulumi up
```

This doesn't create any cloud resources—it just stores the configuration values in your Pulumi state.

## What Happens

When you run `pulumi preview` or `pulumi up`, the following occurs:

1. **Connection**: Pulumi connects to the config server at `http://localhost:8888`
2. **Request**: Fetches configuration for application `basic-app` with profile `development`
3. **Response**: Config server returns merged configuration from:
   - `application.yml` (common defaults)
   - `basic-app.yml` (application-specific)
   - `basic-app-development.yml` (profile-specific, highest precedence)
4. **Property Access**: Individual properties are extracted using `getProperty()`
5. **Outputs**: Values are exported as Pulumi stack outputs

## Configuration Files

This example uses the following configuration files (in `../config-repo/`):

### `application.yml`
Common defaults shared by all applications.

### `basic-app.yml`
Base configuration for the `basic-app` application:
- `server.port`: 8080
- `database.host`: "localhost"
- `app.title`: "Basic Application"

### `basic-app-development.yml`
Development profile overrides:
- `database.host`: "dev-db.example.com" (overrides "localhost")
- `app.environment`: "development"
- Enables tracing and debug logging

## Expected Output

After running `pulumi up`, you should see stack outputs like:

```
Outputs:
    allProperties    : {
        "app.environment": "development",
        "app.title": "Basic Application",
        "database.host": "dev-db.example.com",
        "features.enableCache": true,
        "features.enableTracing": true,
        "server.port": 8080,
        ...
    }
    appTitle         : "Basic Application"
    configSummary    : {
        "application": "Basic Application",
        "databaseHost": "dev-db.example.com",
        "environment": "development",
        "note": "Configuration successfully fetched from Spring Cloud Config Server"
    }
    databaseHost     : "dev-db.example.com"
    databaseUrl      : "postgresql://dev-db.example.com:5432/basic_db_dev"
    enableCache      : true
    enableTracing    : true
    environmentNote  : "Running in development environment"
    serverPort       : 8080
```

## Code Walkthrough

### Creating the Resource

```typescript
const config = new ConfigServerConfig("basic-config", {
    configServerUrl: "http://localhost:8888",
    application: "basic-app",
    profile: "development",
});
```

This creates a resource that:
- Connects to the config server at `http://localhost:8888`
- Requests configuration for application `basic-app`
- Uses the `development` profile

### Accessing Properties

```typescript
export const serverPort = config.getProperty("server.port");
```

The `getProperty()` method:
- Returns a `pulumi.Output<string | undefined>`
- Automatically handles nested property paths (dot notation)
- Returns `undefined` if the property doesn't exist

### Working with Outputs

```typescript
export const databaseUrl = config.getProperty("database.host").apply(host => {
    return `postgresql://${host}:${port}/${dbName}`;
});
```

Use `.apply()` to transform Output values:
- The function receives the unwrapped value
- Returns a new value
- Result is automatically wrapped as an Output

### Combining Multiple Outputs

```typescript
export const configSummary = pulumi.all([
    config.getProperty("app.title"),
    config.getProperty("app.environment"),
    config.getProperty("database.host"),
]).apply(([title, env, dbHost]) => ({
    application: title,
    environment: env,
    databaseHost: dbHost,
}));
```

Use `pulumi.all()` to work with multiple Outputs together.

## Property Overriding

Notice how `database.host` changes based on the profile:

- **Base (`basic-app.yml`)**: `database.host = "localhost"`
- **Development Profile (`basic-app-development.yml`)**: `database.host = "dev-db.example.com"`

Spring Cloud Config merges configurations with later sources taking precedence, so the development profile value wins.

## Troubleshooting

### Error: ECONNREFUSED connecting to localhost:8888

The config server isn't running. Start it:

```bash
cd ..
docker-compose up -d
docker-compose ps  # Check it's healthy
```

### Error: Configuration not found (404)

Check that the configuration files exist:

```bash
ls ../config-repo/basic-app*.yml
```

### Property Returns undefined

The property name might be incorrect. Check the actual configuration:

```bash
curl http://localhost:8888/basic-app/development | jq '.propertySources[].source'
```

## Next Steps

- Try **[Example 2: With Authentication](../with-auth/)** to learn about secure config servers
- Try **[Example 3: Vault-Only](../vault-only/)** to learn about property source filtering
- Modify the configuration files in `../config-repo/` and run `pulumi refresh` to see changes

## Cleanup

```bash
# Destroy the Pulumi stack
pulumi destroy
pulumi stack rm dev

# Stop the config server
cd ..
docker-compose down
```
