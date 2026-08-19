const mongoose = require('mongoose');
const env = require('./env');

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const isSrvDnsError = (error) => error?.syscall === 'querySrv' || ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEOUT', 'ESERVFAIL'].includes(error?.code);

const safeConnectionMessage = (error) => {
  if (isSrvDnsError(error)) {
    const host = error.hostname ? ` (${error.hostname})` : '';
    return `MongoDB Atlas DNS lookup failed${host}. Verify the Atlas SRV hostname in MONGODB_URI and the runtime DNS/network configuration.`;
  }
  if (/authentication failed|bad auth/i.test(error?.message || '')) {
    return 'MongoDB Atlas authentication failed. Verify the database username, password, and URL encoding in MONGODB_URI.';
  }
  if (/IP that isn.t whitelisted|not authorized/i.test(error?.message || '')) {
    return 'MongoDB Atlas rejected the network address. Update the Atlas Network Access list for the Render service.';
  }
  return `MongoDB connection failed${error?.code ? ` (${error.code})` : ''}.`;
};

const parseSrvUri = (uri) => {
  const match = uri.match(/^mongodb\+srv:\/\/(?:([^@/?]+)@)?([^/?#]+)(\/[^?#]*)?(\?[^#]*)?$/i);
  if (!match) throw new Error('MONGODB_URI is not a valid MongoDB SRV URI');
  return { credentials: match[1] ? `${match[1]}@` : '', hostname: match[2].toLowerCase(), path: match[3] || '/', search: match[4]?.slice(1) || '' };
};

const dnsOverHttps = async (name, type) => {
  const endpoint = process.env.DNS_OVER_HTTPS_URL?.trim() || 'https://cloudflare-dns.com/dns-query';
  const url = new URL(endpoint);
  url.searchParams.set('name', name);
  url.searchParams.set('type', type);
  const response = await fetch(url, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`DNS-over-HTTPS returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.Status !== 0 || !Array.isArray(payload.Answer)) throw new Error(`DNS-over-HTTPS lookup failed with status ${payload.Status}`);
  return payload.Answer;
};

const buildStandardUri = ({ credentials, hostname, path, search }, srvAnswers, txtAnswers = []) => {
  const domainParts = hostname.split('.');
  if (domainParts.length < 4) throw new Error('Atlas SRV hostname does not contain a valid project domain');
  const allowedSuffix = `.${domainParts.slice(1).join('.')}`;
  const hosts = srvAnswers.map(({ data }) => {
    const parts = String(data).trim().split(/\s+/);
    const port = Number(parts[2]);
    const target = String(parts[3] || '').replace(/\.$/, '').toLowerCase();
    if (!target.endsWith(allowedSuffix) || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Atlas DNS returned an invalid SRV target');
    }
    return `${target}:${port}`;
  });
  if (!hosts.length) throw new Error('Atlas DNS returned no SRV targets');
  const parameters = new URLSearchParams(search);
  const txtValue = txtAnswers.map(({ data }) => String(data).replace(/^"|"$/g, '').replace(/"\s*"/g, '')).join('');
  if (txtValue) {
    for (const [key, value] of new URLSearchParams(txtValue)) if (!parameters.has(key)) parameters.set(key, value);
  }
  if (!parameters.has('tls') && !parameters.has('ssl')) parameters.set('tls', 'true');
  return `mongodb://${credentials}${hosts.join(',')}${path}?${parameters.toString()}`;
};

const resolveSrvFallback = async (uri) => {
  const parsed = parseSrvUri(uri);
  const [srvAnswers, txtAnswers] = await Promise.all([
    dnsOverHttps(`_mongodb._tcp.${parsed.hostname}`, 'SRV'),
    dnsOverHttps(parsed.hostname, 'TXT').catch(() => []),
  ]);
  return buildStandardUri(parsed, srvAnswers, txtAnswers);
};

async function connectDB() {
  mongoose.set('strictQuery', true);
  const attempts = env.production ? 6 : 3;
  let connectionUri = env.mongoUri;
  let fallbackAttempted = false;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await mongoose.connect(connectionUri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        maxPoolSize: 20,
        minPoolSize: 1,
        retryWrites: true,
      });
      console.log(`MongoDB connected: ${mongoose.connection.host}`);
      return mongoose.connection;
    } catch (error) {
      console.error(`${safeConnectionMessage(error)} Attempt ${attempt} of ${attempts}.`);
      if (!fallbackAttempted && env.mongoUri.startsWith('mongodb+srv://') && isSrvDnsError(error)) {
        fallbackAttempted = true;
        try {
          connectionUri = await resolveSrvFallback(env.mongoUri);
          console.warn('Normal Atlas SRV resolution is unavailable. Retrying through the validated DNS-over-HTTPS fallback.');
          continue;
        } catch (fallbackError) {
          console.error(`MongoDB DNS-over-HTTPS fallback failed: ${fallbackError.message}`);
        }
      }
      if (attempt === attempts) {
        const finalError = new Error('Unable to establish the MongoDB connection');
        finalError.code = error.code || 'MONGODB_CONNECTION_FAILED';
        finalError.cause = error;
        throw finalError;
      }
      await wait(Math.min(1000 * (2 ** (attempt - 1)), 10000));
    }
  }
  throw new Error('Unable to establish the MongoDB connection');
}

module.exports = connectDB;
module.exports._private = { parseSrvUri, buildStandardUri, isSrvDnsError };
