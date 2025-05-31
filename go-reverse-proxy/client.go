package main

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

// ProxyClient handles the client-side of the reverse proxy
type ProxyClient struct {
	config        *Config
	logger        *Logger
	messageBuffer *MessageBuffer
	conn          net.Conn
}

// NewProxyClient creates a new ProxyClient instance
func NewProxyClient(config *Config, logger *Logger) *ProxyClient {
	client := &ProxyClient{
		config:        config,
		logger:        logger,
		messageBuffer: NewMessageBuffer(),
	}

	client.messageBuffer.SetOnDataCallback(client.handleMessage)
	return client
}

// Connect establishes a connection to the server
func (c *ProxyClient) Connect() error {
	var err error
	addr := fmt.Sprintf("%s:%d", c.config.Client.Server.Host, c.config.Client.Server.Port)

	if c.config.Client.Server.SSL.Enabled {
		// Load CA certificate
		caCert, err := os.ReadFile(c.config.Client.Server.SSL.CA)
		if err != nil {
			return fmt.Errorf("failed to read CA certificate: %v", err)
		}

		caCertPool := x509.NewCertPool()
		if !caCertPool.AppendCertsFromPEM(caCert) {
			return fmt.Errorf("failed to append CA certificate")
		}

		tlsConfig := &tls.Config{
			RootCAs:            caCertPool,
			InsecureSkipVerify: !c.config.Client.Server.SSL.RejectUnauthorized,
		}

		c.conn, err = tls.Dial("tcp", addr, tlsConfig)
	} else {
		c.conn, err = net.Dial("tcp", addr)
	}

	if err != nil {
		return fmt.Errorf("failed to connect to server: %v", err)
	}

	c.logger.Info("socket", "Connected to server", map[string]interface{}{
		"address": addr,
	})

	go c.readLoop()
	return nil
}

// readLoop continuously reads data from the server
func (c *ProxyClient) readLoop() {
	buffer := make([]byte, 4096)
	for {
		n, err := c.conn.Read(buffer)
		if err != nil {
			if err != io.EOF {
				c.logger.Error("socket", "Error reading from server", map[string]interface{}{
					"error": err.Error(),
				})
			}
			c.reconnect()
			return
		}

		c.messageBuffer.Consume(buffer[:n])
	}
}

// reconnect attempts to reconnect to the server
func (c *ProxyClient) reconnect() {
	for {
		c.logger.Warn("socket", "Connection lost, attempting to reconnect", nil)
		time.Sleep(time.Duration(c.config.Reconnection.Delay) * time.Millisecond)

		if err := c.Connect(); err == nil {
			c.logger.Info("socket", "Reconnected to server", nil)
			return
		}
	}
}

// applyRewriteRules applies URL rewriting rules
func (c *ProxyClient) applyRewriteRules(requestURL string) string {
	finalURL := requestURL

	for _, rule := range c.config.Client.Proxy.RewriteRules {
		regex := regexp.MustCompile(rule.Pattern)
		if regex.MatchString(finalURL) {
			finalURL = regex.ReplaceAllString(finalURL, rule.Replacement)
			c.logger.Debug("proxy", "URL rewritten", map[string]interface{}{
				"original":  requestURL,
				"rewritten": finalURL,
				"rule":      rule.Pattern,
			})
			break
		}
	}

	return finalURL
}

// handleMessage processes messages from the server
func (c *ProxyClient) handleMessage(data []byte) {
	var request map[string]interface{}
	if err := json.Unmarshal(data, &request); err != nil {
		c.logger.Error("message", "Failed to unmarshal message", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	// Parse the request URL
	targetURL := request["url"].(string)
	if !strings.HasPrefix(targetURL, "http://") && !strings.HasPrefix(targetURL, "https://") {
		targetURL = c.config.Client.Proxy.DefaultTarget + targetURL
		c.logger.Debug("proxy", "Relative URL converted to absolute", map[string]interface{}{
			"relative": request["url"],
			"absolute": targetURL,
		})
	}

	// Apply URL rewriting rules
	targetURL = c.applyRewriteRules(targetURL)

	// Parse the target URL
	_, err := url.Parse(targetURL)
	if err != nil {
		c.logger.Error("proxy", "Failed to parse URL", map[string]interface{}{
			"error": err.Error(),
			"url":   targetURL,
		})
		return
	}

	// Create HTTP request
	httpReq, err := http.NewRequest(
		request["method"].(string),
		targetURL,
		strings.NewReader(request["body"].(string)),
	)
	if err != nil {
		c.logger.Error("proxy", "Failed to create HTTP request", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	// Set headers
	headers := request["headers"].(map[string]interface{})
	for key, value := range headers {
		switch v := value.(type) {
		case string:
			httpReq.Header.Set(key, v)
		case []interface{}:
			// If it's a slice, join all values with comma
			strValues := make([]string, len(v))
			for i, val := range v {
				strValues[i] = fmt.Sprint(val)
			}
			httpReq.Header.Set(key, strings.Join(strValues, ", "))
		default:
			// For any other type, convert to string
			httpReq.Header.Set(key, fmt.Sprint(v))
		}
	}

	// Remove host header to avoid conflicts
	// httpReq.Header.Del("Host")

	// Create HTTP client with appropriate transport
	client := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: !c.config.Client.Proxy.SSL.RejectUnauthorized,
			},
		},
	}

	// Send request
	resp, err := client.Do(httpReq)
	if err != nil {
		c.logger.Error("proxy", "Failed to send request", map[string]interface{}{
			"error": err.Error(),
			"url":   targetURL,
		})

		// Send error response back to server
		errorResponse := map[string]interface{}{
			"type":       "response",
			"clientId":   request["clientId"],
			"requestId":  request["requestId"],
			"statusCode": 500,
			"headers":    map[string]string{},
			"body":       base64.StdEncoding.EncodeToString([]byte("Internal Server Error")),
		}

		jsonData, _ := json.Marshal(errorResponse)
		c.conn.Write(c.messageBuffer.Produce(jsonData))
		return
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.logger.Error("proxy", "Failed to read response body", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}
	// fmt.Print(resp)
	// Convert headers to map
	headers = make(map[string]interface{})

	for key, values := range resp.Header {
		// Store all values for the header
		headers[key] = values
	}

	// Create response message
	response := map[string]interface{}{
		"type":       "response",
		"clientId":   request["clientId"],
		"requestId":  request["requestId"],
		"statusCode": resp.StatusCode,
		"headers":    headers,
		"body":       base64.StdEncoding.EncodeToString(body),
	}

	// Send response back to server
	jsonData, err := json.Marshal(response)
	if err != nil {
		c.logger.Error("proxy", "Failed to marshal response", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	_, err = c.conn.Write(c.messageBuffer.Produce(jsonData))
	if err != nil {
		c.logger.Error("proxy", "Failed to send response to server", map[string]interface{}{
			"error": err.Error(),
		})
	}
}
