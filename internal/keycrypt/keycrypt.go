// Package keycrypt implements the exact on-disk key encryption format used by
// the TypeScript implementation: AES-256-GCM with a 16-byte IV, key derived
// via scrypt(N=16384, r=8, p=1, 32 bytes) from EXA_KEYS_ENCRYPTION_SECRET and
// the fixed salt "exa-reverse-proxy-keys". Ciphertext format: iv:tag:data in
// lowercase hex. Databases written by either implementation are interchangeable.
package keycrypt

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"strings"

	"golang.org/x/crypto/scrypt"
)

const (
	ivLength  = 16
	authTagLength = 16
	salt      = "exa-reverse-proxy-keys"
	// Node's crypto.scryptSync defaults: N=16384, r=8, p=1.
	scryptN, scryptR, scryptP, scryptKeyLen = 16384, 8, 1, 32
	tokenSalt                               = "exa-proxy-v1"
)

// derived keys are cached per secret: scrypt costs ~40ms per call.
var derivedKeys = map[string][]byte{}

func deriveKey(secret string) []byte {
	if key, ok := derivedKeys[secret]; ok {
		return key
	}
	key, err := scrypt.Key([]byte(secret), []byte(salt), scryptN, scryptR, scryptP, scryptKeyLen)
	if err != nil {
		panic("keycrypt: scrypt derivation failed: " + err.Error())
	}
	derivedKeys[secret] = key
	return key
}

func gcm(secret string) (cipher.AEAD, error) {
	block, err := aes.NewCipher(deriveKey(secret))
	if err != nil {
		return nil, err
	}
	// Node's createCipheriv('aes-256-gcm') uses a 16-byte IV; both runtimes
	// derive J0 via GHASH for non-12-byte nonces (NIST SP 800-38D), so a
	// 16-byte nonce size keeps the formats interoperable in both directions.
	return cipher.NewGCMWithNonceSize(block, ivLength)
}

// Encrypt produces iv:tag:ciphertext hex, matching the TypeScript format.
// The 16-byte IV is fed to GCM's GHASH-based derivation, identical to Node's
// crypto.createCipheriv('aes-256-gcm', key, iv) behavior.
func Encrypt(plaintext, secret string) (string, error) {
	aead, err := gcm(secret)
	if err != nil {
		return "", err
	}
	iv := make([]byte, ivLength)
	if _, err := rand.Read(iv); err != nil {
		return "", err
	}
	sealed := aead.Seal(nil, iv, []byte(plaintext), nil)
	data, tag := sealed[:len(sealed)-authTagLength], sealed[len(sealed)-authTagLength:]
	return fmt.Sprintf("%x:%x:%x", iv, tag, data), nil
}

func Decrypt(encoded, secret string) (string, error) {
	parts := strings.Split(encoded, ":")
	if len(parts) != 3 {
		return "", fmt.Errorf("invalid encrypted value format")
	}
	iv, err := hex.DecodeString(parts[0])
	if err != nil {
		return "", err
	}
	tag, err := hex.DecodeString(parts[1])
	if err != nil {
		return "", err
	}
	data, err := hex.DecodeString(parts[2])
	if err != nil {
		return "", err
	}
	aead, err := gcm(secret)
	if err != nil {
		return "", err
	}
	plaintext, err := aead.Open(nil, iv, append(append([]byte{}, data...), tag...), nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

// IsEncryptedFormat reports whether the value looks like iv:tag:ciphertext hex.
func IsEncryptedFormat(value string) bool {
	parts := strings.Split(value, ":")
	if len(parts) != 3 {
		return false
	}
	for _, part := range parts {
		if part == "" {
			return false
		}
		if _, err := hex.DecodeString(part); err != nil {
			return false
		}
	}
	return true
}

// CanDecrypt reports whether the value decrypts cleanly with the secret.
func CanDecrypt(value, secret string) bool {
	if !IsEncryptedFormat(value) {
		return false
	}
	_, err := Decrypt(value, secret)
	return err == nil
}

// MaskSecret mirrors the TypeScript maskSecret with secretDisplay 'masked'.
// ('plain' display is handled by callers passing the raw value through.)
func MaskSecret(value string) string {
	text := value
	if text == "" || text == "-" {
		return "-"
	}
	if len(text) <= 12 {
		return text[:3] + "••••" + text[len(text)-3:]
	}
	return text[:8] + "••••••" + text[len(text)-6:]
}

// ---- client/admin token auth (sha256 + timing-safe compare, HMAC token ids) ----

func hashToken(value string) []byte {
	sum := sha256.Sum256([]byte(value))
	return sum[:]
}

// ExtractToken reads the client credential from the authorization header
// (Bearer scheme) or the x-proxy-api-key header.
func ExtractToken(authHeader, proxyAPIKeyHeader string) string {
	lower := strings.ToLower(authHeader)
	if strings.HasPrefix(lower, "bearer ") {
		return strings.TrimSpace(authHeader[len("Bearer "):])
	}
	return strings.TrimSpace(proxyAPIKeyHeader)
}

// IsAuthorized reports whether the presented token matches any allowed token.
func IsAuthorized(presented string, allowedTokens []string) bool {
	if presented == "" || len(allowedTokens) == 0 {
		return false
	}
	for _, token := range allowedTokens {
		if subtle.ConstantTimeCompare(hashToken(presented), hashToken(token)) == 1 {
			return true
		}
	}
	return false
}

// TokenID derives the stable token identifier: tok_<hmac-sha256 hex[0:12]>.
func TokenID(token string) string {
	mac := hmac.New(sha256.New, []byte(tokenSalt))
	mac.Write([]byte(token))
	return "tok_" + hex.EncodeToString(mac.Sum(nil))[:12]
}

// TokenIDForPresented returns the token id for the presented token if it
// matches an allowed token, else empty.
func TokenIDForPresented(presented string, allowedTokens []string) string {
	if presented == "" {
		return ""
	}
	for _, token := range allowedTokens {
		if subtle.ConstantTimeCompare(hashToken(presented), hashToken(token)) == 1 {
			return TokenID(token)
		}
	}
	return ""
}
