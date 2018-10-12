import {
  log,
  loadSettings,
  exec,
  listr,
  IListrOptions,
  constants,
  IModule,
  elapsed,
} from '../common';

export interface IAuditResult {
  module: string;
  version: string;
  ok: boolean;
  issues: number;
  vulnerabilities: {
    info: number;
    low: number;
    moderate: number;
    high: number;
    critical: number;
  };
}

export const name = 'audit';
export const alias = ['a'];
export const description = 'Runs an NPM security audit across all modules.';
export const args = {};

/**
 * CLI command.
 */
export async function cmd(args?: { params: string[]; options: {} }) {
  await audit({});
}

export async function audit(options: {} = {}) {
  // Retrieve settings.
  const settings = await loadSettings({ npm: true, spinner: true });
  if (!settings) {
    log.warn.yellow(constants.CONFIG_NOT_FOUND_ERROR);
    return;
  }

  // Start audit.
  log.info.gray(`Auditing modules:\n`);
  const startedAt = new Date();
  const res = await runAudits(settings.modules, {
    concurrent: true,
    exitOnError: false,
  });

  // Finish up.
  if (res.data) {
    printAudit(res.data);
  }
  if (res.success) {
    log.info(`\n✨✨  Done ${log.gray(elapsed(startedAt))}\n`);
  } else {
    log.info.yellow(`\n💩  Something went wrong while running the audit.\n`);
    log.error(res.error);
  }
}

/**
 * INTERNAL
 */
type Level = 'info' | 'low' | 'moderate' | 'high' | 'critical';

function levelColor(level: Level) {
  switch (level) {
    case 'info':
      return log.white;

    case 'low':
    case 'moderate':
      return log.yellow;

    case 'high':
    case 'critical':
      return log.red;
  }
}

function printAudit(results: IAuditResult[]) {
  const head = ['module', 'vulnerabilities'].map(title => log.gray(title));
  const builder = log.table({ head });

  results.forEach(audit => {
    const bullet = audit.ok ? log.green('✔') : log.red('✖');
    const moduleColor = audit.ok ? log.green : log.red;

    const output = Object.keys(audit.vulnerabilities)
      .map(key => ({ key: key as Level, value: audit.vulnerabilities[key] }))
      .reduce((acc, next) => {
        const text =
          next.value > 0
            ? log.gray(`${next.key}: ${levelColor(next.key)(next.value)}`)
            : '';

        return text ? `${acc} ${text}` : acc;
      }, '')
      .trim();

    builder.add([
      log.gray(`${bullet} ${moduleColor(audit.module)} ${audit.version}`),
      output || log.green('safe'),
    ]);
  });

  // Finish up.
  log.info();
  builder.log();
}

async function runAudits(modules: IModule[], options: IListrOptions) {
  let results: IAuditResult[] = [];
  const task = (pkg: IModule) => {
    return {
      title: `${log.cyan(pkg.name)}`,
      task: async () => {
        const cmd = (text: string) => `cd ${pkg.dir} && ${text}`;
        const commands = {
          audit: cmd(`npm audit --json`),
          install: cmd(`npm install`),
        };

        // Ensure the NPM lock file exists.
        await exec.run(commands.install, { silent: true });

        // Run the audit.
        const json = await execToJson(commands.audit);
        const vulnerabilities: IAuditResult['vulnerabilities'] = json
          ? json.metadata.vulnerabilities
          : [];

        const issues = Object.keys(vulnerabilities)
          .map(key => ({ key, value: vulnerabilities[key] }))
          .reduce((acc, next) => (next.value > 0 ? acc + next.value : acc), 0);

        const result: IAuditResult = {
          module: pkg.name,
          version: pkg.version,
          ok: issues === 0,
          issues,
          vulnerabilities,
        };
        results = [...results, result];
        return result;
      },
    };
  };
  const tasks = modules.map(pkg => task(pkg));
  const runner = listr(tasks, options);
  try {
    await runner.run();
    return { success: true, error: null, data: results };
  } catch (error) {
    return { success: false, error }; // Fail.
  }
}

async function execToJson(cmd: string) {
  const done = (stdout: string, error?: Error) => {
    try {
      return JSON.parse(stdout);
    } catch (error) {
      throw error;
    }
  };
  try {
    const res = await exec.run(cmd, { silent: true });
    return done(res.stdout);
  } catch (error) {
    return done(error.stdout);
  }
}
