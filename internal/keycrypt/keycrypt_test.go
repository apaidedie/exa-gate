package keycrypt

import (
	"strings"
	"testing"
)

const testSecret = "unit-test-secret-16"

func TestEncryptDecryptRoundtrip(t *testing.T) {
	// No empty-plaintext case: the admin API rejects empty key values before
	// encryption, and an empty ciphertext ("iv:tag:") is outside the
	// iv:tag:data shape by design.
	for _, plaintext := range []string{"sk-abc123", "exa-密钥-with-unicode-✓", strings.Repeat("x", 500)} {
		encrypted, err := Encrypt(plaintext, testSecret)
		if err != nil {
			t.Fatalf("Encrypt(%q): %v", plaintext, err)
		}
		if !IsEncryptedFormat(encrypted) {
			t.Errorf("output not in iv:tag:data format: %q", encrypted)
		}
		decrypted, err := Decrypt(encrypted, testSecret)
		if err != nil {
			t.Fatalf("Decrypt: %v", err)
		}
		if decrypted != plaintext {
			t.Errorf("roundtrip = %q, want %q", decrypted, plaintext)
		}
	}
}

func TestEncryptUniqueIVs(t *testing.T) {
	a, _ := Encrypt("same", testSecret)
	b, _ := Encrypt("same", testSecret)
	if a == b {
		t.Error("two encryptions of the same plaintext share an IV")
	}
}

func TestDecryptFailures(t *testing.T) {
	valid, _ := Encrypt("data", testSecret)

	cases := []struct {
		name  string
		value string
	}{
		{"no colons", "plaintext-value"},
		{"two parts", "aa:bb"},
		{"four parts", "aa:bb:cc:dd"},
		{"empty", ""},
		{"bad hex iv", "zz:00112233445566778899aabbccddeeff:0011223344556677"},
		{"bad hex tag", strings.Split(valid, ":")[0] + ":zz:0011"},
		{"bad hex data", strings.Split(valid, ":")[0] + ":" + strings.Split(valid, ":")[1] + ":zz"},
	}
	for _, c := range cases {
		if _, err := Decrypt(c.value, testSecret); err == nil {
			t.Errorf("%s: Decrypt succeeded, want error", c.name)
		}
	}
	// Wrong secret must fail authentication (GCM tag mismatch), not panic.
	if _, err := Decrypt(valid, "another-secret-16"); err == nil {
		t.Error("decrypt with wrong secret should fail")
	}
}

func TestIsEncryptedFormat(t *testing.T) {
	valid, _ := Encrypt("x", testSecret)
	cases := map[string]bool{
		valid:              true,
		"0011:2233:4455":   true,
		"plain-value":      false,
		"a:b":              false,
		"a:b:c:d":          false,
		"":                 false,
		"::":               false,
		"zz:11:22":         false,
		"11:zz:22":         false,
		"11:22:zz":         false,
		":aabbccddeeff:11": false,
	}
	for value, want := range cases {
		if got := IsEncryptedFormat(value); got != want {
			t.Errorf("IsEncryptedFormat(%q) = %v, want %v", value, got, want)
		}
	}
}

func TestCanDecrypt(t *testing.T) {
	valid, _ := Encrypt("x", testSecret)
	if !CanDecrypt(valid, testSecret) {
		t.Error("CanDecrypt should accept a value it encrypted")
	}
	if CanDecrypt(valid, "wrong-secret-16") {
		t.Error("CanDecrypt should reject a wrong secret")
	}
	if CanDecrypt("not-encrypted", testSecret) {
		t.Error("CanDecrypt should reject non-encrypted values")
	}
}

func TestMaskSecret(t *testing.T) {
	cases := map[string]string{
		"":                     "-",
		"-":                    "-",
		"abc":                  "abc••••abc",
		"abcdefghijkl":         "abc••••jkl",
		"0123456789abcdefghij": "01234567••••••efghij",
	}
	for input, want := range cases {
		if got := MaskSecret(input); got != want {
			t.Errorf("MaskSecret(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestExtractToken(t *testing.T) {
	cases := []struct {
		auth, apiKey, want string
	}{
		{"Bearer abc", "", "abc"},
		{"bearer abc", "", "abc"},
		{"BEARER  spaced  ", "", "spaced"},
		{"", "key-from-header", "key-from-header"},
		{"", "  key-from-header  ", "key-from-header"},
		{"Basic dXNlcjpwYXNz", "fallback", "fallback"},
		{"Bearer", "fallback", "fallback"},
		{"", "", ""},
	}
	for _, c := range cases {
		if got := ExtractToken(c.auth, c.apiKey); got != c.want {
			t.Errorf("ExtractToken(%q, %q) = %q, want %q", c.auth, c.apiKey, got, c.want)
		}
	}
}

func TestIsAuthorized(t *testing.T) {
	allowed := []string{"token-one", "token-two"}
	if !IsAuthorized("token-one", allowed) {
		t.Error("matching token rejected")
	}
	if !IsAuthorized("token-two", allowed) {
		t.Error("second matching token rejected")
	}
	if IsAuthorized("token-three", allowed) {
		t.Error("unknown token accepted")
	}
	if IsAuthorized("", allowed) {
		t.Error("empty token accepted")
	}
	if IsAuthorized("token-one", nil) {
		t.Error("empty allowlist accepted a token")
	}
}

func TestTokenID(t *testing.T) {
	a := TokenID("token-one")
	b := TokenID("token-one")
	c := TokenID("token-two")
	if a != b {
		t.Error("TokenID not deterministic")
	}
	if a == c {
		t.Error("different tokens share an id")
	}
	if !strings.HasPrefix(a, "tok_") || len(a) != len("tok_")+12 {
		t.Errorf("TokenID shape = %q, want tok_<12 hex>", a)
	}
	for _, ch := range a[4:] {
		if !strings.ContainsRune("0123456789abcdef", ch) {
			t.Errorf("TokenID contains non-hex char %q", ch)
		}
	}
}

func TestTokenIDForPresented(t *testing.T) {
	allowed := []string{"token-one", "token-two"}
	if got := TokenIDForPresented("token-two", allowed); got != TokenID("token-two") {
		t.Errorf("TokenIDForPresented = %q, want the matched token's id", got)
	}
	if got := TokenIDForPresented("nope", allowed); got != "" {
		t.Errorf("non-matching token id = %q, want empty", got)
	}
	if got := TokenIDForPresented("", allowed); got != "" {
		t.Errorf("empty presented id = %q, want empty", got)
	}
}
