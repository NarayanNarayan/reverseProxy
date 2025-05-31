package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sync"
	"time"
)

// LogLevel represents the severity level of a log message
type LogLevel string

const (
	DebugLevel LogLevel = "debug"
	InfoLevel  LogLevel = "info"
	WarnLevel  LogLevel = "warn"
	ErrorLevel LogLevel = "error"
)

// Logger handles logging functionality
type Logger struct {
	level     LogLevel
	file      *os.File
	mu        sync.Mutex
	levelMap  map[LogLevel]int
}

// NewLogger creates a new Logger instance
func NewLogger(level string, filePath string) (*Logger, error) {
	file, err := os.OpenFile(filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}

	levelMap := map[LogLevel]int{
		DebugLevel: 0,
		InfoLevel:  1,
		WarnLevel:  2,
		ErrorLevel: 3,
	}

	return &Logger{
		level:    LogLevel(level),
		file:     file,
		levelMap: levelMap,
	}, nil
}

// Close closes the logger's file
func (l *Logger) Close() error {
	return l.file.Close()
}

// log writes a log message with the given level and context
func (l *Logger) log(level LogLevel, category string, message string, context map[string]interface{}) {
	if l.levelMap[level] < l.levelMap[l.level] {
		return
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	logEntry := map[string]interface{}{
		"timestamp": time.Now().Format(time.RFC3339),
		"level":     level,
		"category":  category,
		"message":   message,
	}

	if context != nil {
		for k, v := range context {
			logEntry[k] = v
		}
	}

	jsonData, err := json.Marshal(logEntry)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error marshaling log entry: %v\n", err)
		return
	}

	output := fmt.Sprintf("%s\n", string(jsonData))
	if _, err := io.WriteString(l.file, output); err != nil {
		fmt.Fprintf(os.Stderr, "Error writing to log file: %v\n", err)
	}
}

// Debug logs a debug message
func (l *Logger) Debug(category string, message string, context map[string]interface{}) {
	l.log(DebugLevel, category, message, context)
}

// Info logs an info message
func (l *Logger) Info(category string, message string, context map[string]interface{}) {
	l.log(InfoLevel, category, message, context)
}

// Warn logs a warning message
func (l *Logger) Warn(category string, message string, context map[string]interface{}) {
	l.log(WarnLevel, category, message, context)
}

// Error logs an error message
func (l *Logger) Error(category string, message string, context map[string]interface{}) {
	l.log(ErrorLevel, category, message, context)
} 