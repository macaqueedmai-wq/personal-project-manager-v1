import { rmSync } from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');
rmSync(distDir, { recursive: true, force: true });
console.log(`[build] 已清理 ${distDir}`);
