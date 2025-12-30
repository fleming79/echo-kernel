import type { ILogPayload } from '@jupyterlab/logconsole';
import type Pyodide from 'pyodide';

import { URLExt } from '@jupyterlab/coreutils/lib/url';
import { DriveFS } from '@jupyterlite/services/lib/contents/drivefs';

let driveFS: DriveFS;
let pyodide: Pyodide.PyodideAPI;
let kernel: any;
let handleMessage: any;
let options: AsyncKernel.IOptions;

/**
 * Initialize the kernel.
 * @param initOptions Options relating to the kernel.
 */
async function initialize(initOptions: AsyncKernel.IOptions) {
  options = initOptions;
  await initRuntime();
  await initFilesystem();
  await startKernel();
  self.postMessage({ mode: 'ready' });
}

/**
 * Send payload to the kernel relay for logging.
 *
 * @param log The payload to log.
 */
async function log(log: ILogPayload) {
  self.postMessage({ mode: 'log', log });
}

/**
 * A sender for sending messages to the frontend.
 *
 * Normally, messages are forwarded by the relay, when requiresReply=true
 * such as for stdin, a blocking call is made
 *
 * The blocking mode us
 *
 * @param msg_string JSON string
 * @param requiresReply Blocks until a reply is received.
 */
function sender(msg_string: string, requiresReply = false) {
  if (requiresReply) {
    // ref: https://github.com/jupyterlite/pyodide-kernel/pull/183

    const { baseUrl, browsingContextId } = options;

    const xhr = new XMLHttpRequest();
    const url = URLExt.join(baseUrl, '/api/stdin/kernel');
    xhr.open('POST', url, false); // Synchronous XMLHttpRequest
    const msg = JSON.stringify({
      browsingContextId,
      data: JSON.parse(msg_string)
    });
    // Send input request, this blocks until the input reply is received.
    xhr.send(msg);
    const inputReply = JSON.parse(xhr.response as string);

    if ('error' in inputReply) {
      // Service worker may return an error instead of an input reply message.
      throw new Error(inputReply['error']);
    }
    return inputReply.content?.value;
  }

  self.postMessage({ mode: 'msg', msg_string });
}

/**
 * Load pyodide.
 *
 */
async function initRuntime(): Promise<void> {
  const { pyodideUrl } = options;
  let loadPyodide: typeof Pyodide.loadPyodide;

  if (pyodideUrl.endsWith('.mjs')) {
    // note: this does not work at all in firefox
    const pyodideModule: typeof Pyodide = await import(
      /* webpackIgnore: true */ pyodideUrl
    );
    loadPyodide = pyodideModule.loadPyodide;
  } else {
    // @ts-ignore
    importScripts(pyodideUrl);
    loadPyodide = (self as any).loadPyodide;
  }
  pyodide = await loadPyodide({
    stdout: (text: string) => {
      console.log(text);
      log({ type: 'text', level: 'info', data: text });
    },
    stderr: (text: string) => {
      console.error(text);
      log({ type: 'text', level: 'critical', data: text });
    },
    ...options.loadPyodideOptions // ref: https://pyodide.org/en/stable/usage/api/js-api.html#exports.PyodideConfig
  });
  // @ts-expect-error: pyodide._api is private
  pyodide._api.on_fatal = async (e: any) => {
    let error = '';
    if (e.name === 'Exit') {
      error = 'Pyodide has exited and can no longer be used.';
    } else {
      error = `Pyodide has suffered a fatal error. Please report this to the Pyodide maintainers.
The cause of the error was: ${e.name}
${e.message}
Stack trace:
${e.stack}`;
    }
    log({
      type: 'text',
      level: 'critical',
      data: error
    });
  };
}

/**
 * Setup custom Emscripten FileSystem
 *
 */
async function initFilesystem(): Promise<void> {
  const mountpoint = '/drive';
  const { FS, PATH, ERRNO_CODES } = pyodide;
  const { baseUrl, browsingContextId } = options;

  let driveName = '';
  let localPath = options.location;
  if (options.location.includes(':')) {
    const parts = options.location.split(':');
    driveName = parts[0];
    localPath = parts[1];
  }

  driveFS = new DriveFS({
    FS: FS as any,
    PATH,
    ERRNO_CODES,
    baseUrl,
    driveName: driveName,
    mountpoint,
    browsingContextId
  });
  FS.mkdirTree(mountpoint);
  FS.mount(driveFS as any, {}, mountpoint);
  FS.chdir(mountpoint);
  if (localPath) await pyodide.runPythonAsync(`import os\nos.chdir("${localPath}")`);
}

/**
 * Start the kernel calling custom hooks at various stages.
 *
 */
async function startKernel() {
  await pyodide.loadPackage('micropip');
  const micropip = pyodide.pyimport('micropip');
  await micropip.install('ssl');

  const loadScript =
    options.kernelLoadScript ||
    `
  import micropip
  import pathlib

  deps = [f"emfs:./{p}" for p in pathlib.Path(".").glob("*.whl")]
  deps.append("async-kernel")
  await micropip.install(deps, keep_going=True, reinstall=True)
  
  import async_kernel

  async_kernel.Kernel(options)
  `;

  // Load the kernel
  kernel = await pyodide.runPythonAsync(loadScript, {
    locals: pyodide.toPy({ options: options.kernelOptions || {} })
  });

  // Start the kernel
  handleMessage = await kernel.interface.start(pyodide.toPy(sender));

  const waitStopped = async () => {
    await kernel.event_stopped;
    try {
      pyodide.pyimport('sys').exit(0);
    } catch {
      // sys.exit raises an error.
    }
    self.postMessage({ mode: 'stopped' });
  };
  waitStopped();

  if (options.kernelPostStartScript) {
    await pyodide.runPythonAsync(options.kernelPostStartScript);
  }
}

/**
 *
 * @param event A message from the kernel relay
 */
self.onmessage = async (event: MessageEvent) => {
  switch (event.data.mode) {
    case 'msg': {
      try {
        const buffers = packBuffers(event.data.msg.buffers);
        delete event.data.msg.buffers;
        handleMessage(JSON.stringify(event.data.msg), buffers);
        if (buffers) {
          for (let buffer of buffers) {
            buffer?.destroy();
          }
        }
      } catch (e) {
        log({
          type: 'text',
          level: 'error',
          data: `error: ${e} msg: ${event.data.msg}`
        });
      }
      break;
    }
    case 'initialize': {
      initialize(event.data.options);
      break;
    }
    case 'stop': {
      kernel.stop();
      break;
    }
  }
};

function packBuffers(buffers?: (ArrayBuffer | ArrayBufferView)[]) {
  if (buffers && buffers.length > 0) {
    return pyodide.toPy(buffers, { depth: 2 });
  }
}

/**
 * A namespace for Kernel statics.
 */
export namespace AsyncKernel {
  /**
   * The instantiation options for an Async kernel.
   */
  export interface IOptions {
    /**
     * The kernel id.
     */
    id: string;

    /**
     * The kernel name.
     */
    name: string;

    /**
     * The location where the kernel started.
     */
    location: string;

    /**
     * The base URL.
     */
    baseUrl: string;

    /**
     * The URL to fetch Pyodide.
     * Plugin configurable.
     */
    pyodideUrl: string;

    /**
     * additional options to provide to `loadPyodide`
     * Plugin configurable.
     * @see https://pyodide.org/en/stable/usage/api/js-api.html#exports.PyodideConfig
     */
    loadPyodideOptions: Record<string, any> & {
      lockFileURL: string;
      packages: string[];
    };

    /**
     * The ID of the browsing context where the request originated.
     */
    browsingContextId: string;

    /**
     * Options passed to the python kernel during instantiation.
     * Plugin configurable.
     */
    kernelOptions: any;

    /**
     * A script to run to load the kernel.
     */
    kernelLoadScript?: string;

    /**
     * A script to run after the kernel has started.
     */
    kernelPostStartScript?: string;
  }
}
