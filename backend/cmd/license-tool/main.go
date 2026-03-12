package main

import (
	"flag"
	"fmt"
	"os"
	"time"

	"xinipay/internal/license"
)

func main() {
	genKeys := flag.Bool("genkeys", false, "Generate RSA key pair")
	sign := flag.Bool("sign", false, "Sign a license file")
	privKeyPath := flag.String("key", "private.pem", "Path to RSA private key")
	machineID := flag.String("machine", "", "Machine ID to bind")
	licensee := flag.String("licensee", "", "Licensee name")
	days := flag.Int("days", 365, "License validity in days")
	maxMerchants := flag.Int("merchants", 100, "Max merchants allowed")
	output := flag.String("out", "license.enc", "Output license file path")

	flag.Parse()

	if *genKeys {
		doGenerateKeys()
		return
	}

	if *sign {
		doSign(*privKeyPath, *machineID, *licensee, *days, *maxMerchants, *output)
		return
	}

	flag.Usage()
}

func doGenerateKeys() {
	if err := license.GenerateKeyPair("private.pem", "public.pem"); err != nil {
		fmt.Fprintf(os.Stderr, "Error generating keys: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Key pair generated:")
	fmt.Println("  private.pem  (KEEP SECRET - never deploy to client)")
	fmt.Println("  public.pem   (embed into binary at build time)")
}

func doSign(privKeyPath, machineID, licensee string, days, maxMerchants int, output string) {
	if machineID == "" {
		fmt.Fprintln(os.Stderr, "Error: --machine is required")
		os.Exit(1)
	}
	if licensee == "" {
		licensee = "Customer"
	}

	data := license.LicenseData{
		MachineID:    machineID,
		Licensee:     licensee,
		ExpireAt:     time.Now().AddDate(0, 0, days),
		MaxMerchants: maxMerchants,
		Features:     []string{"full"},
	}

	result, err := license.SignLicense(privKeyPath, data)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error signing license: %v\n", err)
		os.Exit(1)
	}

	if err := os.WriteFile(output, result, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "Error writing license file: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("License signed successfully:\n")
	fmt.Printf("  Machine:  %s\n", machineID)
	fmt.Printf("  Licensee: %s\n", licensee)
	fmt.Printf("  Expires:  %s\n", data.ExpireAt.Format("2006-01-02"))
	fmt.Printf("  Output:   %s\n", output)
}
