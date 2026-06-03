import crypto from 'node:crypto';

export function signShipPayload(rawBody, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const hmac = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${hmac}`;
}

export function signGitHubPayload(rawBody, webhookSecret) {
  return `sha256=${crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex')}`;
}
