# NPM Supply Chain Attack Audit

## Incident 1 – `chalk` / `debug` Ecosystem Hijack
- **Source**: [Aikido Security write-up](https://www.aikido.dev/blog/npm-debug-and-chalk-packages-compromised).
- **Root cause**: Phishing email spoofing npm support (`support@npmjs.help`) convinced a maintainer to run malicious commands, handing attackers publish access to core packages such as `chalk` and `debug`.
- **Attack chain**: Newly published versions injected obfuscated browser-side malware that hooks `fetch`, `XMLHttpRequest`, and crypto wallet APIs to rewrite addresses and siphon funds.
- **Blast radius**: Eighteen core terminal/colour utility packages were trojanised; together they serve ~2B weekly downloads.

### Compromised packages and versions
| Package | Malicious version(s) |
| --- | --- |
| backslash | 0.2.1 |
| chalk-template | 1.1.1 |
| supports-hyperlinks | 4.1.1 |
| has-ansi | 6.0.1 |
| simple-swizzle | 0.2.3 |
| color-string | 2.1.1 |
| error-ex | 1.3.3 |
| color-name | 2.0.1 |
| is-arrayish | 0.3.3 |
| slice-ansi | 7.1.1 |
| color-convert | 3.1.1 |
| wrap-ansi | 9.0.1 |
| ansi-regex | 6.2.1 |
| supports-color | 10.2.1 |
| strip-ansi | 7.1.1 |
| chalk | 5.6.1 |
| debug | 4.4.2 |
| ansi-styles | 6.2.2 |

## Incident 2 – `@ctrl/tinycolor` Campaign
- **Source**: [Socket Research](https://socket.dev/blog/tinycolor-supply-chain-attack-affects-40-packages).
- **Root cause**: Malicious `bundle.js` added to `@ctrl/tinycolor` family. Attackers appear to have breached maintainer tooling, automating repacks via a script (`NpmModule.updatePackage`) that downloaded legitimate tarballs, injected malware, and republished dozens of packages.
- **Attack chain**: Installation executes `bundle.js`, which downloads TruffleHog, harvests tokens (`NPM_TOKEN`, `GITHUB_TOKEN`, cloud metadata), plants a GitHub Actions workflow that exfiltrates `${{ toJSON(secrets) }}` to `webhook.site`, and republishes hijacked packages for lateral spread.
- **Blast radius**: Initial wave hit 40+ packages across `@ctrl`, RxNT, Angular, and NativeScript ecosystems; subsequent tracking expanded to ~500 packages.

### Compromised packages and versions (initial wave)
| Package | Malicious version(s) |
| --- | --- |
| angulartics2 | 14.1.2 |
| @ctrl/deluge | 7.2.2 |
| @ctrl/golang-template | 1.4.3 |
| @ctrl/magnet-link | 4.0.4 |
| @ctrl/ngx-codemirror | 7.0.2 |
| @ctrl/ngx-csv | 6.0.2 |
| @ctrl/ngx-emoji-mart | 9.2.2 |
| @ctrl/ngx-rightclick | 4.0.2 |
| @ctrl/qbittorrent | 9.7.2 |
| @ctrl/react-adsense | 2.0.2 |
| @ctrl/shared-torrent | 6.3.2 |
| @ctrl/tinycolor | 4.1.1, 4.1.2 |
| @ctrl/torrent-file | 4.1.2 |
| @ctrl/transmission | 7.3.1 |
| @ctrl/ts-base32 | 4.0.2 |
| encounter-playground | 0.0.5 |
| json-rules-engine-simplified | 0.2.1, 0.2.4 |
| koa2-swagger-ui | 5.11.1, 5.11.2 |
| @nativescript-community/gesturehandler | 2.0.35 |
| @nativescript-community/sentry | 4.6.43 |
| @nativescript-community/text | 1.6.13 |
| @nativescript-community/ui-collectionview | 6.0.6 |
| @nativescript-community/ui-drawer | 0.1.30 |
| @nativescript-community/ui-image | 4.5.6 |
| @nativescript-community/ui-material-bottomsheet | 7.2.72 |
| @nativescript-community/ui-material-core | 7.2.76 |
| @nativescript-community/ui-material-core-tabs | 7.2.76 |
| ngx-color | 10.0.2 |
| ngx-toastr | 19.0.2 |
| ngx-trend | 8.0.1 |
| react-complaint-image | 0.0.35 |
| react-jsonschema-form-conditionals | 0.3.21 |
| react-jsonschema-form-extras | 1.0.4 |
| rxnt-authentication | 0.0.6 |
| rxnt-healthchecks-nestjs | 1.0.5 |
| rxnt-kue | 1.0.7 |
| swc-plugin-component-annotate | 1.9.2 |
| ts-gaussian | 3.0.6 |

_Socket’s follow-up investigation (16 Sep 2025) lists nearly 500 additional packages; review the linked article for the evolving catalogue._

## Campus Study Buddy Exposure Review

### Automated scan
- Executed `npm run audit:deps` (script wraps `npm audit --json`) on backend and frontend.
- Output stored at `reports/security/dependency-audit.json`
- Result: **0 vulnerabilities** at all severities; no audit failures.

### Manual lockfile inspection
- Checked `backend/package-lock.json` and `frontend/package-lock.json` for the malicious versions above.
- Findings:
  - `chalk` is locked to 4.1.2 (frontend) and 4.1.2/4.0.0 ranges (backend) – all predating the compromised 5.6.1 release.
  - `debug` resolves to 4.4.1 (backend) and 4.3.x (frontend tooling); the compromised 4.4.2 release is **absent**.
  - No entries for `@ctrl/*`, `ngx-*`, `rxnt-*`, or other packages listed in the tinycolor campaign.
  - No `ansi-styles@6.2.2`, `supports-color@10.2.1`, or related trojanised dependencies; versions are older (5.x/7.x) and unaffected.
- Conclusion: Current locks are **not impacted** by the known malicious versions from either incident.

## Recommended Countermeasures

### Protect against upstream package compromise
- Enforce dependency pinning with lockfiles and checksum verification (npm’s `package-lock.json` already checked into repo).
- Add malware-focused scanners (e.g., Aikido SafeChain, Socket, or npm’s `--audit-level` gates) to CI/CD to detect malicious publish spikes.
- Subscribe to npm advisories and third-party threat feeds; automate pull request alerts when high-priority packages release unexpected majors/minors.
- Mirror critical dependencies internally or use artifact proxies (e.g., Artifactory) with allow-lists to slow propagation of poisoned releases.

### Protect maintainers and pipelines from account takeover
- Require hardware-based 2FA for npm maintainers and rotate tokens regularly; avoid responding to unsolicited “support” emails.
- Store publish tokens in dedicated secret managers; restrict GitHub Actions workflows with OIDC and scoped deployment tokens.
- Enable provenance/sigstore checks (npm provenance, GitHub npm provenance) so only builds produced from trusted CI can publish.
- Monitor CI agents for outbound calls to metadata endpoints (`169.254.169.254`, `metadata.google.internal`) and block unauthorized egress destinations (e.g., `webhook.site`).
- Enforce `npm` provenance controls such as owner verification and package signing where available to prevent malicious repacks from unverified hosts.

### Project-specific possible next steps
1. Integrate the `npm run audit:deps` script into CI with a failing threshold that balances signal-to-noise. 
2. Pilot a malware-focused scanner (Aikido SafeChain or Socket) on the repository to gain real-time telemetry for emerging campaigns.
3. Document an incident playbook for dependency compromises, covering cache invalidation, forced reinstall, and credential rotation.

#### Implemented mitigations
1. Audit script created and run as a part of CI pipeline (see `dependency-audit.yml`). Alerting contributors on any future vulnerabilities.