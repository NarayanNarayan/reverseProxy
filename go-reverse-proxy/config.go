package main

// Config holds all configuration settings
type Config struct {
	Server struct {
		HTTP struct {
			Host string `json:"host"`
			Port int    `json:"port"`
			SSL  struct {
				Enabled bool   `json:"enabled"`
				Key     string `json:"key"`
				Cert    string `json:"cert"`
			} `json:"ssl"`
		} `json:"http"`
		Socket struct {
			Host string `json:"host"`
			Port int    `json:"port"`
			SSL  struct {
				Enabled bool   `json:"enabled"`
				Key     string `json:"key"`
				Cert    string `json:"cert"`
			} `json:"ssl"`
		} `json:"socket"`
	} `json:"server"`
	Client struct {
		Server struct {
			Host string `json:"host"`
			Port int    `json:"port"`
			SSL  struct {
				Enabled          bool   `json:"enabled"`
				CA              string `json:"ca"`
				RejectUnauthorized bool `json:"rejectUnauthorized"`
			} `json:"ssl"`
		} `json:"server"`
		Proxy struct {
			DefaultTarget string `json:"defaultTarget"`
			SSL          struct {
				RejectUnauthorized bool `json:"rejectUnauthorized"`
			} `json:"ssl"`
			RewriteRules []struct {
				Pattern     string `json:"pattern"`
				Replacement string `json:"replacement"`
			} `json:"rewriteRules"`
		} `json:"proxy"`
	} `json:"client"`
	Reconnection struct {
		Delay int `json:"delay"`
	} `json:"reconnection"`
	Logging struct {
		Level string `json:"level"`
		File  string `json:"file"`
	} `json:"logging"`
}

// DefaultConfig returns the default configuration
func DefaultConfig() *Config {
	config := &Config{}
	
	// Server HTTP settings
	config.Server.HTTP.Host = "0.0.0.0"
	config.Server.HTTP.Port = 8080
	config.Server.HTTP.SSL.Enabled = false
	config.Server.HTTP.SSL.Key = "server.key"
	config.Server.HTTP.SSL.Cert = "server.crt"

	// Server Socket settings
	config.Server.Socket.Host = "0.0.0.0"
	config.Server.Socket.Port = 8081
	config.Server.Socket.SSL.Enabled = false
	config.Server.Socket.SSL.Key = "server.key"
	config.Server.Socket.SSL.Cert = "server.crt"

	// Client Server settings
	config.Client.Server.Host = "localhost"
	config.Client.Server.Port = 8081
	config.Client.Server.SSL.Enabled = false
	config.Client.Server.SSL.CA = "ca.crt"
	config.Client.Server.SSL.RejectUnauthorized = true

	// Client Proxy settings
	config.Client.Proxy.DefaultTarget = "http://localhost:8080"
	config.Client.Proxy.SSL.RejectUnauthorized = true

	// Reconnection settings
	config.Reconnection.Delay = 5000

	// Logging settings
	config.Logging.Level = "info"
	config.Logging.File = "proxy.log"

	return config
} 