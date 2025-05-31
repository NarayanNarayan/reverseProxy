# Go Reverse Proxy

A high-performance reverse proxy implementation in Go that supports client-server architecture, message buffering, and data framing. This implementation is a port of the Node.js version with the same functionality.

## Features

- Client-server architecture
- Message buffering and framing
- Support for HTTP and HTTPS
- Configurable logging
- URL rewriting rules
- Automatic reconnection
- Support for binary data and images
- Concurrent request handling

## Building

To build the project, make sure you have Go 1.16 or later installed, then run:

```bash
go build
```

This will create a single binary that can run in either server or client mode.

## Configuration

The proxy is configured using a JSON configuration file. A sample configuration file (`config.json`) is provided. The configuration includes:

- Server settings (HTTP and socket)
- Client settings
- SSL/TLS configuration
- URL rewriting rules
- Logging settings
- Reconnection settings

## Running

### Server Mode

To run the proxy in server mode:

```bash
./reverse-proxy -mode server -config config.json
```

The server will:
1. Start an HTTP server on the configured port
2. Start a socket server for client connections
3. Handle incoming HTTP requests and forward them to connected clients

### Client Mode

To run the proxy in client mode:

```bash
./reverse-proxy -mode client -config config.json
```

The client will:
1. Connect to the server
2. Receive requests from the server
3. Forward requests to the target server
4. Send responses back to the server

## SSL/TLS Support

To enable SSL/TLS:

1. Generate SSL certificates:
   - Server certificate and key
   - CA certificate for client verification

2. Update the configuration file:
   - Set `ssl.enabled` to `true`
   - Configure certificate paths
   - Set `rejectUnauthorized` as needed

## URL Rewriting

URL rewriting rules can be configured in the `config.json` file. Each rule consists of:

- `pattern`: A regular expression to match URLs
- `replacement`: The replacement pattern

Example:
```json
{
    "pattern": "^/api/(.*)",
    "replacement": "/v1/$1"
}
```

## Logging

Logging is configured in the `config.json` file:

- `level`: Log level (debug, info, warn, error)
- `file`: Path to the log file

## Error Handling

The proxy includes comprehensive error handling:

- Connection errors
- SSL/TLS errors
- Request/response errors
- Automatic reconnection for clients

## Performance Considerations

The Go implementation provides several performance benefits:

- Efficient memory usage
- Concurrent request handling
- Optimized message buffering
- Native SSL/TLS support

## Security

Security features include:

- SSL/TLS support
- Configurable certificate verification
- Header sanitization
- Request validation

## License

MIT License 