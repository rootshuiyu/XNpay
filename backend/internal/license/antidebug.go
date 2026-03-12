package license

import (
	"log"
	"os"
	"runtime"
	"strings"
	"time"
)

func StartAntiDebug() {
	go func() {
		for {
			if detectDebugger() {
				log.Printf("[SECURITY] Debugger detected, shutting down")
				os.Exit(1)
			}
			time.Sleep(10 * time.Second)
		}
	}()
}

func detectDebugger() bool {
	if detectTimingAnomaly() {
		return true
	}

	if detectDebugEnv() {
		return true
	}

	if runtime.GOOS == "linux" {
		if detectLinuxDebugger() {
			return true
		}
	}

	return false
}

func detectTimingAnomaly() bool {
	start := time.Now()
	sum := 0
	for i := 0; i < 1000000; i++ {
		sum += i
	}
	_ = sum
	elapsed := time.Since(start)
	// Under a debugger with breakpoints, simple loops take abnormally long
	return elapsed > 5*time.Second
}

func detectDebugEnv() bool {
	debugVars := []string{
		"GODEBUG",
		"DLV_LISTEN",
		"GOFLAGS",
	}
	for _, v := range debugVars {
		val := os.Getenv(v)
		if val != "" && strings.Contains(strings.ToLower(val), "debug") {
			return true
		}
	}

	if os.Getenv("DLV_LISTEN") != "" {
		return true
	}

	return false
}

func detectLinuxDebugger() bool {
	data, err := os.ReadFile("/proc/self/status")
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "TracerPid:") {
			pid := strings.TrimSpace(strings.TrimPrefix(line, "TracerPid:"))
			if pid != "0" {
				return true
			}
		}
	}
	return false
}
