// creating test function
export default async () => Response.json({ ok: true, url: process.env.URL ?? null });
export const config = { path: "/api/ping"}