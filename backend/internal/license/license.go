package license

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"os"
	"time"
)

type LicenseData struct {
	MachineID    string    `json:"machine_id"`
	Licensee     string    `json:"licensee"`
	ExpireAt     time.Time `json:"expire_at"`
	MaxMerchants int       `json:"max_merchants"`
	Features     []string  `json:"features"`
	IssuedAt     time.Time `json:"issued_at"`
}

type LicenseFile struct {
	Data      json.RawMessage `json:"data"`
	Signature []byte          `json:"signature"`
}

// embedded at compile time via -ldflags, see build script
var publicKeyPEM string

var cachedLicense *LicenseData

func Validate(licensePath string) (*LicenseData, error) {
	if cachedLicense != nil {
		return cachedLicense, nil
	}

	pubKey, err := getPublicKey()
	if err != nil {
		return nil, fmt.Errorf("invalid public key: %w", err)
	}

	raw, err := os.ReadFile(licensePath)
	if err != nil {
		return nil, fmt.Errorf("cannot read license file: %w", err)
	}

	var lf LicenseFile
	if err := json.Unmarshal(raw, &lf); err != nil {
		return nil, fmt.Errorf("invalid license format: %w", err)
	}

	hash := sha256.Sum256(lf.Data)
	if err := rsa.VerifyPKCS1v15(pubKey, crypto.SHA256, hash[:], lf.Signature); err != nil {
		return nil, fmt.Errorf("license signature verification failed")
	}

	var ld LicenseData
	if err := json.Unmarshal(lf.Data, &ld); err != nil {
		return nil, fmt.Errorf("invalid license data: %w", err)
	}

	machineID, err := GetMachineID()
	if err != nil {
		return nil, fmt.Errorf("cannot get machine id: %w", err)
	}
	if ld.MachineID != machineID {
		return nil, fmt.Errorf("license not bound to this machine (expected %s)", machineID)
	}

	if time.Now().After(ld.ExpireAt) {
		return nil, fmt.Errorf("license expired at %s", ld.ExpireAt.Format("2006-01-02"))
	}

	cachedLicense = &ld
	return &ld, nil
}

func GetCachedLicense() *LicenseData {
	return cachedLicense
}

func IsExpired() bool {
	if cachedLicense == nil {
		return true
	}
	return time.Now().After(cachedLicense.ExpireAt)
}

func getPublicKey() (*rsa.PublicKey, error) {
	if publicKeyPEM == "" {
		return nil, fmt.Errorf("no embedded public key")
	}
	block, _ := pem.Decode([]byte(publicKeyPEM))
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	rsaPub, ok := pub.(*rsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("not an RSA public key")
	}
	return rsaPub, nil
}

// ---- Functions for the license-tool (signing side) ----

func SignLicense(privateKeyPath string, data LicenseData) ([]byte, error) {
	keyPEM, err := os.ReadFile(privateKeyPath)
	if err != nil {
		return nil, fmt.Errorf("cannot read private key: %w", err)
	}

	block, _ := pem.Decode(keyPEM)
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	privKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}

	data.IssuedAt = time.Now()
	dataJSON, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}

	hash := sha256.Sum256(dataJSON)
	sig, err := rsa.SignPKCS1v15(rand.Reader, privKey, crypto.SHA256, hash[:])
	if err != nil {
		return nil, err
	}

	lf := LicenseFile{
		Data:      dataJSON,
		Signature: sig,
	}

	return json.MarshalIndent(lf, "", "  ")
}

func GenerateKeyPair(privatePath, publicPath string) error {
	privKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return err
	}

	privPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(privKey),
	})
	if err := os.WriteFile(privatePath, privPEM, 0600); err != nil {
		return err
	}

	pubBytes, err := x509.MarshalPKIXPublicKey(&privKey.PublicKey)
	if err != nil {
		return err
	}
	pubPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubBytes,
	})
	return os.WriteFile(publicPath, pubPEM, 0644)
}
