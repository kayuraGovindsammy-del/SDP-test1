import { spawn } from 'node:child_process';

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RepoGitInfo {
  defaultBranch: string;
  hasCommits: boolean;
  commitCount: number;
  headHash?: string;
  headShort?: string;
  headDate?: string;
  headAuthor?: string;
  headEmail?: string;
  headMessage?: string;
}

/** Run the system `git` binary non-interactively and capture its output. */
export function runGit(
  args: string[],
  opts: { cwd: string; timeoutMs?: number },
): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: opts.cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'echo',
        GCM_INTERACTIVE: 'never',
      },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, opts.timeoutMs)
      : null;

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`git ${args[0]} timed out`));
        return;
      }
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/** Read summary information about a repository's HEAD for display purposes. */
export async function readRepoInfo(repoDir: string): Promise<RepoGitInfo> {
  const gitDir = await runGit(['rev-parse', '--git-dir'], { cwd: repoDir });
  if (gitDir.code !== 0) {
    throw new Error(firstLine(gitDir.stderr) || 'Not a valid git repository');
  }

  const branchRes = await runGit(['branch', '--show-current'], { cwd: repoDir });
  const defaultBranch = branchRes.code === 0 && branchRes.stdout.trim() !== ''
    ? branchRes.stdout.trim()
    : 'unknown';

  const headRes = await runGit(['log', '-1', '--format=%H%n%h%n%cI%n%an%n%ae%n%s'], {
    cwd: repoDir,
  });

  if (headRes.code !== 0) {
    return { defaultBranch, hasCommits: false, commitCount: 0 };
  }

  const [headHash, headShort, headDate, headAuthor, headEmail, ...subjectParts] =
    headRes.stdout.split('\n');

  const countRes = await runGit(['rev-list', '--count', 'HEAD'], { cwd: repoDir });

  return {
    defaultBranch,
    hasCommits: true,
    commitCount: countRes.code === 0 ? Number(countRes.stdout.trim()) || 0 : 0,
    headHash,
    headShort,
    headDate,
    headAuthor,
    headEmail,
    headMessage: subjectParts.join('\n').trim(),
  };
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? '';
}
