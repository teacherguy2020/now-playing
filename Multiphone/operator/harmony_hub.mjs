#!/usr/bin/env node
/**
 * Generic Logitech Harmony Hub WebSocket client.
 *
 * The module keeps one connection open, probes it with WebSocket ping/pong,
 * reconnects after close/staleness, and retries failed requests on a fresh
 * connection. It intentionally knows nothing about a particular receiver or
 * room; device/activity names come from config/harmony-mapping.json.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mappingPath = path.join(root, 'config', 'harmony-mapping.json');
const ENGINE = 'vnd.logitech.harmony/vnd.logitech.harmony.engine?';

function stringValue(value, field) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${field} is required`);
  return result;
}

function envelope(hubId, command, params, id) {
  return {
    hubId: String(hubId),
    timeout: 30,
    hbus: { cmd: command, id: String(id), params },
  };
}

function responseBody(message) {
  return message?.hbus && typeof message.hbus === 'object' ? message.hbus : message;
}

function responseId(message) {
  return String(message?.id ?? message?.hbus?.id ?? '');
}

function responseError(message) {
  const body = responseBody(message);
  const code = Number(body?.code);
  if (Number.isFinite(code) && code >= 400) return new Error(`Harmony request failed (${code}): ${body.msg || 'unknown error'}`);
  if (body?.error) return new Error(`Harmony request failed: ${body.error}`);
  return null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HarmonyHubClient {
  constructor({
    host = process.env.HARMONY_HOST || '10.0.0.21',
    port = Number(process.env.HARMONY_PORT || 8088),
    domain = process.env.HARMONY_DOMAIN || 'svcs.myharmony.com',
    hubId = process.env.HARMONY_HUB_ID || '3871019',
    connectTimeoutMs = 10000,
    requestTimeoutMs = 30000,
    heartbeatMs = 50000,
    pongTimeoutMs = 10000,
    maxRetries = 2,
  } = {}) {
    this.host = host;
    this.port = port;
    this.domain = domain;
    this.hubId = String(hubId);
    this.url = `ws://${host}:${port}/?domain=${domain}&hubId=${this.hubId}`;
    this.connectTimeoutMs = connectTimeoutMs;
    this.requestTimeoutMs = requestTimeoutMs;
    this.heartbeatMs = heartbeatMs;
    this.pongTimeoutMs = pongTimeoutMs;
    this.maxRetries = maxRetries;
    this.socket = null;
    this.connecting = null;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.pongTimer = null;
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;
  }

  isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async connect() {
    this.closed = false;
    if (this.isOpen()) return this;
    if (this.connecting) return this.connecting;
    this.connecting = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.terminate();
        reject(new Error(`Harmony connection timed out: ${this.url}`));
      }, this.connectTimeoutMs);
      this.socket = socket;
      socket.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this._startHeartbeat(socket);
        resolve(this);
      });
      socket.on('pong', () => {
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pongTimer = null;
      });
      socket.on('message', (data) => this._handleMessage(socket, data));
      socket.on('error', (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      });
      socket.on('close', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('Harmony WebSocket closed while connecting'));
        }
        this._handleClose(socket);
      });
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this._stopHeartbeat();
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close();
    this.socket = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Harmony client closed'));
    }
    this.pending.clear();
  }

  async reconnect() {
    this.closed = false;
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.terminate();
    else this.socket = null;
    this._stopHeartbeat();
    await delay(25);
    return this.connect();
  }

  async request(command, params = {}, { timeoutMs = this.requestTimeoutMs, retries = this.maxRetries } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        await this.connect();
        return await this._sendOnce(command, params, timeoutMs);
      } catch (error) {
        lastError = error;
        if (attempt >= retries) break;
        await this.reconnect().catch(() => {});
        await delay(Math.min(250 * (attempt + 1), 1000));
      }
    }
    throw lastError;
  }

  // Harmony holdAction commonly performs the IR action without returning a
  // correlated hbus response. Treat a successful WebSocket send as success,
  // while still retrying when the connection closes or send itself fails.
  async sendWithoutResponse(command, params = {}, { retries = this.maxRetries } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        await this.connect();
        return await this._sendWithoutResponseOnce(command, params);
      } catch (error) {
        lastError = error;
        if (attempt >= retries) break;
        await this.reconnect().catch(() => {});
        await delay(Math.min(250 * (attempt + 1), 1000));
      }
    }
    throw lastError;
  }

  async _sendWithoutResponseOnce(command, params) {
    if (!this.isOpen()) throw new Error('Harmony WebSocket is not open');
    const id = String(this.nextId++);
    const payload = envelope(this.hubId, command, params, id);
    return new Promise((resolve, reject) => {
      this.socket.send(JSON.stringify(payload), (error) => {
        if (error) reject(error);
        else resolve({ sent: true, id });
      });
    });
  }

  async _sendOnce(command, params, timeoutMs) {
    if (!this.isOpen()) throw new Error('Harmony WebSocket is not open');
    const id = String(this.nextId++);
    const payload = envelope(this.hubId, command, params, id);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Harmony request timed out: ${command}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.send(JSON.stringify(payload), (error) => {
          if (!error) return;
          clearTimeout(timer);
          this.pending.delete(id);
          reject(error);
        });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  _handleMessage(socket, data) {
    if (socket !== this.socket) return;
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }
    const id = responseId(message);
    if (!id || !this.pending.has(id)) return;
    const pending = this.pending.get(id);
    this.pending.delete(id);
    clearTimeout(pending.timer);
    const error = responseError(message);
    if (error) pending.reject(error);
    else pending.resolve(message);
  }

  _handleClose(socket) {
    if (socket !== this.socket) return;
    this._stopHeartbeat();
    this.socket = null;
    const error = new Error('Harmony WebSocket closed');
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    if (!this.closed) this._scheduleReconnect();
  }

  _scheduleReconnect() {
    if (this.reconnectTimer || this.closed) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => this._scheduleReconnect());
    }, 500);
  }

  _startHeartbeat(socket) {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (socket !== this.socket || !this.isOpen()) return;
      if (this.pongTimer) {
        socket.terminate();
        return;
      }
      this.pongTimer = setTimeout(() => socket.terminate(), this.pongTimeoutMs);
      socket.ping();
    }, this.heartbeatMs);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.heartbeatTimer = null;
    this.pongTimer = null;
  }
}

export async function harmony_command(device_id, command, status = 'press', options = {}) {
  const deviceId = stringValue(device_id, 'device_id');
  const commandName = stringValue(command, 'command');
  if (!['press', 'release'].includes(status)) throw new TypeError('status must be "press" or "release"');
  const client = options.client || defaultClient;
  const action = JSON.stringify({ command: commandName, type: 'IRCommand', deviceId });
  return client.request(`${ENGINE}holdAction`, {
    status,
    timestamp: '0',
    verb: 'render',
    action,
  }, options);
}

export async function harmony_press_many(device_id, command, count, {
  client = defaultClient,
  interPressMs = 45,
  ...options
} = {}) {
  const deviceId = stringValue(device_id, 'device_id');
  const commandName = stringValue(command, 'command');
  const presses = Number(count);
  if (!Number.isInteger(presses) || presses < 1) throw new TypeError('count must be a positive integer');
  const action = JSON.stringify({ command: commandName, type: 'IRCommand', deviceId });
  let sent = 0;
  try {
    for (let index = 0; index < presses; index += 1) {
      await client.sendWithoutResponse(`${ENGINE}holdAction`, {
        status: 'press', timestamp: '0', verb: 'render', action,
      }, options);
      sent += 1;
      if (index < presses - 1 && interPressMs > 0) await delay(interPressMs);
    }
  } catch (error) {
    error.sent = sent;
    throw error;
  }
  return { sent };
}

export async function harmony_start_activity(activity_id, options = {}) {
  const activityId = stringValue(activity_id, 'activity_id');
  const client = options.client || defaultClient;
  return client.request('harmony.activityengine?runactivity', {
    async: 'true',
    timestamp: Date.now(),
    args: { rule: 'start' },
    activityId,
  }, options);
}

export async function harmony_get_config(options = {}) {
  const client = options.client || defaultClient;
  const response = await client.request(`${ENGINE}config`, { verb: 'get', format: 'json' }, options);
  const body = responseBody(response);
  return body?.data ?? body;
}

async function loadMapping(file = mappingPath) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function normalized(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

function oneMatch(items, value, kind) {
  const needle = normalized(value);
  const matches = items.filter((item) => [item.id, item.name, item.label, item.command].some((candidate) => normalized(candidate) === needle));
  if (matches.length === 0) throw new Error(`No ${kind} named or identified as ${value}`);
  if (matches.length > 1) throw new Error(`Ambiguous ${kind}: ${value}`);
  return matches[0];
}

export async function harmony_command_by_name(device_name, command_name, status = 'press', options = {}) {
  const mapping = await loadMapping(options.mappingPath || mappingPath);
  const device = oneMatch(mapping.devices, device_name, 'device');
  const command = oneMatch(device.commands, command_name, 'command');
  return harmony_command(device.id, command.command, status, options);
}

export async function harmony_start_activity_by_name(activity_name, options = {}) {
  const mapping = await loadMapping(options.mappingPath || mappingPath);
  const activity = oneMatch(mapping.activities, activity_name, 'activity');
  return harmony_start_activity(activity.id, options);
}

export const defaultClient = new HarmonyHubClient();

function cliArgs(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index].startsWith('--')) args.set(argv[index].slice(2), argv[index + 1] || '');
  }
  return args;
}

function help() {
  console.log(`Harmony Hub control\n\nCommands:\n  config\n  command --device-id ID --command NAME [--status press|release]\n  command-by-name --device NAME --command NAME [--status press|release]\n  activity --activity-id ID\n  activity-by-name --activity NAME\n  lookup\n\nEnvironment overrides: HARMONY_HOST, HARMONY_PORT, HARMONY_DOMAIN, HARMONY_HUB_ID`);
}

async function main() {
  const args = cliArgs(process.argv);
  const operation = process.argv[2];
  if (!operation || operation === '--help' || operation === 'help') return help();
  let result;
  if (operation === 'lookup') result = await loadMapping(args.get('mapping') || mappingPath);
  else if (operation === 'config') result = await harmony_get_config();
  else if (operation === 'command') result = await harmony_command(args.get('device-id'), args.get('command'), args.get('status') || 'press');
  else if (operation === 'command-by-name') result = await harmony_command_by_name(args.get('device'), args.get('command'), args.get('status') || 'press');
  else if (operation === 'activity') result = await harmony_start_activity(args.get('activity-id'));
  else if (operation === 'activity-by-name') result = await harmony_start_activity_by_name(args.get('activity'));
  else throw new Error(`Unknown operation: ${operation}`);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    defaultClient.close();
    process.exitCode = 1;
  });
}
