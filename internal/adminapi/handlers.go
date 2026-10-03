package adminapi

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/apaidedie/exa-gate/internal/keycrypt"
	"github.com/apaidedie/exa-gate/internal/observability"
	"github.com/apaidedie/exa-gate/internal/scheduler"
	"github.com/apaidedie/exa-gate/internal/state"
)

func (s *Server) handleKeysBatch(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	var body struct {
		IDs    []string `json:"ids"`
		Action string   `json:"action"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	ids := body.IDs
	action := body.Action
	results := make([]map[string]any, 0, len(ids))
	limit := 500
	if action == "test" {
		limit = 12
	}
	if len(ids) > limit {
		ids = ids[:limit]
	}

	if action == "delete" {
		total, _ := s.Store.KeyCount()
		var deletable []string
		for _, id := range ids {
			if _, exists := s.Scheduler.GetKey(id); !exists {
				results = append(results, map[string]any{"id": id, "ok": false, "reason": "key_not_found"})
			} else if total-int64(len(deletable)) <= 1 {
				results = append(results, map[string]any{"id": id, "ok": false, "reason": "last_key"})
			} else {
				deletable = append(deletable, id)
			}
		}
		if len(deletable) > 0 {
			if err := s.Store.DeleteKeysBatch(deletable); err != nil {
				writeError(w, 500, "internal_error", err.Error(), requestIDOf(r))
				return
			}
			s.Scheduler.RemoveKeys(deletable)
			for _, id := range deletable {
				results = append(results, map[string]any{"id": id, "deleted": true})
			}
		}
		s.audit(r, "batch_delete", nil, true, fmt.Sprintf("%d keys", len(results)))
		writeJSON(w, 200, map[string]any{"ok": true, "results": results})
		return
	}

	for _, id := range ids {
		switch action {
		case "disable":
			_ = s.Store.SetEnabled(id, false)
			s.Scheduler.SetDisabled(id, true)
			results = append(results, map[string]any{"id": id, "enabled": false})
		case "enable":
			_ = s.Store.SetEnabled(id, true)
			s.Scheduler.SetDisabled(id, false)
			results = append(results, map[string]any{"id": id, "enabled": true})
		case "reset":
			s.Scheduler.CoolDown(id, 0, "manual_reset")
			_ = s.Store.SetCooldown(id, 0, nil)
			results = append(results, map[string]any{"id": id, "reset": true})
		case "test":
			if _, exists := s.Scheduler.GetKey(id); !exists {
				results = append(results, map[string]any{"id": id, "ok": false, "reason": "key_not_found"})
				continue
			}
			results = append(results, s.testKey(mustKey(s.Scheduler, id), requestIDOf(r)))
		default:
			writeError(w, 400, "validation_error", "Unknown batch action.", requestIDOf(r))
			return
		}
	}
	s.audit(r, "batch_"+action, nil, true, fmt.Sprintf("%d keys", len(results)))
	writeJSON(w, 200, map[string]any{"ok": true, "results": results})
}

func mustKey(sched *scheduler.Scheduler, id string) scheduler.Key {
	key, _ := sched.GetKey(id)
	return key
}

func (s *Server) handleKeysImport(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	var body struct {
		Keys []struct {
			ID     string `json:"id"`
			Value  string `json:"value"`
			Weight *int   `json:"weight"`
		} `json:"keys"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if len(body.Keys) == 0 {
		writeError(w, 400, "validation_error", "Request body must include a non-empty \"keys\" array.", requestIDOf(r))
		return
	}
	if len(body.Keys) > 10000 {
		writeError(w, 400, "validation_error", "Maximum 10000 keys per import.", requestIDOf(r))
		return
	}
	imported, skipped := 0, 0
	var errorsList []map[string]any
	for i, entry := range body.Keys {
		value := strings.TrimSpace(entry.Value)
		if value == "" {
			skipped++
			errorsList = append(errorsList, map[string]any{"index": i, "reason": "Empty key value"})
			continue
		}
		id := strings.TrimSpace(entry.ID)
		if id == "" {
			id = fmt.Sprintf("import_%04d", i+1)
		}
		weight := 1
		if entry.Weight != nil {
			weight = *entry.Weight
		}
		if weight < 1 {
			skipped++
			errorsList = append(errorsList, map[string]any{"index": i, "id": id, "reason": "Weight must be a positive integer"})
			continue
		}
		if _, exists := s.Scheduler.GetKey(id); exists {
			skipped++
			continue
		}
		encrypted, err := keycrypt.Encrypt(value, s.Cfg.EncryptionSecret)
		if err != nil {
			skipped++
			errorsList = append(errorsList, map[string]any{"index": i, "id": id, "reason": "encryption failed"})
			continue
		}
		if err := s.Store.SeedKeys([]state.KeySeed{{ID: id, Value: &encrypted, Weight: weight, Enabled: true}}); err != nil {
			skipped++
			continue
		}
		s.Scheduler.AddKey(schedulerKeyFromSeed(id, value, weight))
		imported++
	}
	s.audit(r, "import_keys", nil, true, fmt.Sprintf("Imported %d keys, skipped %d", imported, skipped))
	writeJSON(w, 200, map[string]any{"ok": true, "imported": imported, "skipped": skipped, "totalErrors": len(errorsList)})
}

func (s *Server) handleKeysExport(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	if !s.Cfg.AllowRawKeyDisplay {
		s.audit(r, "export_keys", nil, false, "Raw key display disabled")
		writeError(w, 403, "raw_key_display_disabled", "Raw key export is disabled by policy.", requestIDOf(r))
		return
	}
	persistent, err := s.Store.ListPersistentKeys()
	if err != nil {
		writeError(w, 500, "internal_error", err.Error(), requestIDOf(r))
		return
	}
	var b strings.Builder
	for _, key := range persistent {
		if key.Value == nil || *key.Value == "" {
			continue
		}
		plaintext, err := keycrypt.Decrypt(*key.Value, s.Cfg.EncryptionSecret)
		if err != nil {
			continue
		}
		fmt.Fprintf(&b, "%s:%s:%d\n", key.ID, plaintext, key.Weight)
	}
	s.audit(r, "export_keys", nil, true, fmt.Sprintf("%d keys exported", len(persistent)))
	w.Header().Set("content-type", "text/plain; charset=utf-8")
	w.Header().Set("content-disposition", "attachment; filename=\"exa-keys-backup.txt\"")
	w.Header().Set("cache-control", "no-store")
	_, _ = io.WriteString(w, b.String())
}

func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	query := r.URL.Query()
	from := time.Now().Add(-24 * time.Hour).UnixMilli()
	if raw := query.Get("from"); raw != "" {
		var parsed int64
		if _, err := fmt.Sscanf(raw, "%d", &parsed); err == nil {
			from = parsed
		}
	}
	limit := int64(100)
	if raw := query.Get("limit"); raw != "" {
		var parsed int64
		if _, err := fmt.Sscanf(raw, "%d", &parsed); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	logs, err := s.Store.ListRequestLogs(state.LogFilter{
		Limit: limit, Path: query.Get("path"), Status: query.Get("status"),
		KeyID: query.Get("keyId"), From: from,
	})
	if err != nil {
		writeError(w, 500, "internal_error", err.Error(), requestIDOf(r))
		return
	}
	writeJSON(w, 200, map[string]any{"logs": logs})
}

func (s *Server) handleLogsExport(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	query := r.URL.Query()
	from := time.Now().UnixMilli() - 24*int64(time.Hour.Milliseconds()/int64(time.Millisecond))
	if raw := query.Get("from"); raw != "" {
		var parsed int64
		if _, err := fmt.Sscanf(raw, "%d", &parsed); err == nil {
			from = parsed
		}
	}
	logs, err := s.Store.ListRequestLogs(state.LogFilter{Limit: 5000, Path: query.Get("path"), Status: query.Get("status"), KeyID: query.Get("keyId"), From: from})
	if err != nil {
		writeError(w, 500, "internal_error", err.Error(), requestIDOf(r))
		return
	}
	s.audit(r, "export_logs", nil, true, fmt.Sprintf("%d rows", len(logs)))
	w.Header().Set("content-type", "text/csv; charset=utf-8")
	w.Header().Set("content-disposition", "attachment; filename=\"exa-request-logs.csv\"")
	_, _ = io.WriteString(w, "request_id,token_id,method,path,status,key_ids,attempts,latency_ms,error_code,query,created_at\n")
	for _, log := range logs {
		keyIDs, _ := json.Marshal(log.KeyIDs)
		fmt.Fprintf(w, "%s,%s,%s,%s,%d,%s,%d,%d,%s,%s,%d\n",
			log.RequestID, csvField(log.TokenID), log.Method, log.Path, log.Status,
			strings.ReplaceAll(string(keyIDs), "\"", "\"\""), log.Attempts, log.LatencyMs,
			csvField(log.ErrorCode), csvField(log.Query), log.CreatedAt)
	}
}

func csvField(value *string) string {
	if value == nil {
		return ""
	}
	escaped := strings.ReplaceAll(*value, "\"", "\"\"")
	return "\"" + escaped + "\""
}

func (s *Server) handleLogsPrune(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	days := int64(s.Cfg.LogRetentionDays)
	before := time.Now().UnixMilli() - days*24*int64(time.Hour.Milliseconds()/int64(time.Millisecond))
	deleted, err := s.Store.PruneLogs(before)
	if err != nil {
		writeError(w, 500, "internal_error", err.Error(), requestIDOf(r))
		return
	}
	s.audit(r, "prune_logs", nil, true, fmt.Sprintf("deleted %d", deleted))
	writeJSON(w, 200, map[string]any{"ok": true, "deleted": deleted})
}

func (s *Server) handleLogTrace(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	requestID := strings.TrimPrefix(r.URL.Path, "/_proxy/logs/trace/")
	logs, err := s.Store.ListLogsByRequestID(requestID)
	if err != nil {
		writeError(w, 500, "internal_error", err.Error(), requestIDOf(r))
		return
	}
	writeJSON(w, 200, map[string]any{"requestId": requestID, "trace": logs})
}

func (s *Server) handleAudit(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	records, total, err := s.Store.ListAudit(200)
	if err != nil {
		writeError(w, 500, "internal_error", err.Error(), requestIDOf(r))
		return
	}
	writeJSON(w, 200, map[string]any{"audit": records, "total": total})
}

func (s *Server) handleAuditExport(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	records, _, err := s.Store.ListAudit(5000)
	if err != nil {
		writeError(w, 500, "internal_error", err.Error(), requestIDOf(r))
		return
	}
	s.audit(r, "export_audit", nil, true, fmt.Sprintf("%d rows", len(records)))
	w.Header().Set("content-type", "text/csv; charset=utf-8")
	w.Header().Set("content-disposition", "attachment; filename=\"exa-admin-audit.csv\"")
	_, _ = io.WriteString(w, "actor_token_id,action,target_id,success,detail,ip,user_agent,created_at\n")
	for _, record := range records {
		fmt.Fprintf(w, "%s,%s,%s,%t,%s,%s,%s,%d\n",
			csvField(record.ActorTokenID), record.Action, csvField(record.TargetID),
			record.Success, csvField(record.Detail), csvField(record.IP),
			csvField(record.UserAgent), record.CreatedAt)
	}
}

func (s *Server) handleObservability(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	hours := int64(24)
	if raw := r.URL.Query().Get("hours"); raw != "" {
		var parsed int64
		if _, err := fmt.Sscanf(raw, "%d", &parsed); err == nil && parsed > 0 {
			hours = parsed
		}
	}
	window := observability.TrendWindow(int(hours), s.Cfg.TrendWindowHours)
	now := time.Now().UnixMilli()
	sinceMs := now - window.WindowMs

	hourly, err := s.Store.HourlyCounts(sinceMs)
	if err != nil {
		writeError(w, 500, "internal_error", err.Error(), requestIDOf(r))
		return
	}
	obsHourly := make([]observability.HourlyCount, len(hourly))
	for i, hc := range hourly {
		obsHourly[i] = observability.HourlyCount{Hour: hc.Hour, Requests: hc.Requests, Failures: hc.Failures, RateLimits: hc.RateLimits, AvgLatency: hc.AvgLatency}
	}
	trends := observability.BuildTrends(sinceMs, window.BucketMs, obsHourly)

	stats, err := s.Store.ListKeyStats()
	if err != nil {
		writeError(w, 500, "internal_error", err.Error(), requestIDOf(r))
		return
	}
	nowMs := time.Now().UnixMilli()
	healthy, cooldown, disabled := 0, 0, 0
	for _, stat := range stats {
		switch {
		case !stat.Enabled:
			disabled++
		case stat.CooldownUntil > nowMs:
			cooldown++
		default:
			healthy++
		}
	}

	// Hourly counts for alert computation (current hour + previous hour)
	currentHour := now / 3600000 * 3600000
	prevHour := currentHour - 3600000
	var curReq, curFail, curRL, prevFail, prevRL int64
	for _, hc := range hourly {
		if hc.Hour == currentHour {
			curReq, curFail, curRL = hc.Requests, hc.Failures, hc.RateLimits
		} else if hc.Hour == prevHour {
			_, prevFail, prevRL = hc.Requests, hc.Failures, hc.RateLimits
		}
	}

	alerts := observability.BuildAlerts(observability.AlertInput{
		Healthy: healthy, Disabled: disabled, TotalKeys: len(stats),
		CurrentRequests: curReq, CurrentFailures: curFail, CurrentRateLimits: curRL,
		PreviousFailures: prevFail, PreviousRateLimits: prevRL,
		AlertAvailableKeyMin:      s.Cfg.AlertAvailableKeyMin,
		AlertFailureRatePercent:   s.Cfg.AlertFailureRatePercent,
		AlertRateLimitRatePercent: s.Cfg.AlertRateLimitRatePercent,
	})

	writeJSON(w, 200, map[string]any{
		"trends": trends,
		"alerts": alerts,
		"window": map[string]any{"label": window.Label},
		"retention": map[string]any{
			"days":         s.Cfg.LogRetentionDays,
			"expiredLogs":  0,
			"retainedLogs": len(trends),
		},
		"keys": map[string]any{
			"healthy": healthy, "cooldown": cooldown, "disabled": disabled,
		},
	})
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	stats, err := s.Store.ListKeyStats()
	if err != nil {
		writeError(w, 500, "internal_error", err.Error(), requestIDOf(r))
		return
	}
	now := time.Now().UnixMilli()
	var total, healthy, cooldown, disabled int64
	var latencySum, latencyCount int64
	for _, stat := range stats {
		total++
		switch {
		case !stat.Enabled:
			disabled++
		case stat.CooldownUntil > now:
			cooldown++
		default:
			healthy++
		}
		if stat.LastLatencyMs != nil {
			latencySum += *stat.LastLatencyMs
			latencyCount++
		}
	}
	p95 := int64(0)
	if latencyCount > 0 {
		p95 = latencySum / latencyCount
	}
	w.Header().Set("content-type", "text/plain; version=0.0.4; charset=utf-8")
	_, _ = io.WriteString(w, metricsRender(stats, total, healthy, cooldown, disabled, p95, s.Cfg.LogRetentionDays))
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, 500, "internal_error", "streaming unsupported", requestIDOf(r))
		return
	}
	w.Header().Set("content-type", "text/event-stream; charset=utf-8")
	w.Header().Set("cache-control", "no-cache, no-transform")
	w.Header().Set("connection", "keep-alive")

	snapshot := func() {
		total, _, _, _ := s.keyOperations()
		logCount, _ := s.Store.KeyCount()
		payload := map[string]any{
			"ts": time.Now().UnixMilli(), "keyCount": total, "logCount": logCount,
		}
		data, _ := json.Marshal(payload)
		fmt.Fprintf(w, "event: snapshot\ndata: %s\n\n", data)
		flusher.Flush()
	}
	snapshot()
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			snapshot()
		case <-r.Context().Done():
			return
		}
	}
}

func (s *Server) handleWebhookTest(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	if s.Cfg.AlertWebhookURL == "" {
		writeJSON(w, 200, map[string]any{"ok": false, "error": "no_webhook_url"})
		return
	}
	payload := fmt.Sprintf(`{"type":"test","message":"Exa Gate webhook test at %s"}`, time.Now().Format(time.RFC3339))
	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest(http.MethodPost, s.Cfg.AlertWebhookURL, strings.NewReader(payload))
	if err != nil {
		writeJSON(w, 200, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	req.Header.Set("content-type", "application/json")
	if s.Cfg.AlertWebhookBearerToken != "" {
		req.Header.Set("authorization", "Bearer "+s.Cfg.AlertWebhookBearerToken)
	}
	resp, err := client.Do(req)
	if err != nil {
		writeJSON(w, 200, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	defer resp.Body.Close()
	ok := resp.StatusCode >= 200 && resp.StatusCode < 300
	s.audit(r, "test_alert_webhook", nil, ok, fmt.Sprintf("status %d", resp.StatusCode))
	writeJSON(w, 200, map[string]any{"ok": ok, "statusCode": resp.StatusCode})
}

func (s *Server) handleConfigSummary(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	strategy := string(s.Cfg.SelectionStrategy)
	listen := fmt.Sprintf("%s:%d", s.Cfg.Host, s.Cfg.Port)
	writeJSON(w, 200, map[string]any{
		"listen":               listen,
		"upstream":             s.Cfg.UpstreamURL,
		"selectionStrategy":    strategy,
		"allowedPaths":         map[string]any{"count": len(s.Cfg.AllowedPaths), "preview": s.Cfg.AllowedPaths},
		"resourceAffinity":     s.Cfg.ResourceAffinity,
		"rawKeyDisplayAllowed": s.Cfg.AllowRawKeyDisplay,
		"adminRequireHttps":    s.Cfg.AdminRequireHTTPS,
		"logRetentionDays":     s.Cfg.LogRetentionDays,
		"maxAttempts":          s.Cfg.MaxAttempts,
		"state":                map[string]any{"backend": "sqlite"},
		"version": map[string]any{
			"current": Version,
			"latest":  nil,
			"upToDate": nil,
		},
	})
}
