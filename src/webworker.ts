import type { ILogPayload } from '@jupyterlab/logconsole';
import type Pyodide from 'pyodide';
import type { CallableKernelInterface } from './token';

import { URLExt } from '@jupyterlab/coreutils/lib/url';
import { DriveFS } from '@jupyterlite/services/lib/contents/drivefs';

let driveFS: DriveFS;
let pyodide: Pyodide.PyodideAPI;
let kernel_interface: any;
let callbacks: any;
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

// -----  Interface functions -------

/**
 * message and posts the message to the KernelRelay.
 *
 * @param msgjson JSON string
 * @param buffers An array of buffers
 * @param blocking Uses standard in to send a message to the
 */
function send(msgjson: string, buffers: any, blocking = false) {
  const msg = JSON.parse(msgjson);
  if (blocking) {
    // ref: https://github.com/jupyterlite/pyodide-kernel/pull/183 & https://github.com/jupyterlite/jupyterlite/pull/1640/changes
    if (msg.channel != 'stdin') {
      throw new Error('Blocking requests are only accepted for stdin');
    }
    const { baseUrl, browsingContextId } = options;
    const xhr = new XMLHttpRequest();
    const url = URLExt.join(baseUrl, `/api/stdin/kernel`); // stdin only
    xhr.open('POST', url, false); // Synchronous XMLHttpRequest
    const request = JSON.stringify({ browsingContextId, data: msg });
    // Send input request, this blocks until the input reply is received.
    xhr.send(request);
    return xhr.response as string;
  }
  if (buffers) {
    const buffers_ = [];
    for (let buffer of buffers) {
      buffers_.push(buffer.toJs());
      buffer.destroy();
    }
    msg.buffers = buffers_;
    buffers.destroy();
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
 * Start the kernel interface calling custom hooks at various stages.
 *
 */
async function startKernelInterface() {
  await pyodide.loadPackage('micropip');
  const micropip = pyodide.pyimport('micropip');
  await micropip.install('ssl');

  const loadScript =
    options.kernelLoadScript ||
    `
  import micropip
  import pathlib

  deps = [f"emfs:./{p}" for p in pathlib.Path(".").glob("**/*.whl")]
  deps.append("async-kernel")
  await micropip.install(deps, keep_going=True, reinstall=True)
  
  from async_kernel.interface.callable import CallableKernelInterface

  CallableKernelInterface(options)
  `;

  // Load the interface
  kernel_interface = await pyodide.runPythonAsync(loadScript, {
    locals: pyodide.toPy({ options: options.kernelOptions || {} })
  });

  // Start the kernel
  callbacks = await kernel_interface.start(
    pyodide.toPy({ send, stopped }, { depth: 2 })
  );

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
        callbacks.handle_msg(JSON.stringify(event.data.msg), buffers);
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
      callbacks.stop();
      break;
    }
  }
};


function packBuffers(buffers?: (ArrayBuffer | ArrayBufferView)[]) {
  if (buffers && buffers.length > 0) {
    return pyodide.toPy(buffers, { depth: 2 });
  }
}
