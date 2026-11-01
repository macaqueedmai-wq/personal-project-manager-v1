import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;

async function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';

    const cleanup = (): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = (chunk: string): void => {
      for (const character of chunk) {
        if (character === '\u0003') {
          cleanup();
          process.stdout.write('\n');
          reject(new Error('已取消。'));
          return;
        }

        if (character === '\r' || character === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }

        if (character === '\u007f' || character === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }

        if (character >= ' ') {
          value += character;
          process.stdout.write('*');
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function readPipedInput(): Promise<{ password: string; confirmation: string }> {
  let input = '';

  for await (const chunk of process.stdin) {
    input += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  }

  const lines = input.split(/\r?\n/);
  return { password: lines[0] ?? '', confirmation: lines[1] ?? '' };
}

async function main(): Promise<void> {
  console.log('建立擁有者密碼雜湊（輸入不會顯示，也不會寫入任何檔案）。');

  let password: string;
  let confirmation: string;

  if (process.stdin.isTTY) {
    password = await readHidden('密碼：');
    confirmation = await readHidden('再次輸入密碼：');
  } else {
    // Piped input is used by automated checks. Read once so nothing is echoed.
    ({ password, confirmation } = await readPipedInput());
  }

  if (password.length === 0) {
    throw new Error('密碼不可空白。');
  }

  if (password !== confirmation) {
    throw new Error('兩次輸入的密碼不一致。');
  }

  if (password.length < 12) {
    console.warn('提醒：密碼少於 12 個字元，建議使用更長的密碼。');
  }

  const hash = await bcrypt.hash(password, BCRYPT_COST);
  console.log('\n把以下一行放入本機 .env（不要提交到 Git）：');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
}

main().catch((error) => {
  console.error(`\n[auth:hash] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
