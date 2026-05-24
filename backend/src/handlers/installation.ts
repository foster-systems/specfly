// `installation` event handler: ack-only no-op. The installations registry was
// retired (it was write-only and the main "which accounts run this" exposure).
// The push payload already carries `installation.id`, and the live install list
// is recoverable on demand via the App API (`GET /app/installations`), so
// nothing is persisted here. The event is still acknowledged 2xx by the router
// so GitHub records the delivery as succeeded.

export function handleInstallation(): void {
  // Intentionally empty — no persistence.
}
