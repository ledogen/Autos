# Deferred Items — Phase 08 Road Routing

- [08-06] test/test-road.html lines 63,113,118 reference r._tileCache (the retired per-tile router map deleted in 08-05). That harness was already broken by 08-05 router removal; out of scope for 08-06 (slicing/query). The live seam gate is test/test-road-seam.html. Recommend deleting or rewriting test-road.html in a cleanup plan.
