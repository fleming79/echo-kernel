// Copyright (c) JupyterLite Contributors
// Distributed under the terms of the Modified BSD License.

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { PageConfig } from '@jupyterlab/coreutils';

import type { ILogPayload } from '@jupyterlab/logconsole';

import { ILoggerRegistry } from '@jupyterlab/logconsole';

import { IServiceWorkerManager } from '@jupyterlite/apputils';

import type { IKernel } from '@jupyterlite/services';

import { IKernelSpecs } from '@jupyterlite/services';

import { AsyncKernelInterface } from './kernel';

/**
 * A plugin to register the async kernel.
 */
const kernel: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/async-kernel:kernel',
  autoStart: true,
  requires: [IKernelSpecs, IServiceWorkerManager, ILoggerRegistry],
  activate: (
    app: JupyterFrontEnd,
    kernelspecs: IKernelSpecs,
    serviceWorkerManager: IServiceWorkerManager,
    loggerRegistry: ILoggerRegistry
  ) => {
    const { contents: contentsManager, sessions } = app.serviceManager;
    const baseUrl = PageConfig.getBaseUrl();
    // The logger will find the notebook associated with the kernel id
    // and log the payload to the log console for that notebook.
    const logger = async (options: {
      payload: ILogPayload;
      kernelId: string;
    }) => {
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
        name: 'async-kernel',
        display_name: 'Python (async)',
        language: 'python',
        argv: [],
        resources: {
          'logo-32x32': '',
          'logo-64x64': ''
        }
      },
      create: async (options: IKernel.IOptions): Promise<IKernel> => {
        return new AsyncKernelInterface({
          ...options,
          baseUrl,
          contentsManager,
          browsingContextId: serviceWorkerManager?.browsingContextId,
          logger
        });
      }
    });
  }
};

const plugins: JupyterFrontEndPlugin<any>[] = [kernel];

export default plugins;
