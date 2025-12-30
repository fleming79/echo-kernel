// Copyright (c) JupyterLite Contributors
// Distributed under the terms of the Modified BSD License.

import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { PageConfig } from '@jupyterlab/coreutils';

import type { ILogPayload } from '@jupyterlab/logconsole';

import { ILoggerRegistry } from '@jupyterlab/logconsole';

import { IServiceWorkerManager } from '@jupyterlite/apputils';

import type { IKernel } from '@jupyterlite/services';

import { IKernelSpecs } from '@jupyterlite/services';

import { KernelRelay } from './kernel';

/**
 * The default CDN fallback for Pyodide
 */
const PYODIDE_CDN_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.0/full/pyodide.js';

/**
 * The id for the extension, and key in the litePlugins.
 */
const PLUGIN_ID = '@jupyterlite/async-kernel:kernel';

/**
 * A plugin to register the async kernel.
 */
const kernel: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  autoStart: true,
  requires: [IKernelSpecs, IServiceWorkerManager, ILoggerRegistry],
  activate: (
    app: JupyterFrontEnd,
    kernelspecs: IKernelSpecs,
    serviceWorkerManager: IServiceWorkerManager,
    loggerRegistry: ILoggerRegistry
  ) => {
    const { sessions } = app.serviceManager;

    const config =
      JSON.parse(PageConfig.getOption('litePluginSettings') || '{}')[PLUGIN_ID] || {};

    const baseUrl = PageConfig.getBaseUrl();

    const pyodideUrl = config.pyodideUrl || PYODIDE_CDN_URL;

    // The logger will find the notebook associated with the kernel id
    // and log the payload to the log console for that notebook.
    const logger = async (options: { payload: ILogPayload; kernelId: string }) => {
      if (!loggerRegistry) {
        // nothing to do in this case
        return;
      }

      const { payload, kernelId } = options;

      // Find the session path that corresponds to the kernel ID
      let sessionPath = '';
      for (const session of sessions.running()) {
        if (session.kernel?.id === kernelId) {
          sessionPath = session.path;
          break;
        }
      }

      const logger = loggerRegistry.getLogger(sessionPath);
      logger.log(payload);
    };

    kernelspecs.register({
      spec: {
        name: config.name || 'async',
        display_name: config.display_name || 'Python (async)',
        language: config.language || 'python',
        argv: [],
        resources: {
          'logo-32x32': config.logo || '',
          'logo-64x64': config.logo || ''
        }
      },
      create: async (options: IKernel.IOptions): Promise<IKernel> => {
        return new KernelRelay(
          {
            ...options,
            ...config,
            baseUrl,
            pyodideUrl,
            browsingContextId: serviceWorkerManager.browsingContextId
          },
          logger
        );
      }
    });
  }
};

const plugins: JupyterFrontEndPlugin<any>[] = [kernel];

export default plugins;
