import * as pulumi from "@pulumi/pulumi";
import { ConfigServerConfig } from "@egulatee/pulumi-spring-cloud-config";

// Create a ConfigServerConfig resource to fetch configuration
// from the Spring Cloud Config Server
const config = new ConfigServerConfig("basic-config", {
    // Config server URL (running locally via Docker Compose)
    configServerUrl: "http://localhost:8888",

    // Application name (matches basic-app.yml in config-repo)
    application: "basic-app",

    // Profile to use (matches basic-app-development.yml)
    profile: "development",

    // Optional: specify Git branch/tag (null = default branch)
    label: undefined,
});

// Export the full configuration response
export const configResponse = config.config;

// Export the flattened properties for easy access
export const allProperties = config.properties;

// Access individual properties using getProperty()
// The result is a Pulumi Output that can be exported directly
export const serverPort = config.getProperty("server.port");
export const databaseHost = config.getProperty("database.host");
export const appTitle = config.getProperty("app.title");

// Demonstrate using .apply() to work with property values
export const databaseUrl = config.getProperty("database.host").apply(host => {
    const port = 5432; // Could also fetch this from config
    const dbName = "basic_db_dev"; // From our config
    return `postgresql://${host}:${port}/${dbName}`;
});

// Access nested properties
export const enableCache = config.getProperty("features.enableCache");
export const enableTracing = config.getProperty("features.enableTracing");

// Demonstrate property overriding:
// database.host from basic-app.yml is "localhost"
// but basic-app-development.yml overrides it to "dev-db.example.com"
// The development profile takes precedence
export const environmentNote = pulumi.interpolate`Running in ${config.getProperty("app.environment")} environment`;

// Example: Construct a configuration summary
export const configSummary = pulumi.all([
    config.getProperty("app.title"),
    config.getProperty("app.environment"),
    config.getProperty("database.host"),
]).apply(([title, env, dbHost]) => ({
    application: title,
    environment: env,
    databaseHost: dbHost,
    note: "Configuration successfully fetched from Spring Cloud Config Server"
}));
