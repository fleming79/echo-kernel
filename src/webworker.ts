import type { ILogPayload } from '@jupyterlab/logconsole';
import type Pyodide from 'pyodide';
import type { CallableKernelInterface } from './tokens';

import { URLExt } from '@jupyterlab/coreutils/lib/url';
import { DriveFS } from '@jupyterlite/services/lib/contents/drivefs';

let driveFS: DriveFS;
let pyodide: Pyodide.PyodideAPI;
let kernelInterface: CallableKernelInterface.IKernelInterface;
let options: CallableKernelInterface.IOptions;

/**
 * Initialize the kernel.
 * @param initOptions Options relating to the kernel.
 */
async function initialize(initOptions: CallableKernelInterface.IOptions) {
  options = initOptions;
  await initRuntime();
  await initFilesystem();
  await startKernelInterface();
  self.postMessage({ mode: 'ready' });
}

/**
 * Send payload to the kernel relay for logging.
 *
 * @param log The payload to log
 */
async function log(log: ILogPayload) {
  self.postMessage({ mode: 'log', log });
}

// -----  Kernel Interface Callbacks -------

/**
 * Send messages for the kernel.
 *
 * @param msgjson A json string
 * @param buffers An array of buffers
 * @param blocking When true will make a blocking stdin request and return the reply message
 * @returns
 */
function send(msgjson: string, buffers: any, blocking = false) {
  const msg = JSON.parse(msgjson);
  if (blocking) {
    // ref: https://github.com/jupyterlite/pyodide-kernel/pull/183 & https://github.com/jupyterlite/jupyterlite/pull/1640/changes
    // This only works in jupyterlite.
    if (msg.channel !== 'stdin') {
      throw new Error('Blocking requests are only accepted for stdin');
    }
    const { baseUrl, browsingContextId } = options;
    const xhr = new XMLHttpRequest();
    const url = URLExt.join(baseUrl, '/api/stdin/kernel'); // stdin only
    xhr.open('POST', url, false); // Synchronous XMLHttpRequest
    const request = JSON.stringify({ browsingContextId, data: msg });
    // Send input request, this blocks until the input reply is received.
    xhr.send(request);
    return xhr.response as string;
  }
  if (buffers) {
    const buffers_ = [];
    for (const buffer of buffers) {
      buffers_.push(buffer.toJs());
      buffer.destroy();
    }
    msg.buffers = buffers_;
    buffers.destroy();
  } else {
    msg.buffers = [];
  }
  self.postMessage({ mode: 'msg', msg });
}

/**
 * A callback for when the kernel has stopped.
 */
function stopped() {
  try {
    pyodide.pyimport('sys').exit(0);
  } catch {
    // sys.exit raises an error.
  }
  self.postMessage({ mode: 'stopped' });
}

// ----- End Kernel Interface Callbacks -------

/**
 * Load pyodide.
 *
 */
async function initRuntime(): Promise<void> {
  const { pyodideUrl } = options;
  let loadPyodide: typeof Pyodide.loadPyodide;

  if (pyodideUrl.endsWith('.mjs')) {
    const pyodideModule: typeof Pyodide = await import(
      /* webpackIgnore: true */ pyodideUrl
    );
    loadPyodide = pyodideModule.loadPyodide;
  } else {
    // @ts-expect-error `pyodideUrl` is a variable.
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
    ...options.loadPyodideOptions
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
    log({ type: 'text', level: 'critical', data: error });
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
  if (localPath) {
    await pyodide.runPythonAsync(`import os\nos.chdir("${localPath}")`);
  }
}

/**
 * Start the kernel interface.
 *
 */
async function startKernelInterface() {
  await pyodide.loadPackage('micropip');
  const micropip = pyodide.pyimport('micropip');
  await micropip.install('ssl');

  const startInterfaceScript =
    options.startInterfaceScript ||
    `
  import micropip
  import pathlib

  deps = [f"emfs:./{p}" for p in pathlib.Path(".").glob("**/*.whl")]
  deps.append("async-kernel")
  await micropip.install(deps, keep_going=True, reinstall=True)
  
  import async_kernel.interface

  async_kernel.interface.start_kernel_callable_interface(send=send, stopped=stopped, settings=settings)
  `;
  const settings = options.kernelSettings || {};
  const namespace = pyodide.toPy({ settings, send, stopped });
  kernelInterface = await pyodide.runPythonAsync(startInterfaceScript, {
    globals: namespace
  });

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
        kernelInterface.handle_msg(JSON.stringify(event.data.msg), buffers);
        if (buffers) {
          for (const buffer of buffers) {
            buffer?.destroy();
          }
        }
      } catch (e) {
        const data = `error: ${e} msg: ${event.data.msg}`;
        log({ type: 'text', level: 'error', data });
      }
      break;
    }
    case 'initialize': {
      initialize(event.data.options);
      break;
    }
    case 'stop': {
      kernelInterface.stop();
      break;
    }
  }
};

function packBuffers(buffers?: (ArrayBuffer | ArrayBufferView)[]) {
  if (buffers && buffers.length > 0) {
    return pyodide.toPy(buffers, { depth: 2 });
  }
}
