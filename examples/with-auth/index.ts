import * as pulumi from "@pulumi/pulumi";
import { ConfigServerConfig } from "@egulatee/pulumi-spring-cloud-config";

// Get Pulumi configuration for this stack
const pulumiConfig = new pulumi.Config();

// Retrieve credentials from Pulumi Config
// These should be set using:
//   pulumi config set configServerUsername admin
//   pulumi config set --secret configServerPassword secret123
const username = pulumiConfig.require("configServerUsername");
const password = pulumiConfig.requireSecret("configServerPassword");

// Create a ConfigServerConfig resource with authentication
const config = new ConfigServerConfig("auth-config", {
    // Config server URL
    // NOTE: Using HTTP here because we're running locally for testing.
    // In production, ALWAYS use HTTPS!
    configServerUrl: "http://localhost:8888",

    // Application and profile
    application: "auth-app",
    profile: "production",

    // Basic Authentication credentials
    // password is already a pulumi.Output<string> from requireSecret()
    username: username,
    password: password,

    // Optional: Enable HTTPS enforcement for production
    // This will cause an error if the URL is HTTP (except for localhost)
    // enforceHttps: true,

    // Optional: Enable debug logging to see requests
    // debug: true,
});

// Export the full configuration (secrets will be automatically marked)
export const configResponse = config.config;

// Access database credentials (automatically detected as secrets)
export const databaseUsername = config.getProperty("database.username");
export const databasePassword = config.getProperty("database.password");

// Access API credentials (automatically detected as secrets)
export const apiKey = config.getProperty("api.external.apiKey");

// Access encryption keys (automatically detected as secrets)
export const encryptionKey = config.getProperty("encryption.key");
export const jwtSecret = config.getProperty("security.jwt.secret");

// Access non-sensitive configuration
export const serverPort = config.getProperty("server.port");
export const appTitle = config.getProperty("app.title");
export const databaseHost = config.getProperty("database.host");

// Demonstrate manually marking a property as secret
// (even though it's already auto-detected as a secret)
export const explicitSecret = config.getProperty("security.jwt.secret", true);

// Demonstrate preventing auto-detection for a specific property
// (use with caution - only if you're sure it's not sensitive)
export const notASecret = config.getProperty("database.password", false);

// Example: Build a database connection string using secrets
// The result will be marked as a secret because it includes secret values
export const databaseUrl = pulumi.all([
    config.getProperty("database.host"),
    config.getProperty("database.username"),
    config.getProperty("database.password"),
    config.getProperty("database.name"),
]).apply(([host, user, pass, dbName]) =>
    `postgresql://${user}:${pass}@${host}:5432/${dbName}`
);

// Example: Create a configuration object for an application
// Properties containing secrets will be automatically marked
export const appConfig = pulumi.all([
    config.getProperty("app.title"),
    config.getProperty("database.host"),
    config.getProperty("database.password"),
    config.getProperty("api.external.apiKey"),
]).apply(([title, dbHost, dbPass, apiKey]) => ({
    application: title,
    database: {
        host: dbHost,
        password: dbPass,  // This will be marked as a secret
    },
    api: {
        key: apiKey,  // This will be marked as a secret
    }
}));

// Export count of properties that were auto-detected as secrets
export const secretCount = config.properties.apply(props => {
    const secretPattern = /password|secret|token|.*key$|credential|auth|api[_-]?key/i;
    return Object.keys(props).filter(key => secretPattern.test(key)).length;
});

// Security best practices summary
export const securityNotes = {
    authentication: "Using Basic Auth with username/password from Pulumi Config",
    credentialStorage: "Credentials stored securely using pulumi config --secret",
    secretDetection: "Automatic secret detection enabled (default)",
    secretsMarked: "All properties matching secret patterns are automatically marked as secrets",
    httpsRecommendation: "Use HTTPS in production (enforceHttps: true)",
    productionReady: "This configuration follows security best practices"
};
