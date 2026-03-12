package bot

import (
	"net/http"
	"time"

	"xinipay/internal/model"
)

const (
	BotStatusQueued     = "queued"
	BotStatusProcessing = "processing"
	BotStatusQrReady    = "qr_ready"
	BotStatusPolling    = "polling"
	BotStatusCompleted  = "completed"
	BotStatusFailed     = "failed"
)

type Session struct {
	AccountID uint
	Platform  string
	Cookies   []*http.Cookie
	UserAgent string
	ProxyAddr string
	LoginAt   time.Time
	ExpireAt  time.Time
}

type GameOrder struct {
	OrderID   string
	SerialNo  string
	Amount    float64
	Cash      int
	QrCodeURL string
	FormData  map[string]string
}

type PayStatus struct {
	Paid   bool
	Amount float64
}

type GamePlatform interface {
	Name() string
	Login(account *model.GameAccount, proxy string, ua string) (*Session, error)
	CreateOrder(session *Session, amount float64) (*GameOrder, error)
	GetQRCode(session *Session, gameOrder *GameOrder) (string, error)
	CheckPayStatus(session *Session, gameOrder *GameOrder) (*PayStatus, error)
}

var platforms = map[string]GamePlatform{}

func RegisterPlatform(p GamePlatform) {
	platforms[p.Name()] = p
}

func GetPlatform(name string) GamePlatform {
	return platforms[name]
}

func AllPlatforms() []string {
	names := make([]string, 0, len(platforms))
	for k := range platforms {
		names = append(names, k)
	}
	return names
}
