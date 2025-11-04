---
name: Bug Report
about: Report a bug or unexpected behavior
title: '[BUG] '
labels: bug
assignees: ''
---

## Bug Description

A clear and concise description of what the bug is.

## Steps to Reproduce

1. Go to '...'
2. Configure '...'
3. Run '...'
4. See error

## Expected Behavior

A clear and concise description of what you expected to happen.

## Actual Behavior

A clear and concise description of what actually happened.

## Environment

- **OS**: [e.g., macOS 13.0, Ubuntu 22.04, Windows 11]
- **Node.js version**: [e.g., 18.17.0]
- **Pulumi version**: [e.g., 3.85.0]
- **Package version**: [e.g., 1.2.0]
- **Spring Cloud Config Server version**: [e.g., 4.0.0]

## Configuration

Provide relevant configuration (remove sensitive data):

```typescript
const config = new ConfigServerConfig("my-config", {
  configServerUrl: "https://config-server.example.com",
  application: "my-app",
  profile: "production",
  // ... other config
});
```

## Error Messages

```
Paste any error messages or stack traces here
```

## Additional Context

Add any other context about the problem here (screenshots, logs, related issues, etc.).

## Possible Solution

If you have suggestions on how to fix the bug, please describe them here.
