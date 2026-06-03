import { expect, test } from 'vitest';
import { ShipClient } from '@ship/sdk';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('refresh-token rotation drill invalidates the family when a spent token is reused', async () => {
  const tokenFamily = new Set(['ship_rt_original']);
  const spent = new Set();
  let familyRevoked = false;

  const fetch = async (url, init) => {
    expect(String(url)).toBe('https://ship.test/oauth/token');
    const body = JSON.parse(String(init.body));
    expect(body.grant_type).toBe('refresh_token');

    if (familyRevoked || !tokenFamily.has(body.refresh_token)) {
      return json({ code: 'invalid_grant', message: 'Invalid refresh_token', request_id: 'req_refresh' }, 400);
    }

    if (spent.has(body.refresh_token)) {
      familyRevoked = true;
      return json({
        code: 'invalid_grant',
        message: 'Refresh token reuse detected; family revoked',
        request_id: 'req_reuse',
      }, 400);
    }

    spent.add(body.refresh_token);
    tokenFamily.add('ship_rt_rotated');
    return json({
      token_type: 'Bearer',
      access_token: 'ship_at_rotated',
      expires_in: 900,
      refresh_token: 'ship_rt_rotated',
      scope: 'documents:read',
    });
  };

  const rotated = await ShipClient.refreshAccessToken({
    shipUrl: 'https://ship.test',
    clientId: 'ship_refresh_drill',
    refreshToken: 'ship_rt_original',
    fetch,
  });
  expect(rotated.refresh_token).toBe('ship_rt_rotated');

  await expect(ShipClient.refreshAccessToken({
    shipUrl: 'https://ship.test',
    clientId: 'ship_refresh_drill',
    refreshToken: 'ship_rt_original',
    fetch,
  })).rejects.toMatchObject({
    kind: 'validation',
    message: 'Refresh token reuse detected; family revoked',
  });

  await expect(ShipClient.refreshAccessToken({
    shipUrl: 'https://ship.test',
    clientId: 'ship_refresh_drill',
    refreshToken: 'ship_rt_rotated',
    fetch,
  })).rejects.toMatchObject({
    kind: 'validation',
    message: 'Invalid refresh_token',
  });
});
