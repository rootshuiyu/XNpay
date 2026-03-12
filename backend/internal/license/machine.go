package license

import (
	"crypto/sha256"
	"fmt"
	"net"
	"os"
	"runtime"
	"sort"
	"strings"
)

func GetMachineID() (string, error) {
	parts := []string{}

	if macs, err := getMACAddresses(); err == nil && len(macs) > 0 {
		parts = append(parts, macs...)
	}

	if hostname, err := os.Hostname(); err == nil {
		parts = append(parts, "HOST:"+hostname)
	}

	parts = append(parts, "OS:"+runtime.GOOS)
	parts = append(parts, "ARCH:"+runtime.GOARCH)

	if cpuInfo := getCPUInfo(); cpuInfo != "" {
		parts = append(parts, "CPU:"+cpuInfo)
	}

	if len(parts) == 0 {
		return "", fmt.Errorf("unable to collect machine identifiers")
	}

	sort.Strings(parts)
	raw := strings.Join(parts, "|")
	hash := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", hash[:16]), nil
}

func getMACAddresses() ([]string, error) {
	interfaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}

	var macs []string
	for _, iface := range interfaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		if iface.HardwareAddr == nil || len(iface.HardwareAddr) == 0 {
			continue
		}
		mac := iface.HardwareAddr.String()
		if mac != "" && mac != "00:00:00:00:00:00" {
			macs = append(macs, "MAC:"+mac)
		}
	}
	return macs, nil
}

func getCPUInfo() string {
	return fmt.Sprintf("%s_%d", runtime.GOARCH, runtime.NumCPU())
}
