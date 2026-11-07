import type { Register } from '@tanstack/react-router';
import { createStartHandler, defaultStreamHandler, type RequestHandler } from '@tanstack/react-start/server';

const fetch = createStartHandler(defaultStreamHandler);

export type ServerEntry = { fetch: RequestHandler<Register> };

export const createServerEntry = (entry: ServerEntry): ServerEntry => ({
  async fetch(...args) {
    return await entry.fetch(...args);
  }
});

export default createServerEntry({ fetch });
