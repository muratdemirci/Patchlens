# Built-in rule catalog

Rules only inspect added lines in supported JS/TS-family source files. Confidence describes match precision, not proof of exploitability.

| ID         | Default severity | Detects                                                                                           | Limit                                                                           |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| PL-JS-001  | high             | Direct `eval(...)` call                                                                           | Aliases and indirect evaluation are missed                                      |
| PL-JS-002  | high             | `innerHTML` assignment                                                                            | Sanitization performed elsewhere is not understood                              |
| PL-SEC-001 | critical         | Common assignment forms containing hard-coded credential keywords and a sufficiently long literal | Encoded/constructed secrets and nonstandard names are missed; may flag examples |

Each match includes the exact added line as evidence. These checks are heuristics, not a complete security analysis. This release does not infer missing input validation or test coverage gaps; those require cross-line and cross-file context that the current line-rule interface does not model.
