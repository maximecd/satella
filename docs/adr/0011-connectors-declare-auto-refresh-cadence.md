# Connectors declare their Auto-refresh cadence

Status: accepted

The engine continues to check Auto-refresh work every fifteen minutes, but each Connector declares how often its Custodians are eligible for an automatic Refresh. The default remains fifteen minutes. Trade Republic declares six hours so its undocumented protocol is not contacted on every scheduler tick.

This supersedes only the fixed-cadence clause of ADR 0006. The engine still owns scheduling, Auto-refresh still continues during Screen lock, and all work still enters the serialized queue from ADR 0007. Market-data updates retain their normal cycle independently of whether a Custodian is due.

Manual Refresh bypasses the automatic cadence. An attempted automatic or manual Trade Republic Refresh advances its next automatic eligibility even when a transient failure occurs, preventing a failed Custodian from being retried every fifteen minutes. Re-authentication required suspends automatic attempts until the user completes authentication. The cadence is Connector metadata rather than a user setting or opaque credential value.
