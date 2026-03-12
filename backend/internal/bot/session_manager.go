package bot

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"xinipay/internal/model"
)

type SessionManager struct {
	mu       sync.RWMutex
	sessions map[uint]*Session // accountID -> session
}

var SM = &SessionManager{
	sessions: make(map[uint]*Session),
}

func (sm *SessionManager) Get(accountID uint) *Session {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	s, ok := sm.sessions[accountID]
	if !ok || time.Now().After(s.ExpireAt) {
		return nil
	}
	return s
}

func (sm *SessionManager) Set(s *Session) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.sessions[s.AccountID] = s
	sm.persistSession(s)
}

func (sm *SessionManager) Remove(accountID uint) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	delete(sm.sessions, accountID)
	model.DB.Where("account_id = ?", accountID).Delete(&model.GameSession{})
}

func (sm *SessionManager) GetOrLogin(account *model.GameAccount, platform GamePlatform) (*Session, error) {
	if s := sm.Get(account.ID); s != nil {
		return s, nil
	}

	proxy := ProxyPool.Next()
	ua := randomUA()

	s, err := platform.Login(account, proxy, ua)
	if err != nil {
		sm.recordFailedSession(account.ID, platform.Name(), err.Error())
		return nil, err
	}

	sm.Set(s)
	return s, nil
}

func (sm *SessionManager) persistSession(s *Session) {
	cookiesJSON, _ := json.Marshal(s.Cookies)

	gs := model.GameSession{}
	result := model.DB.Where("account_id = ?", s.AccountID).First(&gs)
	if result.Error != nil {
		gs = model.GameSession{
			AccountID: s.AccountID,
			Platform:  s.Platform,
			Cookies:   string(cookiesJSON),
			UserAgent: s.UserAgent,
			Status:    model.SessionStatusActive,
			ProxyAddr: s.ProxyAddr,
			LoginAt:   s.LoginAt,
			ExpireAt:  &s.ExpireAt,
		}
		model.DB.Create(&gs)
	} else {
		model.DB.Model(&gs).Updates(map[string]interface{}{
			"cookies":    string(cookiesJSON),
			"user_agent": s.UserAgent,
			"status":     model.SessionStatusActive,
			"proxy_addr": s.ProxyAddr,
			"login_at":   s.LoginAt,
			"expire_at":  &s.ExpireAt,
		})
	}
}

func (sm *SessionManager) recordFailedSession(accountID uint, platform, errMsg string) {
	gs := model.GameSession{}
	result := model.DB.Where("account_id = ?", accountID).First(&gs)
	if result.Error != nil {
		gs = model.GameSession{
			AccountID: accountID,
			Platform:  platform,
			Status:    model.SessionStatusFailed,
			ErrorMsg:  errMsg,
			LoginAt:   time.Now(),
		}
		model.DB.Create(&gs)
	} else {
		model.DB.Model(&gs).Updates(map[string]interface{}{
			"status":    model.SessionStatusFailed,
			"error_msg": errMsg,
		})
	}
}

func (sm *SessionManager) LoadFromDB() {
	var sessions []model.GameSession
	model.DB.Where("status = ?", model.SessionStatusActive).Find(&sessions)

	for _, gs := range sessions {
		if gs.ExpireAt != nil && time.Now().After(*gs.ExpireAt) {
			model.DB.Model(&gs).Update("status", model.SessionStatusExpired)
			continue
		}
		// Restore cookies from DB if needed (lazy re-login on first use)
	}
	log.Printf("[BOT] Loaded %d sessions from DB", len(sessions))
}

func (sm *SessionManager) ActiveCount() int {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	count := 0
	for _, s := range sm.sessions {
		if time.Now().Before(s.ExpireAt) {
			count++
		}
	}
	return count
}

func (sm *SessionManager) AllSessions() []*Session {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	result := make([]*Session, 0, len(sm.sessions))
	for _, s := range sm.sessions {
		result = append(result, s)
	}
	return result
}

var userAgents = []string{
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
}

var uaIndex int
var uaMu sync.Mutex

func randomUA() string {
	uaMu.Lock()
	defer uaMu.Unlock()
	ua := userAgents[uaIndex%len(userAgents)]
	uaIndex++
	return ua
}
