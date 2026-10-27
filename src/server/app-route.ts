// ABOUTME: 提供应用公开信息，不向页面暴露 Host 凭据。

import type { WorkbenchServer } from '../../sdk/runtime.mjs';
import type { AppInfo } from '../contracts/app.ts';

export function registerAppRoute(app: WorkbenchServer): void {
  app.route('GET', '/api/app', (): AppInfo => ({ name: app.manifest.name, version: app.manifest.version }));
}
