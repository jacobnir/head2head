/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** SHA-256 (hex) of the site code. Unset = no gate, which is what `npm run dev` wants. */
  readonly VITE_SITE_CODE_SHA256?: string
}
