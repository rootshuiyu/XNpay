package license

import (
	"crypto/sha256"
	"fmt"
	"log"
	"os"
)

// Set at compile time: go build -ldflags="-X xinipay/internal/license.expectedHash=abc123..."
var expectedHash string

func CheckIntegrity() bool {
	if expectedHash == "" {
		return true
	}

	execPath, err := os.Executable()
	if err != nil {
		log.Printf("[INTEGRITY] Cannot determine executable path: %v", err)
		return false
	}

	data, err := os.ReadFile(execPath)
	if err != nil {
		log.Printf("[INTEGRITY] Cannot read executable: %v", err)
		return false
	}

	hash := sha256.Sum256(data)
	actualHash := fmt.Sprintf("%x", hash)

	if actualHash != expectedHash {
		log.Printf("[INTEGRITY] Binary has been tampered with!")
		return false
	}

	return true
}

func GetBinaryHash() (string, error) {
	execPath, err := os.Executable()
	if err != nil {
		return "", err
	}

	data, err := os.ReadFile(execPath)
	if err != nil {
		return "", err
	}

	hash := sha256.Sum256(data)
	return fmt.Sprintf("%x", hash), nil
}
