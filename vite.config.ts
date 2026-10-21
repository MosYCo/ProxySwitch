import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 13000,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/target/**", "**/src-tauri/gen/**"],
    },
  },
  build: {
    outDir: "dist",
    // Serve the shared icon as a file; the desktop CSP does not allow data: images.
    assetsInlineLimit: (filePath) => filePath.endsWith("app-icon.svg") ? false : undefined,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-radix": [
            "radix-ui",
          ],
          "vendor-icons": ["lucide-react"],
          "vendor-utils": [
            "class-variance-authority",
            "cn",
          ],
        },
      },
    },
  },
})
