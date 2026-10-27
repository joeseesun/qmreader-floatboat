// ABOUTME: 组装服务入口，加载业务路由与应用初始化

import { createWorkbenchServer } from '../../sdk/runtime.mjs';
import { registerAppRoute } from './app-route.ts';
import { registerReaderRoutes } from './reader-routes.ts';

const app = await createWorkbenchServer(import.meta.url);
registerAppRoute(app);
registerReaderRoutes(app);
await app.listen();
