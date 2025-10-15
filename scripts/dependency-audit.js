#!/usr/bin/env node
'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const projects = [
  {
    name: 'backend',
    directory: path.join(rootDir, 'backend'),
    lockfile: path.join(rootDir, 'backend', 'package-lock.json'),
  },
  {
    name: 'frontend',
    directory: path.join(rootDir, 'frontend'),
    lockfile: path.join(rootDir, 'frontend', 'package-lock.json'),
  },
];

const severityOrder = ['low', 'moderate', 'high', 'critical'];
const severityWeight = severityOrder.reduce((acc, level, index) => ({
  ...acc,
  [level]: index,
}), {});

const failLevel = (process.env.AUDIT_FAIL_LEVEL || 'moderate').toLowerCase();
if (!severityOrder.includes(failLevel)) {
  console.warn(`Unknown AUDIT_FAIL_LEVEL "${failLevel}" supplied. Falling back to "moderate".`);
}
const failureThreshold = severityOrder.includes(failLevel) ? failLevel : 'moderate';

const npmCliPath = resolveNpmCli();

async function runAudit(project) {
  if (!fs.existsSync(project.lockfile)) {
    throw new Error(`Missing lockfile at ${project.lockfile}. Run "npm install" in ${project.directory} before auditing.`);
  }

  return new Promise((resolve, reject) => {
    const auditArgs = [npmCliPath, 'audit', '--json'];

    execFile(
      process.execPath,
      auditArgs,
      {
        cwd: project.directory,
        env: {
          ...process.env,
          npm_config_yes: 'true',
        },
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const exitCode = (error && typeof error.code === 'number') ? error.code : 0;
        if (!stdout || !stdout.trim()) {
          return reject(new Error(stderr.trim() || error?.message || `npm audit exited with code ${exitCode}`));
        }

        let report;
        try {
          report = JSON.parse(stdout);
        } catch (parseError) {
          return reject(
            new Error(`Failed to parse npm audit response for ${project.name}: ${parseError.message}`),
          );
        }

        if (report.error) {
          return reject(new Error(report.error.summary || report.error));
        }

        const metadata = report.metadata || {};
        const counts = sanitizeCounts(metadata.vulnerabilities || {});
        const findings = extractFindings(report);

        resolve({
          project: project.name,
          exitCode,
          counts,
          findings,
        });
      },
    );
  });
}

function sanitizeCounts(rawCounts) {
  return severityOrder.reduce(
    (acc, severity) => ({
      ...acc,
      [severity]: Number(rawCounts[severity] || 0),
    }),
    {},
  );
}

function resolveNpmCli() {
  const execPath = process.env.npm_execpath;
  if (execPath && fs.existsSync(execPath)) {
    return execPath;
  }

  const candidatePaths = [
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Unable to locate npm CLI (npm-cli.js).');
}

function extractFindings(report) {
  if (report.vulnerabilities) {
    return Object.values(report.vulnerabilities).map((vuln) => ({
      name: vuln.name,
      severity: vuln.severity,
      range: vuln.range,
      via: extractVia(vuln.via),
      fixAvailable: formatFixAvailable(vuln.fixAvailable),
      isDirect: Boolean(vuln.isDirect),
    }));
  }

  if (report.advisories) {
    return Object.values(report.advisories).map((advisory) => ({
      name: advisory.module_name,
      severity: advisory.severity,
      range: advisory.vulnerable_versions,
      via: [advisory.title],
      fixAvailable: advisory.patched_versions && advisory.patched_versions !== 'No fix',
      isDirect: advisory.direct,
    }));
  }

  return [];
}

function extractVia(via) {
  if (!Array.isArray(via)) {
    return [];
  }

  return via.map((entry) => {
    if (typeof entry === 'string') {
      return entry;
    }

    if (entry && typeof entry === 'object') {
      return entry.title || entry.name || entry.source || 'Unknown advisory';
    }

    return 'Unknown advisory';
  });
}

function formatFixAvailable(fixAvailable) {
  if (fixAvailable === false) {
    return false;
  }

  if (typeof fixAvailable === 'string') {
    return fixAvailable;
  }

  if (fixAvailable && typeof fixAvailable === 'object') {
    return fixAvailable.version || fixAvailable.name || true;
  }

  return Boolean(fixAvailable);
}

function aggregateCounts(results) {
  return results.reduce(
    (acc, result) => {
      severityOrder.forEach((severity) => {
        acc[severity] += result.counts[severity] || 0;
      });
      return acc;
    },
    severityOrder.reduce((init, severity) => ({ ...init, [severity]: 0 }), {}),
  );
}

function hasBlockingFindings(results) {
  const thresholdIndex = severityWeight[failureThreshold];

  return results.some((result) =>
    severityOrder.some((severity) => severityWeight[severity] >= thresholdIndex && (result.counts[severity] || 0) > 0),
  );
}

async function main() {
  console.log('🔒 Running dependency security audit...');
  console.log(`   Failure threshold: ${failureThreshold.toUpperCase()} or above\n`);

  const results = [];
  const failures = [];

  for (const project of projects) {
    process.stdout.write(`• Auditing ${project.name}... `);
    try {
      const result = await runAudit(project);
      results.push(result);
      console.log('done');

      logProjectSummary(result);
    } catch (error) {
      console.log('failed');
      failures.push({ project: project.name, error: error.message });
      console.error(`  ↳ Error auditing ${project.name}: ${error.message}`);
    }
  }

  const totals = aggregateCounts(results);

  if (results.length) {
    console.log('\n📊 Combined vulnerability counts:');
    console.table([totals]);
  } else {
    console.log('\n📊 No successful audits were completed.');
  }

  const reportPath = writeReport({ results, totals, failures });
  console.log(`Audit report written to ${path.relative(rootDir, reportPath)}`);

  if (failures.length) {
    console.error('\n❌ One or more audits failed to run. See errors above.');
  }

  if (hasBlockingFindings(results)) {
    console.error(`\n❌ Vulnerabilities at ${failureThreshold.toUpperCase()} severity or above detected.`);
  } else if (!failures.length) {
    console.log('\n✅ No blocking vulnerabilities detected.');
  }

  if (failures.length || hasBlockingFindings(results)) {
    process.exitCode = 1;
  }
}

function logProjectSummary(result) {
  console.log(`  ↳ ${result.project} vulnerability counts:`);
  console.table([result.counts]);

  const noteworthy = result.findings
    .filter((finding) => severityWeight[finding.severity] >= severityWeight[failureThreshold])
    .slice(0, 5);

  if (noteworthy.length) {
    console.log('  ↳ Top findings:');
    noteworthy.forEach((finding, index) => {
      console.log(`     ${index + 1}. ${finding.name} (${finding.severity}) - ${finding.via[0] || 'See audit report'}`);
      if (finding.fixAvailable) {
        console.log(`        Fix available: ${finding.fixAvailable}`);
      }
    });
  } else {
    console.log('  ↳ No findings at or above failure threshold.');
  }
}

function writeReport({ results, totals, failures }) {
  const reportDir = path.join(rootDir, 'reports', 'security');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'dependency-audit.json');

  const payload = {
    generatedAt: new Date().toISOString(),
    tool: 'npm audit',
    failureThreshold,
    projects: results.map((result) => ({
      project: result.project,
      counts: result.counts,
      findings: result.findings,
    })),
    totals,
    failures,
  };

  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
  return reportPath;
}

main().catch((error) => {
  console.error(`Unexpected error during dependency audit: ${error.message}`);
  process.exitCode = 1;
});
