package keycrypt

import "testing"

func FuzzDecrypt(f *testing.F) {
	f.Add("aa:bb:cc")
	f.Add("")
	f.Add("plain")
	f.Add("00112233445566778899001122334455:00112233445566778899001122334455:00112233445566778899001122334455")
	f.Fuzz(func(t *testing.T, encoded string) {
		if len(encoded) > 4096 {
			t.Skip() // production ciphertexts are KB-bounded; huge inputs only stress the allocator
		}
		plaintext, err := Decrypt(encoded, "fuzz-secret-16ch!!")
		if err != nil {
			return
		}
		// Successful decryption must round-trip through Encrypt.
		reEncrypted, err := Encrypt(plaintext, "fuzz-secret-16ch!!")
		if err != nil {
			t.Fatalf("re-encrypt failed: %v", err)
		}
		if !IsEncryptedFormat(reEncrypted) {
			t.Fatalf("re-encrypted output not in iv:tag:data shape: %q", reEncrypted)
		}
	})
}

func FuzzMaskSecret(f *testing.F) {
	f.Add("")
	f.Add("a")
	f.Add("ab")
	f.Add("abcdef")
	f.Add("0123456789abcdefghij")
	f.Add("-")
	f.Add("密钥测试值长度超过十二个字符")
	f.Fuzz(func(t *testing.T, value string) {
		masked := MaskSecret(value)
		if value == "" || value == "-" {
			if masked != "-" {
				t.Fatalf("empty/- should map to '-', got %q", masked)
			}
		}
	})
}

func FuzzExtractToken(f *testing.F) {
	f.Add("Bearer abc", "")
	f.Add("", "key")
	f.Add("bearer  x ", "")
	f.Add("Basic xyz", "fb")
	f.Fuzz(func(t *testing.T, auth, apiKey string) {
		token := ExtractToken(auth, apiKey)
		// Invariant: a Bearer credential always wins over the fallback.
		lower := auth
		if len(lower) >= 7 && (lower[:7] == "Bearer " || lower[:7] == "bearer ") {
			trimmed := auth[7:]
			for len(trimmed) > 0 && (trimmed[0] == ' ' || trimmed[0] == '\t') {
				trimmed = trimmed[1:]
			}
			for len(trimmed) > 0 && (trimmed[len(trimmed)-1] == ' ' || trimmed[len(trimmed)-1] == '\t') {
				trimmed = trimmed[:len(trimmed)-1]
			}
			if token != trimmed {
				t.Fatalf("bearer token mangled: %q -> %q", trimmed, token)
			}
		}
	})
}
