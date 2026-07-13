import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error — plain JS plugin, no types needed
import { rosterApi } from './vite-plugins/roster-api.mjs'

export default defineConfig({
  // rosterApi backs the "+ ADD PLAYER" button. It's dev-only: a static build has no
  // server, so the form there will tell you to run `npm run dev`.
  plugins: [react(), rosterApi()],
  server: { open: true },
})
