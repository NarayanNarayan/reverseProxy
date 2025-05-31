package main

import (
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"sync"
	"time"
)

// PendingRequest holds both the request and its response writer
type PendingRequest struct {
	req  *http.Request
	res  http.ResponseWriter
	done chan bool
}

// ProxyServer handles the server-side of the reverse proxy
type ProxyServer struct {
	config          *Config
	logger          *Logger
	messageBuffer   *MessageBuffer
	clients         map[string]net.Conn
	clientsMutex    sync.RWMutex
	pendingRequests map[string]*PendingRequest
	requestsMutex   sync.RWMutex
}

// NewProxyServer creates a new ProxyServer instance
func NewProxyServer(config *Config, logger *Logger) *ProxyServer {
	server := &ProxyServer{
		config:          config,
		logger:          logger,
		messageBuffer:   NewMessageBuffer(),
		clients:         make(map[string]net.Conn),
		pendingRequests: make(map[string]*PendingRequest),
	}

	server.messageBuffer.SetOnDataCallback(server.handleMessage)
	return server
}

// Start starts the HTTP and socket servers
func (s *ProxyServer) Start() error {
	// Start HTTP server
	go func() {
		http.HandleFunc("/", s.handleHTTPRequest)
		addr := fmt.Sprintf("%s:%d", s.config.Server.HTTP.Host, s.config.Server.HTTP.Port)

		var err error
		if s.config.Server.HTTP.SSL.Enabled {
			cert, err := tls.LoadX509KeyPair(s.config.Server.HTTP.SSL.Cert, s.config.Server.HTTP.SSL.Key)
			if err != nil {
				s.logger.Error("server", "Failed to load SSL certificates", map[string]interface{}{
					"error": err.Error(),
				})
				return
			}

			tlsConfig := &tls.Config{
				Certificates: []tls.Certificate{cert},
			}

			server := &http.Server{
				Addr:      addr,
				TLSConfig: tlsConfig,
			}
			err = server.ListenAndServeTLS("", "")
		} else {
			err = http.ListenAndServe(addr, nil)
		}

		if err != nil {
			s.logger.Error("server", "HTTP server error", map[string]interface{}{
				"error": err.Error(),
			})
		}
	}()

	// Start socket server
	go func() {
		var listener net.Listener
		var err error

		addr := fmt.Sprintf("%s:%d", s.config.Server.Socket.Host, s.config.Server.Socket.Port)

		if s.config.Server.Socket.SSL.Enabled {
			cert, err := tls.LoadX509KeyPair(s.config.Server.Socket.SSL.Cert, s.config.Server.Socket.SSL.Key)
			if err != nil {
				s.logger.Error("server", "Failed to load SSL certificates", map[string]interface{}{
					"error": err.Error(),
				})
				return
			}

			tlsConfig := &tls.Config{
				Certificates: []tls.Certificate{cert},
			}

			listener, err = tls.Listen("tcp", addr, tlsConfig)
		} else {
			listener, err = net.Listen("tcp", addr)
		}

		if err != nil {
			s.logger.Error("server", "Socket server error", map[string]interface{}{
				"error": err.Error(),
			})
			return
		}

		s.logger.Info("server", "Socket server listening", map[string]interface{}{
			"address": addr,
		})

		for {
			conn, err := listener.Accept()
			if err != nil {
				s.logger.Error("server", "Failed to accept connection", map[string]interface{}{
					"error": err.Error(),
				})
				continue
			}

			go s.handleSocketConnection(conn)
		}
	}()

	return nil
}

// handleHTTPRequest handles incoming HTTP requests
func (s *ProxyServer) handleHTTPRequest(w http.ResponseWriter, r *http.Request) {
	s.clientsMutex.RLock()
	if len(s.clients) == 0 {
		s.clientsMutex.RUnlock()
		s.logger.Warn("request", "No clients available", nil)
		http.Error(w, "No clients available", http.StatusServiceUnavailable)
		return
	}
	s.clientsMutex.RUnlock()

	// Get the first available client
	s.clientsMutex.RLock()
	var clientID string
	var client net.Conn
	for id, conn := range s.clients {
		clientID = id
		client = conn
		break
	}
	s.clientsMutex.RUnlock()

	// Create a channel to wait for response
	done := make(chan bool)

	// Store the request and response writer
	requestID := fmt.Sprintf("%d", time.Now().UnixNano())
	s.requestsMutex.Lock()
	s.pendingRequests[requestID] = &PendingRequest{
		req:  r,
		res:  w,
		done: done,
	}
	s.requestsMutex.Unlock()

	// Forward the request to the client
	requestData := map[string]interface{}{
		"type":      "request",
		"clientId":  clientID,
		"requestId": requestID,
		"method":    r.Method,
		"url":       r.URL.String(),
		"headers":   r.Header,
	}

	// Read request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		s.logger.Error("request", "Failed to read request body", map[string]interface{}{
			"error": err.Error(),
		})
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	requestData["body"] = body

	// Send request to client
	jsonData, err := json.Marshal(requestData)
	if err != nil {
		s.logger.Error("request", "Failed to marshal request data", map[string]interface{}{
			"error": err.Error(),
		})
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	_, err = client.Write(s.messageBuffer.Produce(jsonData))
	if err != nil {
		s.logger.Error("request", "Failed to send request to client", map[string]interface{}{
			"error": err.Error(),
		})
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// Wait for response from client
	select {
	case <-done:
		// Response received and processed
		return
	case <-time.After(30 * time.Second):
		// Timeout after 30 seconds
		s.logger.Error("request", "Timeout waiting for client response", map[string]interface{}{
			"requestId": requestID,
		})
		http.Error(w, "Timeout waiting for client response", http.StatusGatewayTimeout)
		return
	}
}

// handleSocketConnection handles new socket connections
func (s *ProxyServer) handleSocketConnection(conn net.Conn) {
	clientID := fmt.Sprintf("%d", time.Now().UnixNano())

	s.clientsMutex.Lock()
	s.clients[clientID] = conn
	s.clientsMutex.Unlock()

	s.logger.Info("socket", "Client connected", map[string]interface{}{
		"clientId": clientID,
	})

	defer func() {
		conn.Close()
		s.clientsMutex.Lock()
		delete(s.clients, clientID)
		s.clientsMutex.Unlock()

		s.logger.Info("socket", "Client disconnected", map[string]interface{}{
			"clientId": clientID,
		})
	}()

	buffer := make([]byte, 4096)
	for {
		n, err := conn.Read(buffer)
		if err != nil {
			if err != io.EOF {
				s.logger.Error("socket", "Error reading from client", map[string]interface{}{
					"error":    err.Error(),
					"clientId": clientID,
				})
			}
			return
		}

		s.messageBuffer.Consume(buffer[:n])
	}
}

// handleMessage processes messages from clients
func (s *ProxyServer) handleMessage(data []byte) {
	var response map[string]interface{}
	if err := json.Unmarshal(data, &response); err != nil {
		s.logger.Error("message", "Failed to unmarshal message", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	requestID := response["requestId"].(string)
	s.requestsMutex.RLock()
	pendingReq, exists := s.pendingRequests[requestID]
	if exists {
		// Remove the request from pending requests
		delete(s.pendingRequests, requestID)
	}
	s.requestsMutex.RUnlock()

	if !exists {
		s.logger.Warn("message", "No matching request found", map[string]interface{}{
			"requestId": requestID,
		})
		return
	}

	// Set headers first
	headers := response["headers"].(map[string]interface{})
	for key, value := range headers {
		switch v := value.(type) {
		case string:
			pendingReq.res.Header().Set(key, v)
		case []interface{}:
			// If it's a slice, set each value
			for _, val := range v {
				pendingReq.res.Header().Add(key, fmt.Sprint(val))
			}
		default:
			// For any other type, convert to string
			pendingReq.res.Header().Set(key, fmt.Sprint(v))
		}
	}

	// Then set status code
	statusCode := int(response["statusCode"].(float64))
	pendingReq.res.WriteHeader(statusCode)

	// Write body
	if body, ok := response["body"].(string); ok {
		bodyBytes, err := base64.StdEncoding.DecodeString(body)
		if err != nil {
			s.logger.Error("message", "Failed to decode response body", map[string]interface{}{
				"error": err.Error(),
			})
			return
		}
		pendingReq.res.Write(bodyBytes)
	}

	// Signal that response is complete
	close(pendingReq.done)

	s.logger.Info("message", "Response sent to client", map[string]interface{}{
		"requestId":  requestID,
		"statusCode": statusCode,
	})
}
