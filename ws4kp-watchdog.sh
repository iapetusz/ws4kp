#!/bin/bash
# Watchdog for ws4kp: monitors Node server and Chromium kiosk

LOG="/home/monty/weather/ws4kp/watchdog.log"
PORT=8080
CHECK_INTERVAL=30

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG"
}

log "Watchdog started"

while true; do
    sleep "$CHECK_INTERVAL"

    # Check Node server health
    if ! curl -sf -o /dev/null --max-time 5 "http://localhost:${PORT}/"; then
        log "Node server not responding, restarting ws4kp service"
        systemctl --user restart ws4kp.service
        sleep 10
    fi

    # Check Chromium kiosk is running
    if ! pgrep -f 'chromium.*--kiosk' > /dev/null; then
        log "Chromium kiosk not running, waiting for server then relaunching"
        # Wait for server to be ready
        for i in $(seq 1 12); do
            curl -sf -o /dev/null --max-time 5 "http://localhost:${PORT}/" && break
            sleep 5
        done
        chromium-browser --kiosk --noerrdialogs --disable-infobars \
            --no-first-run --start-fullscreen \
            --disable-session-crashed-bubble \
            "http://localhost:${PORT}/" &
        log "Chromium kiosk relaunched"
    fi
done
