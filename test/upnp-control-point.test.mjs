import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UpnpControlPoint,
  UpnpError,
  buildSoapEnvelope,
  parseDeviceDescription,
  parseDidlLite,
  parseServiceDescription,
  parseSoapResponse,
  parseSsdpResponse,
  requestTextBounded,
  validateTrustedLocalUrl,
} from '../src/lib/upnp-control-point.mjs';

const DEVICE_LOCATION = 'http://10.0.0.254:49152/root.xml';
const CONTENT_SCPD = 'http://10.0.0.254:49152/content.xml';
const CONTENT_CONTROL = 'http://10.0.0.254:49152/content-control';
const CONNECTION_SCPD = 'http://10.0.0.254:49152/connection.xml';
const CONNECTION_CONTROL = 'http://10.0.0.254:49152/connection-control';
const AV_SCPD = 'http://10.0.0.254:49152/av.xml';
const AV_CONTROL = 'http://10.0.0.254:49152/av-control';

const DEVICE_XML = `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <URLBase>http://10.0.0.254:49152/</URLBase>
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>
    <friendlyName>Fixture Library</friendlyName>
    <manufacturer>Fixture</manufacturer>
    <modelName>Library 1</modelName>
    <UDN>uuid:fixture-server</UDN>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:ContentDirectory:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:ContentDirectory</serviceId>
        <SCPDURL>/content.xml</SCPDURL>
        <controlURL>/content-control</controlURL>
        <eventSubURL>/content-events</eventSubURL>
      </service>
    </serviceList>
  </device>
  <deviceList>
    <device>
      <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
      <friendlyName>Fixture Renderer</friendlyName>
      <manufacturer>Fixture</manufacturer>
      <modelName>Renderer 1</modelName>
      <UDN>uuid:fixture-renderer</UDN>
      <serviceList>
        <service>
          <serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType>
          <serviceId>urn:upnp-org:serviceId:AVTransport</serviceId>
          <SCPDURL>/av.xml</SCPDURL>
          <controlURL>/av-control</controlURL>
          <eventSubURL>/av-events</eventSubURL>
        </service>
        <service>
          <serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType>
          <serviceId>urn:upnp-org:serviceId:RenderingControl</serviceId>
          <SCPDURL>/rendering.xml</SCPDURL>
          <controlURL>/rendering-control</controlURL>
          <eventSubURL>/rendering-events</eventSubURL>
        </service>
        <service>
          <serviceType>urn:schemas-upnp-org:service:ConnectionManager:1</serviceType>
          <serviceId>urn:upnp-org:serviceId:ConnectionManager</serviceId>
          <SCPDURL>/connection.xml</SCPDURL>
          <controlURL>/connection-control</controlURL>
          <eventSubURL>/connection-events</eventSubURL>
        </service>
      </serviceList>
    </device>
  </deviceList>
</root>`;

const CONTENT_SCPD_XML = `<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <actionList>
    <action><name>Browse</name></action>
    <action><name>Search</name></action>
    <action><name>GetSearchCapabilities</name></action>
    <action><name>GetSortCapabilities</name></action>
  </actionList>
</scpd>`;

const CONNECTION_SCPD_XML = `<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <actionList><action><name>GetProtocolInfo</name></action></actionList>
</scpd>`;

const AV_SCPD_XML = `<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <actionList>
    <action><name>GetTransportInfo</name></action>
    <action><name>GetPositionInfo</name></action>
    <action><name>GetMediaInfo</name></action>
    <action><name>GetCurrentTransportActions</name></action>
    <action><name>Play</name></action>
    <action><name>Pause</name></action>
    <action><name>Stop</name></action>
    <action><name>Seek</name></action>
    <action><name>SetAVTransportURI</name></action>
    <action><name>SetNextAVTransportURI</name></action>
  </actionList>
</scpd>`;

const DIDL_XML = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">
  <container id="albums" parentID="0" restricted="1">
    <dc:title>Albums &amp; More</dc:title>
    <upnp:class>object.container.album</upnp:class>
    <upnp:albumArtURI>http://10.0.0.254:8200/art/album.jpg</upnp:albumArtURI>
  </container>
  <item id="track-1" parentID="albums" restricted="1">
    <dc:title>Track &amp; One</dc:title>
    <dc:creator>Artist One</dc:creator>
    <upnp:artist role="AlbumArtist">Artist One</upnp:artist>
    <upnp:album>Album One</upnp:album>
    <upnp:originalTrackNumber>1</upnp:originalTrackNumber>
    <upnp:class>object.item.audioItem.musicTrack</upnp:class>
    <res protocolInfo="http-get:*:audio/flac:*" duration="00:03:21.500" sampleFrequency="192000" bitsPerSample="24" nrAudioChannels="2">http://10.0.0.254:8200/track.flac?token=secret</res>
  </item>
</DIDL-Lite>`;

function response(body, status = 200) {
  const bytes = Buffer.from(String(body), 'utf8');
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => String(name).toLowerCase() === 'content-length' ? String(bytes.length) : '' },
    arrayBuffer: async () => bytes,
  };
}

function soapResponse(action, fields = {}) {
  const output = Object.entries(fields).map(([key, value]) => `<${key}>${String(value)}</${key}>`).join('');
  return `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:${action}Response xmlns:u="urn:schemas-upnp-org:service:${action}:1">${output}</u:${action}Response></s:Body></s:Envelope>`;
}

function fakeSocketFactory(ssdpMessage) {
  const sent = [];
  const factory = () => {
    const listeners = new Map();
    return {
      on(event, handler) { listeners.set(event, handler); return this; },
      bind(_options, callback) {
        callback();
        queueMicrotask(() => listeners.get('message')?.(Buffer.from(ssdpMessage), { address: '10.0.0.254', port: 1900 }));
      },
      send(payload, ...args) { sent.push({ payload: payload.toString('utf8'), args }); },
      close() {},
    };
  };
  factory.sent = sent;
  return factory;
}

test('SSDP parser accepts valid local responses and rejects malformed/external locations', () => {
  const valid = parseSsdpResponse([
    'HTTP/1.1 200 OK',
    'ST: urn:schemas-upnp-org:device:MediaRenderer:1',
    'USN: uuid:renderer::urn:schemas-upnp-org:device:MediaRenderer:1',
    'LOCATION: http://10.0.0.254:49152/description.xml',
    '',
  ].join('\r\n'));
  assert.equal(valid.location, 'http://10.0.0.254:49152/description.xml');
  assert.equal(valid.st, 'urn:schemas-upnp-org:device:MediaRenderer:1');
  assert.equal(parseSsdpResponse('NOTIFY * HTTP/1.1\r\nLOCATION: http://10.0.0.254/a\r\n'), null);
  assert.equal(parseSsdpResponse('HTTP/1.1 200 OK\r\nLOCATION: ftp://10.0.0.254/a\r\n'), null);
  assert.equal(parseSsdpResponse('HTTP/1.1 200 OK\r\nLOCATION: http://user:pass@10.0.0.254/a\r\n'), null);
});

test('device, service, and DIDL parsers normalize relative URLs and metadata', () => {
  const description = parseDeviceDescription(DEVICE_XML, { location: DEVICE_LOCATION });
  assert.equal(description.devices.length, 2);
  const server = description.devices.find((device) => device.roles.includes('media-server'));
  const renderer = description.devices.find((device) => device.roles.includes('media-renderer'));
  assert.equal(server.friendlyName, 'Fixture Library');
  assert.equal(server.services[0].scpdUrl, CONTENT_SCPD);
  assert.equal(server.services[0].controlUrl, CONTENT_CONTROL);
  assert.deepEqual(renderer.roles, ['media-renderer']);
  assert.equal(renderer.services.length, 3);

  const scpd = parseServiceDescription(CONTENT_SCPD_XML);
  assert.deepEqual(scpd.actionNames, ['Browse', 'Search', 'GetSearchCapabilities', 'GetSortCapabilities']);

  const items = parseDidlLite(DIDL_XML);
  assert.equal(items.length, 2);
  assert.equal(items[0].kind, 'container');
  assert.equal(items[0].title, 'Albums & More');
  assert.equal(items[1].title, 'Track & One');
  assert.equal(items[1].artist, 'Artist One');
  assert.equal(items[1].trackNumber, 1);
  assert.equal(items[1].durationSeconds, 201.5);
  assert.equal(items[1].resources[0].mimeType, 'audio/flac');
  assert.equal(items[1].resources[0].bitsPerSample, 24);
  assert.equal(items[1].resources[0].sampleFrequency, 192000);
  assert.equal(items[1].resources[0].uri, 'http://10.0.0.254:8200/track.flac?token=secret');
});

test('SOAP envelopes and responses are escaped, parsed, and faulted safely', () => {
  const envelope = buildSoapEnvelope('urn:schemas-upnp-org:service:ContentDirectory:1', 'Browse', {
    ObjectID: 'A&B',
    Filter: '*',
  });
  assert.match(envelope, /<ObjectID>A&amp;B<\/ObjectID>/);
  const parsed = parseSoapResponse(soapResponse('GetProtocolInfo', {
    Source: 'http-get:*:audio/flac:*',
    Sink: 'http-get:*:audio/flac:*,http-get:*:audio/mpeg:*',
  }), 'GetProtocolInfo');
  assert.equal(parsed.Source, 'http-get:*:audio/flac:*');
  assert.match(parsed.Sink, /audio\/mpeg/);
  assert.throws(() => parseSoapResponse(
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><detail><UPnPError><errorCode>701</errorCode><errorDescription>Transition not available</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>',
    'Play',
  ), (error) => error instanceof UpnpError && error.code === 'UPNP_SOAP_FAULT');
});

test('advertised URLs are limited to trusted local targets and bounded responses', async () => {
  await assert.rejects(
    () => validateTrustedLocalUrl('http://8.8.8.8/device.xml'),
    (error) => error.code === 'UPNP_UNSAFE_URL',
  );
  await assert.rejects(
    () => validateTrustedLocalUrl('http://127.0.0.1:8080/admin'),
    (error) => error.code === 'UPNP_UNSAFE_URL',
  );
  await assert.doesNotReject(() => validateTrustedLocalUrl('http://10.0.0.254:49152/device.xml'));
  await assert.rejects(
    () => requestTextBounded('http://10.0.0.254/device.xml', {
      validateUrl: async (url) => new URL(url),
      fetchImpl: async () => response('x'.repeat(32)),
      maxBytes: 16,
    }),
    (error) => error.code === 'UPNP_RESPONSE_TOO_LARGE',
  );
  await assert.rejects(
    () => requestTextBounded('http://10.0.0.254/device.xml', {
      validateUrl: async (url) => new URL(url),
      fetchImpl: async () => response('', 302),
    }),
    (error) => error.code === 'UPNP_UNSAFE_REDIRECT',
  );
});

test('control point discovers, browses, inspects capabilities, and never mutates playback', async () => {
  const ssdp = [
    'HTTP/1.1 200 OK',
    'ST: urn:schemas-upnp-org:device:MediaServer:1',
    'USN: uuid:fixture-root::urn:schemas-upnp-org:device:MediaServer:1',
    `LOCATION: ${DEVICE_LOCATION}`,
    '',
  ].join('\r\n');
  const socketFactory = fakeSocketFactory(ssdp);
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    requests.push({ url: target, method: options.method || 'GET', soapAction: options.headers?.SOAPAction || '' });
    if (options.method === 'POST') {
      const action = String(options.headers?.SOAPAction || '').replace(/^".*#|"$/g, '');
      if (action === 'GetSearchCapabilities') return response(soapResponse(action, { SearchCaps: 'dc:title,upnp:artist' }));
      if (action === 'GetSortCapabilities') return response(soapResponse(action, { SortCaps: 'dc:title' }));
      if (action === 'Browse') return response(soapResponse(action, {
        Result: DIDL_XML.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
        NumberReturned: '2',
        TotalMatches: '2',
        UpdateID: '7',
      }));
      if (action === 'GetProtocolInfo') return response(soapResponse(action, {
        Source: '',
        Sink: 'http-get:*:audio/flac:*,http-get:*:audio/mpeg:*',
      }));
      if (action === 'GetTransportInfo') return response(soapResponse(action, {
        CurrentTransportState: 'STOPPED', CurrentTransportStatus: 'OK', CurrentSpeed: '1',
      }));
      if (action === 'GetPositionInfo') return response(soapResponse(action, {
        Track: '0', TrackDuration: '00:00:00', RelTime: '00:00:00', AbsTime: '00:00:00',
      }));
      if (action === 'GetMediaInfo') return response(soapResponse(action, {
        NrTracks: '0', MediaDuration: '00:00:00', CurrentURI: '', NextURI: '',
      }));
      if (action === 'GetCurrentTransportActions') return response(soapResponse(action, { Actions: 'Play,Pause,Stop,Seek' }));
      throw new Error(`unexpected SOAP action ${action}`);
    }
    const bodies = new Map([
      [DEVICE_LOCATION, DEVICE_XML],
      [CONTENT_SCPD, CONTENT_SCPD_XML],
      [CONNECTION_SCPD, CONNECTION_SCPD_XML],
      [AV_SCPD, AV_SCPD_XML],
      ['http://10.0.0.254:49152/rendering.xml', '<scpd xmlns="urn:schemas-upnp-org:service-1-0"><actionList/></scpd>'],
    ]);
    if (!bodies.has(target)) throw new Error(`unexpected GET ${target}`);
    return response(bodies.get(target));
  };

  const point = new UpnpControlPoint({
    fetchImpl,
    socketFactory,
    interfaces: [{ name: 'eth0', address: '10.0.0.4' }],
    discoveryTimeoutMs: 250,
    httpTimeoutMs: 1000,
    validateUrl: async (url) => new URL(url),
  });

  const discovery = await point.discover({ force: true });
  assert.equal(discovery.devices.length, 2);
  const server = discovery.devices.find((device) => device.roles.includes('media-server'));
  const renderer = discovery.devices.find((device) => device.roles.includes('media-renderer'));
  assert.ok(server?.id);
  assert.ok(renderer?.id);
  assert.ok(socketFactory.sent.some((entry) => entry.payload.includes('MediaServer:1')));
  assert.ok(socketFactory.sent.some((entry) => entry.payload.includes('MediaRenderer:1')));

  const capabilities = await point.mediaServerCapabilities(server.id);
  assert.equal(capabilities.browse, true);
  assert.equal(capabilities.search, true);
  assert.deepEqual(capabilities.searchCapabilities, ['dc:title', 'upnp:artist']);

  const browse = await point.browse(server.id, { objectId: '0', requestedCount: 10 });
  assert.equal(browse.items[1].title, 'Track & One');
  assert.equal(browse.totalMatches, 2);

  const rendererInfo = await point.inspectRenderer(renderer.id);
  assert.equal(rendererInfo.readOnly, true);
  assert.equal(rendererInfo.playbackMutationAvailable, false);
  assert.ok(rendererInfo.protocolInfo.sink.some((value) => value.includes('audio/flac')));
  assert.equal(rendererInfo.readOnlyState.transport.state, 'STOPPED');
  assert.deepEqual(rendererInfo.readOnlyState.currentActions, ['Play', 'Pause', 'Stop', 'Seek']);

  const soapActions = requests.filter((entry) => entry.method === 'POST').map((entry) => entry.soapAction);
  assert.ok(soapActions.length > 0);
  for (const action of soapActions) {
    assert.doesNotMatch(action, /#(?:Play|Pause|Stop|Seek|SetAVTransportURI|SetNextAVTransportURI)"$/);
  }
});

test('AVTransport exposes only the bounded renderer transport allowlist', async () => {
  const requests = [];
  const point = new UpnpControlPoint({
    validateUrl: async (url) => new URL(url),
    fetchImpl: async (_url, options = {}) => {
      requests.push(options.headers?.SOAPAction || '');
      const action = String(options.headers?.SOAPAction || '').replace(/^".*#|"$/g, '');
      return response(soapResponse(action, {
        CurrentTransportState: 'STOPPED',
        CurrentTransportStatus: 'OK',
      }));
    },
  });
  point.devices.set('renderer-1', {
    id: 'renderer-1',
    udn: 'uuid:renderer-1',
    location: 'http://10.0.0.254:49152/root.xml',
    deviceType: 'urn:schemas-upnp-org:device:MediaRenderer:1',
    roles: ['media-renderer'],
    services: [{
      serviceType: 'urn:schemas-upnp-org:service:AVTransport:1',
      serviceId: 'urn:upnp-org:serviceId:AVTransport',
      version: 1,
      scpdUrl: AV_SCPD,
      controlUrl: AV_CONTROL,
      eventSubUrl: '',
    }],
  });
  point.scpdCache.set(AV_SCPD, {
    expiresAt: Date.now() + 60_000,
    description: parseServiceDescription(AV_SCPD_XML),
  });

  await point.transportAction('renderer-1', 'SetAVTransportURI', {
    InstanceID: 0,
    CurrentURI: 'http://10.0.0.254:8200/track.flac?token=fixture',
    CurrentURIMetaData: '<DIDL-Lite/>',
  });
  await point.transportAction('renderer-1', 'Play', { InstanceID: 0, Speed: '1' });
  assert.equal(requests.length, 2);
  assert.match(requests[0], /#SetAVTransportURI/);
  assert.match(requests[1], /#Play/);
  await point.transportAction('renderer-1', 'SetNextAVTransportURI', {
    InstanceID: 0,
    NextURI: 'http://10.0.0.254:8200/next.flac?token=***',
    NextURIMetaData: '<DIDL-Lite/>',
  });
  assert.equal(requests.length, 3);
  assert.match(requests[2], /#SetNextAVTransportURI/);
  await point.transportAction('renderer-1', 'SetNextAVTransportURI', {
    InstanceID: 0,
    NextURI: '',
    NextURIMetaData: '',
  });
  assert.equal(requests.length, 4);
  assert.match(requests[3], /#SetNextAVTransportURI/);
  await point.transportAction('renderer-1', 'Seek', {
    InstanceID: 0,
    Unit: 'REL_TIME',
    Target: '00:00:01',
  });
  assert.equal(requests.length, 5);
  assert.match(requests[4], /#Seek/);
  await assert.rejects(
    () => point.transportAction('renderer-1', 'Seek', { InstanceID: 0, Unit: 'TRACK_NR', Target: '2' }),
    (error) => error.code === 'UPNP_BAD_REQUEST',
  );
  await assert.rejects(
    () => point.transportAction('renderer-1', 'Next', { InstanceID: 0 }),
    (error) => error.code === 'UPNP_UNSUPPORTED',
  );
  await assert.rejects(
    () => point.transportAction('renderer-1', 'Play', { InstanceID: 0, Speed: '2' }),
    (error) => error.code === 'UPNP_BAD_REQUEST',
  );
});
