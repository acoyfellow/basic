export default {
  publicPaths: ['/', '/robots.txt', '/llms.txt'],
  privatePaths: ['/api/notes', '/api/versions'],
  forgedCookie: () => `tenon_session=victim.${Date.now() + 1e9}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
  signIn: async (base, owner) => {
    const response = await fetch(`${base}/dev/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner }),
    });
    const cookie = response.headers.get('set-cookie');
    if (!cookie) throw new Error(`sign-in for ${owner} returned ${response.status} with no cookie`);
    return cookie.split(';')[0];
  },
  write: { method: 'POST', path: '/api/notes', body: (marker) => ({ text: marker }) },
  read: { path: '/api/notes' },
  run: {
    start: { method: 'POST', path: '/api/runs', body: (code) => ({ code }) },
    idOf: (body) => body.id,
    status: (id) => `/api/runs/${id}`,
    finished: (body) => body.status !== 'running',
    failed: (body) => body.status === 'failed',
  },
};
