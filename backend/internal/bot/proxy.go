package bot

import (
	"crypto/tls"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

type Proxy struct {
	Addr     string `json:"addr"`
	Type     string `json:"type"` // http, socks5
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
	Healthy  bool   `json:"healthy"`
	LastUsed time.Time `json:"last_used"`
	FailCount int   `json:"fail_count"`
}

type proxyPool struct {
	mu      sync.RWMutex
	proxies []*Proxy
	index   int
	enabled bool
}

var ProxyPool = &proxyPool{
	proxies: make([]*Proxy, 0),
	enabled: false,
}

func init() {
	// 从环境变量 DEFAULT_PROXIES 自动加载代理，格式: addr1,addr2,...
	if envProxies := os.Getenv("DEFAULT_PROXIES"); envProxies != "" {
		for _, addr := range strings.Split(envProxies, ",") {
			addr = strings.TrimSpace(addr)
			if addr != "" {
				ProxyPool.Add(addr, "http", "", "")
				log.Printf("[PROXY] Auto-loaded default proxy: %s", addr)
			}
		}
		ProxyPool.SetEnabled(true)
		log.Printf("[PROXY] Proxy pool enabled with %d default proxies", len(ProxyPool.List()))
	}
}

func (pp *proxyPool) SetEnabled(enabled bool) {
	pp.mu.Lock()
	defer pp.mu.Unlock()
	pp.enabled = enabled
}

func (pp *proxyPool) IsEnabled() bool {
	pp.mu.RLock()
	defer pp.mu.RUnlock()
	return pp.enabled
}

func (pp *proxyPool) Add(addr, proxyType, username, password string) {
	pp.mu.Lock()
	defer pp.mu.Unlock()
	pp.proxies = append(pp.proxies, &Proxy{
		Addr:     addr,
		Type:     proxyType,
		Username: username,
		Password: password,
		Healthy:  true,
	})
}

func (pp *proxyPool) Remove(addr string) {
	pp.mu.Lock()
	defer pp.mu.Unlock()
	for i, p := range pp.proxies {
		if p.Addr == addr {
			pp.proxies = append(pp.proxies[:i], pp.proxies[i+1:]...)
			return
		}
	}
}

func (pp *proxyPool) Next() string {
	pp.mu.Lock()
	defer pp.mu.Unlock()

	if !pp.enabled || len(pp.proxies) == 0 {
		return ""
	}

	tried := 0
	for tried < len(pp.proxies) {
		p := pp.proxies[pp.index%len(pp.proxies)]
		pp.index++
		tried++
		if p.Healthy {
			p.LastUsed = time.Now()
			scheme := p.Type
			if scheme == "" {
				scheme = "http"
			}
			if p.Username != "" {
				return scheme + "://" + p.Username + ":" + p.Password + "@" + p.Addr
			}
			return scheme + "://" + p.Addr
		}
	}
	return ""
}

func (pp *proxyPool) MarkFailed(addr string) {
	pp.mu.Lock()
	defer pp.mu.Unlock()
	for _, p := range pp.proxies {
		if p.Addr == addr {
			p.FailCount++
			if p.FailCount >= 3 {
				p.Healthy = false
			}
			return
		}
	}
}

func (pp *proxyPool) MarkHealthy(addr string) {
	pp.mu.Lock()
	defer pp.mu.Unlock()
	for _, p := range pp.proxies {
		if p.Addr == addr {
			p.Healthy = true
			p.FailCount = 0
			return
		}
	}
}

func (pp *proxyPool) List() []*Proxy {
	pp.mu.RLock()
	defer pp.mu.RUnlock()
	result := make([]*Proxy, len(pp.proxies))
	copy(result, pp.proxies)
	return result
}

func (pp *proxyPool) HealthyCount() int {
	pp.mu.RLock()
	defer pp.mu.RUnlock()
	count := 0
	for _, p := range pp.proxies {
		if p.Healthy {
			count++
		}
	}
	return count
}

func (pp *proxyPool) Clear() {
	pp.mu.Lock()
	defer pp.mu.Unlock()
	pp.proxies = make([]*Proxy, 0)
	pp.index = 0
}

func (pp *proxyPool) HealthCheck() {
	pp.mu.RLock()
	proxies := make([]*Proxy, len(pp.proxies))
	copy(proxies, pp.proxies)
	pp.mu.RUnlock()

	for _, p := range proxies {
		go func(px *Proxy) {
			proxyURL, err := url.Parse(px.Type + "://" + px.Addr)
			if err != nil {
				pp.MarkFailed(px.Addr)
				return
			}

			client := &http.Client{
				Transport: &http.Transport{
					Proxy:           http.ProxyURL(proxyURL),
					TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
				},
				Timeout: 10 * time.Second,
			}

			resp, err := client.Get("https://httpbin.org/ip")
			if err != nil {
				pp.MarkFailed(px.Addr)
				log.Printf("[PROXY] Health check failed for %s: %v", px.Addr, err)
				return
			}
			resp.Body.Close()
			pp.MarkHealthy(px.Addr)
		}(p)
	}
}

func BuildHTTPClient(proxyAddr string, ua string) *http.Client {
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	if proxyAddr != "" {
		proxyURL, err := url.Parse(proxyAddr)
		if err == nil {
			transport.Proxy = http.ProxyURL(proxyURL)
		}
	}

	return &http.Client{
		Transport: transport,
		Timeout:   30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}
