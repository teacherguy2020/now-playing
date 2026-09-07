# main.py
# Shyvers Multiphone -> Pico 2 W -> Mabel
# Adds a tiny status webpage so standalone boot can be verified.

import time
import network
import socket
import urequests
from machine import Pin
import secrets

OPTO_PIN = 15
ACTIVE_LOW = True
ACTIVE_DEBOUNCE_MS = 100
REARM_MS = 500
POLL_MS = 10
MABEL_URL = "http://10.0.0.210:8788/shyvers/start-normal"
HTTP_PORT = 80

boot_ms = time.ticks_ms()
trigger_count = 0
last_trigger_ms = None
last_post_status = "Never"
last_post_ok = None
armed = True


def get_secret(*names):
    for name in names:
        if hasattr(secrets, name):
            return getattr(secrets, name)
    return None


SSID = get_secret("SSID", "WIFI_SSID", "ssid", "wifi_ssid")
PASSWORD = get_secret("PASSWORD", "WIFI_PASSWORD", "password", "wifi_password")

if not SSID or PASSWORD is None:
    raise RuntimeError("secrets.py must define WIFI_SSID/WIFI_PASSWORD")


def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)

    if wlan.isconnected():
        print("Wi-Fi already connected:", wlan.ifconfig()[0])
        return wlan

    while not wlan.isconnected():
        print("Connecting to Wi-Fi:", SSID)
        wlan.connect(SSID, PASSWORD)
        started = time.ticks_ms()

        while not wlan.isconnected():
            status = wlan.status()
            if status < 0:
                print("Wi-Fi failed, status =", status)
                break
            if time.ticks_diff(time.ticks_ms(), started) > 30000:
                print("Wi-Fi timeout, status =", status)
                break
            time.sleep_ms(500)

        if not wlan.isconnected():
            try:
                wlan.disconnect()
            except Exception:
                pass
            print("Retrying Wi-Fi in 3 seconds...")
            time.sleep(3)

    print("Wi-Fi connected:", wlan.ifconfig()[0])
    return wlan


opto = Pin(OPTO_PIN, Pin.IN, Pin.PULL_UP)


def opto_active():
    v = opto.value()
    return v == 0 if ACTIVE_LOW else v == 1


def start_normal_mabel():
    global trigger_count, last_trigger_ms, last_post_status, last_post_ok
    trigger_count += 1
    last_trigger_ms = time.ticks_ms()
    print("Optocoupler active -> starting Normal Mabel")

    response = None
    try:
        response = urequests.post(MABEL_URL, json={})
        last_post_status = str(response.status_code)
        last_post_ok = 200 <= response.status_code < 300
        print("POST status:", response.status_code)
        return last_post_ok
    except Exception as exc:
        last_post_status = "ERROR: {}".format(exc)
        last_post_ok = False
        print("POST failed:", exc)
        return False
    finally:
        if response is not None:
            try:
                response.close()
            except Exception:
                pass


def uptime_text():
    s = time.ticks_diff(time.ticks_ms(), boot_ms) // 1000
    d, s = divmod(s, 86400)
    h, s = divmod(s, 3600)
    m, s = divmod(s, 60)
    if d:
        return "{}d {:02}:{:02}:{:02}".format(d, h, m, s)
    return "{:02}:{:02}:{:02}".format(h, m, s)


def last_trigger_text():
    if last_trigger_ms is None:
        return "Never"
    age = time.ticks_diff(time.ticks_ms(), last_trigger_ms) // 1000
    return "{} sec ago".format(age)


def make_page(wlan):
    ip = wlan.ifconfig()[0]
    active = opto_active()
    post_class = "ok" if last_post_ok is True else ("bad" if last_post_ok is False else "")
    return """<!doctype html>
<html><head><meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<meta http-equiv='refresh' content='5'>
<title>Shyvers Multiphone Pico</title>
<style>
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#111;color:#eee;margin:0;padding:24px}}
.card{{max-width:620px;margin:auto;background:#1d1d1f;border-radius:16px;padding:24px}}
h1{{margin-top:0}} .online{{display:inline-block;background:#244c2a;padding:6px 10px;border-radius:999px;font-weight:700}}
table{{width:100%;border-collapse:collapse;margin-top:20px}} td{{padding:9px 0;border-bottom:1px solid #333}} td:first-child{{color:#aaa}} td:last-child{{text-align:right;font-family:monospace}}
.ok{{color:#7ee787}} .bad{{color:#ff7b72}} .foot{{color:#777;font-size:12px;margin-top:18px}}
</style></head><body><div class='card'>
<h1>Shyvers Multiphone Pico</h1><div class='online'>ONLINE</div>
<table>
<tr><td>IP address</td><td>{}</td></tr>
<tr><td>Uptime</td><td>{}</td></tr>
<tr><td>GPIO</td><td>GP{}</td></tr>
<tr><td>Raw input</td><td>{}</td></tr>
<tr><td>Optocoupler</td><td>{}</td></tr>
<tr><td>Armed</td><td>{}</td></tr>
<tr><td>Trigger count</td><td>{}</td></tr>
<tr><td>Last trigger</td><td>{}</td></tr>
<tr><td>Last POST</td><td class='{}'>{}</td></tr>
</table>
<div class='foot'>Auto-refreshes every 5 seconds. Shyvers is busy!!</div>
</div></body></html>""".format(
        ip, uptime_text(), OPTO_PIN, opto.value(),
        "ACTIVE" if active else "inactive",
        "YES" if armed else "NO",
        trigger_count, last_trigger_text(), post_class, last_post_status
    )


def start_server():
    addr = socket.getaddrinfo("0.0.0.0", HTTP_PORT)[0][-1]
    s = socket.socket()
    try:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    except Exception:
        pass
    s.bind(addr)
    s.listen(2)
    s.setblocking(False)
    return s


def service_web(server, wlan):
    try:
        client, addr = server.accept()
    except OSError:
        return

    try:
        client.settimeout(1)
        try:
            client.recv(512)
        except Exception:
            pass
        html = make_page(wlan)
        header = (
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: text/html; charset=utf-8\r\n"
            "Cache-Control: no-store\r\n"
            "Connection: close\r\n"
            "Content-Length: {}\r\n\r\n"
        ).format(len(html))
        client.send(header.encode())
        client.send(html.encode())
    except Exception as exc:
        print("Web request error:", exc)
    finally:
        try:
            client.close()
        except Exception:
            pass


def main():
    global armed
    print("BOOTED main.py")
    wlan = connect_wifi()
    server = start_server()

    print("Watching optocoupler on GPIO", OPTO_PIN)
    print("ACTIVE_LOW =", ACTIVE_LOW)
    print("Status page: http://{}/".format(wlan.ifconfig()[0]))
    print("Ready.")

    active_since = None
    inactive_since = None

    while True:
        now = time.ticks_ms()
        active = opto_active()

        service_web(server, wlan)

        if not wlan.isconnected():
            print("Wi-Fi disconnected; reconnecting...")
            try:
                server.close()
            except Exception:
                pass
            wlan = connect_wifi()
            server = start_server()
            print("Status page: http://{}/".format(wlan.ifconfig()[0]))

        if armed:
            if active:
                if active_since is None:
                    active_since = now
                elif time.ticks_diff(now, active_since) >= ACTIVE_DEBOUNCE_MS:
                    start_normal_mabel()
                    armed = False
                    active_since = None
                    inactive_since = None
            else:
                active_since = None
        else:
            if not active:
                if inactive_since is None:
                    inactive_since = now
                elif time.ticks_diff(now, inactive_since) >= REARM_MS:
                    armed = True
                    inactive_since = None
                    print("Re-armed")
            else:
                inactive_since = None

        time.sleep_ms(POLL_MS)


try:
    main()
except KeyboardInterrupt:
    print("Stopped.")