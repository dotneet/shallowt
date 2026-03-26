import { execSync, spawn } from 'node:child_process';
import path from 'node:path';

const projectRoot = process.cwd();
const currentPid = process.pid;

function listProjectElectronPids() {
  const output = execSync('ps -axo pid=,command=', {
    cwd: projectRoot,
    encoding: 'utf8'
  });

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.*)$/);
      if (!match) {
        return null;
      }

      return {
        pid: Number(match[1]),
        command: match[2]
      };
    })
    .filter((item) => item !== null)
    .filter((item) => item.pid !== currentPid)
    .filter((item) => {
      return (
        item.command.includes(`${projectRoot}/node_modules/.bin/electron-vite dev`) ||
        item.command.includes(`${projectRoot}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .`) ||
        item.command.includes(`--app-path=${projectRoot}`)
      );
    });
}

function killPid(pid, signal) {
  try {
    process.kill(pid, signal);
  } catch {
    return;
  }
}

async function cleanupPreviousProcesses() {
  const staleProcesses = listProjectElectronPids();

  for (const processInfo of staleProcesses) {
    killPid(processInfo.pid, 'SIGTERM');
  }

  if (!staleProcesses.length) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  for (const processInfo of listProjectElectronPids()) {
    killPid(processInfo.pid, 'SIGKILL');
  }
}

await cleanupPreviousProcesses();

const electronViteBin = path.join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite'
);

const child = spawn(electronViteBin, ['dev'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
