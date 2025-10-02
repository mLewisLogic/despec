# Error Message Style Guide

## Format

Error messages should follow the pattern:

```text
<context>: <problem> [<suggestion>]
```

## Examples

### Good Error Messages

- `lock acquisition failed: process 1234 holds lock (try 'xdd unlock --force')`
- `metadata validation failed: name must be 1-100 characters`
- `network request to OpenRouter failed: connection timeout (check your internet connection)`
- `specification not found: .xdd directory does not exist (run 'xdd init' first)`
- `WebSocket connection failed: specification locked by CLI process 5678`

### Bad Error Messages

- `Error: could not acquire lock` (no context or suggestion)
- `invalid input` (too vague)
- `Error` (useless)
- `Something went wrong` (no information)

## Guidelines

1. **Be specific**: Include what operation failed
2. **Explain why**: State the reason for failure
3. **Suggest action**: When possible, tell the user how to fix it
4. **Use lowercase**: Start with lowercase unless it's a proper noun
5. **No redundant "Error:"**: The fact it's an error is implicit

## Error Context by Component

- **Lock errors**: Include PID, interface type, and age
- **Validation errors**: Include field name and constraint violated
- **Network errors**: Include URL and HTTP status if available
- **LLM errors**: Include task name and retry count
- **File errors**: Include file path and permission issue
