package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

func main() {
	// Parse command-line arguments
	mode := flag.String("mode", "", "Mode to run in: 'server' or 'client'")
	configFile := flag.String("config", "config.json", "Path to configuration file")
	flag.Parse()

	// Validate mode
	if *mode != "server" && *mode != "client" {
		fmt.Println("Error: mode must be either 'server' or 'client'")
		flag.Usage()
		os.Exit(1)
	}

	// Load configuration
	config := DefaultConfig()
	if err := loadConfig(*configFile, config); err != nil {
		fmt.Printf("Error loading configuration: %v\n", err)
		os.Exit(1)
	}

	// Create logger
	logger, err := NewLogger(config.Logging.Level, config.Logging.File)
	if err != nil {
		fmt.Printf("Error creating logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Close()

	// Run in appropriate mode
	if *mode == "server" {
		server := NewProxyServer(config, logger)
		if err := server.Start(); err != nil {
			fmt.Printf("Error starting server: %v\n", err)
			os.Exit(1)
		}

		// Keep the main goroutine alive
		select {}
	} else {
		client := NewProxyClient(config, logger)
		if err := client.Connect(); err != nil {
			fmt.Printf("Error connecting client: %v\n", err)
			os.Exit(1)
		}

		// Keep the main goroutine alive
		select {}
	}
}

// loadConfig loads configuration from a JSON file
func loadConfig(path string, config *Config) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("failed to open config file: %v", err)
	}
	defer file.Close()

	decoder := json.NewDecoder(file)
	if err := decoder.Decode(config); err != nil {
		return fmt.Errorf("failed to decode config file: %v", err)
	}

	return nil
}
