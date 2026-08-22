# All refreshes flow through one serialized queue

Status: accepted

Manual and auto-refresh submit their work as jobs to a single engine-side queue consumed by one worker: strict FIFO, with coalescing so at most one pending job exists per custodian. We chose this over ad-hoc concurrency guards (per-caller mutexes, price single-flight plus custodian locking) because it gives every refresh path the same semantics — a manual click never produces a duplicate back-to-back sync of the same custodian, auto-refresh ticks never pile up behind slow connectors, and no custodian is starved.

Prices remain single-flight inside this model; they are already deduplicated and are refreshed once per completed cycle rather than per custodian.
