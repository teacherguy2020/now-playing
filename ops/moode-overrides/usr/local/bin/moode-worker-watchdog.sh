#!/usr/bin/env bash
set -u

PID_FILE="/run/worker.pid"
WORKER_PATH="/var/www/daemon/worker.php"
LOCK_FILE="/run/moode-worker-watchdog.lock"
SQLDB="/var/local/www/db/moode-sqlite3.db"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
	# A previous check is still running. The systemd timer will try again.
	exit 0
fi

log() {
	printf '%s moode-worker-watchdog: %s\n' "$(date '+%Y%m%d %H%M%S')" "$*"
}

worker_is_running() {
	local pid cmd

	pid=$(cat "$PID_FILE" 2>/dev/null || true)
	[[ "$pid" =~ ^[0-9]+$ ]] || return 1
	kill -0 "$pid" 2>/dev/null || return 1
	cmd=$(ps -p "$pid" -o args= 2>/dev/null || true)
	[[ "$cmd" == *"$WORKER_PATH"* ]]
}

airplay_enabled() {
	[[ "$(sqlite3 "$SQLDB" "SELECT value FROM cfg_system WHERE param='airplaysvc'" 2>/dev/null || true)" == "1" ]]
}

airplay_is_running() {
	systemctl is-active --quiet shairport-sync.service || return 1
	pgrep -x shairport-sync >/dev/null 2>&1
}

check_airplay() {
	if ! airplay_enabled || airplay_is_running; then
		return 0
	fi

	log "AirPlay receiver is not healthy; asking moOde to restart it"
	/usr/bin/php /var/www/util/restart-renderer.php --airplay >/dev/null 2>&1 || true

	for _ in $(seq 1 10); do
		if airplay_is_running; then
			log "AirPlay receiver recovered"
			return 0
		fi
		sleep 1
	done

	log "AirPlay restart returned but shairport-sync is still unhealthy"
	return 1
}

check_airplay || true

if worker_is_running; then
	exit 0
fi

# Do not race moOde's boot/shutdown sequence. A later timer tick will retry.
system_state=$(systemctl is-system-running 2>/dev/null || true)
case "$system_state" in
	running|degraded)
		;;
	*)
		log "system state is $system_state; deferring worker recovery"
		exit 0
		;;
esac

pidfile_value=$(cat "$PID_FILE" 2>/dev/null || echo missing)
log "worker missing (pidfile=$pidfile_value); stopping helper daemons before recovery"

# worker.php keeps its flock open. These helper launchers inherit that lock,
# so stop them before trying to acquire it again after an unclean worker exit.
for helper in peppy-gain.php mountmon.php mpdmon.php; do
	killall -TERM "$helper" >/dev/null 2>&1 || true
done

lock_ready=0
for _ in $(seq 1 10); do
	if flock -n "$PID_FILE" -c ':' 2>/dev/null; then
		lock_ready=1
		break
	fi
	sleep 1
done

if [[ "$lock_ready" != "1" ]]; then
	log "worker lock is still held; deferring recovery"
	exit 1
fi

log "starting stock worker daemon"
if ! "$WORKER_PATH" >/dev/null 2>&1; then
	log "worker launch command failed"
	exit 1
fi

for _ in $(seq 1 10); do
	if worker_is_running; then
		new_pid=$(cat "$PID_FILE" 2>/dev/null || echo unknown)
		log "worker recovered (pid=$new_pid)"
		exit 0
	fi
	sleep 1
done

log "worker launch returned but no healthy worker was observed"
exit 1
