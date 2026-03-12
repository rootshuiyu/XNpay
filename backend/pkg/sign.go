package pkg

import (
	"crypto/md5"
	"fmt"
	"math/rand"
	"net/url"
	"sort"
	"strings"
	"time"
)

func GenerateSign(params map[string]string, secret string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		if k == "sign" || params[k] == "" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var buf strings.Builder
	for i, k := range keys {
		if i > 0 {
			buf.WriteByte('&')
		}
		buf.WriteString(k)
		buf.WriteByte('=')
		buf.WriteString(params[k])
	}
	buf.WriteString("&key=")
	buf.WriteString(secret)

	hash := md5.Sum([]byte(buf.String()))
	return fmt.Sprintf("%x", hash)
}

func VerifySign(params map[string]string, secret string) bool {
	sign, ok := params["sign"]
	if !ok || sign == "" {
		return false
	}
	expected := GenerateSign(params, secret)
	return strings.EqualFold(sign, expected)
}

func FormToMap(values url.Values) map[string]string {
	m := make(map[string]string, len(values))
	for k, v := range values {
		if len(v) > 0 {
			m[k] = v[0]
		}
	}
	return m
}

func GenerateOrderNo() string {
	now := time.Now()
	r := rand.Intn(9000) + 1000
	return fmt.Sprintf("XN%s%d%d", now.Format("20060102150405"), now.UnixMilli()%1000, r)
}
