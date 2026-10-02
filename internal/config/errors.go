package config

import "errors"

var errSecretRequired = errors.New("EXA_KEYS_ENCRYPTION_SECRET is required (at least 16 characters) — keys are encrypted at rest with it")

// ErrSecretRequired is returned by Validate when the encryption secret is
// missing or shorter than 16 characters.
var ErrSecretRequired = errSecretRequired
