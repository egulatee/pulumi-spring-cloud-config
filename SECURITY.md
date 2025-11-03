# Security Policy

## Supported Versions

The following versions of @egulatee/pulumi-spring-cloud-config are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of @egulatee/pulumi-spring-cloud-config seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: egulatee@example.com

Include the following information in your report:

- Type of vulnerability
- Full paths of source file(s) related to the vulnerability
- The location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability, including how an attacker might exploit it

### What to Expect

- You will receive an acknowledgment of your report within 48 hours
- We will send a more detailed response within 7 days indicating the next steps
- We will keep you informed of the progress towards a fix
- We may ask for additional information or guidance

### Disclosure Policy

- Security issues will be fixed as soon as possible
- A security advisory will be published after the fix is released
- Credit will be given to the reporter (unless anonymity is requested)

## Security Best Practices

When using @egulatee/pulumi-spring-cloud-config, follow these security best practices:

### 1. Always Use HTTPS in Production

```typescript
const config = new ConfigServerConfig('config', {
  configServerUrl: 'https://config-server.example.com', // ✅ HTTPS
  enforceHttps: true, // Fail if HTTP used
  // ...
});
```

### 2. Store Credentials Securely

Use Pulumi's encrypted configuration for sensitive values:

```bash
# Set encrypted secrets
pulumi config set --secret configServerPassword 'your-password'
```

```typescript
import * as pulumi from '@pulumi/pulumi';

const pulumiConfig = new pulumi.Config();

const config = new ConfigServerConfig('config', {
  username: pulumiConfig.require('configServerUsername'),
  password: pulumiConfig.requireSecret('configServerPassword'), // ✅ Encrypted
  // ...
});
```

### 3. Enable Automatic Secret Detection

```typescript
const config = new ConfigServerConfig('config', {
  autoDetectSecrets: true, // ✅ Default: enabled
  // ...
});
```

This automatically marks properties with sensitive names (password, secret, token, api_key, etc.) as Pulumi secrets.

### 4. Use Property Source Filtering

Limit configuration to specific sources:

```typescript
const config = new ConfigServerConfig('config', {
  propertySources: ['vault'], // Only fetch from Vault
  // ...
});
```

### 5. Configure Appropriate Timeouts

Prevent long-running requests that might indicate an attack:

```typescript
const config = new ConfigServerConfig('config', {
  timeout: 10000, // 10 seconds (default)
  // ...
});
```

### 6. Implement Network Security

- Use VPCs or private networks for config-server communication
- Implement firewall rules to restrict access
- Use mutual TLS (mTLS) if supported by your config-server

### 7. Keep Dependencies Updated

Dependabot is configured to automatically create pull requests for dependency updates. Review and merge these regularly to ensure you have the latest security patches.

## Known Security Considerations

### 1. Credential Exposure in Logs

By default, debug mode is disabled to prevent accidental credential exposure. When enabling debug mode:

```typescript
const config = new ConfigServerConfig('config', {
  debug: true, // Use only in development
  // ...
});
```

Ensure logs are not exposed in production environments.

### 2. Man-in-the-Middle Attacks

Always use HTTPS in production to prevent man-in-the-middle attacks. HTTP is only acceptable for localhost development.

### 3. Credential Rotation

Currently, credentials are static. For enhanced security, consider:

- Rotating credentials regularly
- Using short-lived tokens (OAuth2/JWT support planned for v0.2.0)
- Implementing credential rotation automation

## Security Checklist for Deployment

Before deploying to production:

- [ ] Config-server URL uses HTTPS
- [ ] `enforceHttps` is set to `true`
- [ ] Credentials are stored using Pulumi secrets
- [ ] `autoDetectSecrets` is enabled (default)
- [ ] Debug mode is disabled
- [ ] Network security is configured (VPC, firewall rules)
- [ ] Timeout is set appropriately
- [ ] Dependencies are up-to-date
- [ ] Access to config-server is restricted

## Security Updates

Security updates will be released as patch versions and announced through:

- GitHub Security Advisories
- Release notes
- CHANGELOG.md

Subscribe to the repository to receive notifications of security updates.

## Supported Spring Cloud Config Server Versions

We test against and support Spring Cloud Config Server 2.3.0 and later. Earlier versions may have known security vulnerabilities and should be avoided.

## Additional Resources

- [Pulumi Security Best Practices](https://www.pulumi.com/docs/guides/secrets/)
- [Spring Cloud Config Security](https://cloud.spring.io/spring-cloud-config/reference/html/#_security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

Thank you for helping keep @egulatee/pulumi-spring-cloud-config and its users safe!
