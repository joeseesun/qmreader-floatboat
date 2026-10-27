// ABOUTME: 组装服务入口，加载业务路由与应用初始化

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkbenchServer } from '../../sdk/runtime.mjs';
import { registerAppRoute } from './app-route.ts';
import { registerReaderRoutes } from './reader-routes.ts';
import { registerReadingContextRoutes } from './reading-context.ts';

/** 伴读会话的工作目录：往上找到含 manifest.json 的工程根，供 Agent 读文件。 */
function resolveProjectDirectory(entryUrl: string): string {
  let dir = path.dirname(fileURLToPath(entryUrl));
  for (let i = 0; i < 4; i += 1) {
    if (existsSync(path.join(dir, 'manifest.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const app = await createWorkbenchServer(import.meta.url);
registerAppRoute(app);
registerReaderRoutes(app);
registerReadingContextRoutes(app, resolveProjectDirectory(import.meta.url));
await app.listen();
