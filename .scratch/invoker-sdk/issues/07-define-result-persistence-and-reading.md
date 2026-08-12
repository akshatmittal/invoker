# Define result persistence and reading responsibilities

Type: grilling
Status: resolved
Blocked by: 03

## Question

How are Run IDs generated, how is the output directory selected, how are immutable Run filenames and writes handled, what reader API—if any—loads retained Run files, and where does Invoker's responsibility end before artifact retention, indexing, and reporting begin?

## Answer

Ruled out of scope by [Choose Vitest's role in Invoker](11-choose-vitest-role.md). Vitest's JSON reporter writes the configured result file; the consuming CI workflow owns artifact upload and retention, and downstream consumers query that artifact. Invoker does not generate Run IDs, persist or read result files, index history, or expose query helpers in v1.
