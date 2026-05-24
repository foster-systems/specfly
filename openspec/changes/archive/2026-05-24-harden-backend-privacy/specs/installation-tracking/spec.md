## REMOVED Requirements

### Requirement: Upsert installation on lifecycle add

**Reason**: The `installations` table was write-only — nothing read it back (the push
payload carries `installation.id`), and the install list is recoverable on demand via
the App API (`GET /app/installations`). Persisting it was the main "which accounts run
the tool" exposure with no functional benefit.
**Migration**: None. No `installations` table is ever created — migration
`0001_init.sql` defines only the slim `runs` table (nothing has been deployed, so there
is no table to drop). The `installation` webhook is still acknowledged `2xx` (see the
`webhook-gateway` capability) but performs no persistence. Any future code needing the
install list queries `GET /app/installations` at call time.

### Requirement: Delete installation on lifecycle removal

**Reason**: With no `installations` table to maintain, there is nothing to delete on an
`installation` event with action `deleted`.
**Migration**: None. The event is acknowledged `2xx` with no persistence.
