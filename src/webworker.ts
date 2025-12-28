import { DriveFS } from '@jupyterlite/services/lib/contents/drivefs';
import type Pyodide from 'pyodide';

let driveFS: DriveFS;
let pyodide: Pyodide.PyodideAPI;
let kernel: any;
let handleMessage: any;

async function initialize(options: any) {
  const PYODIDE_CDN_URL =
    'https://cdn.jsdelivr.net/pyodide/v0.29.0/full/pyodide.js';
  // @ts-ignore
  importScripts(PYODIDE_CDN_URL);
  pyodide = await await (self as any).loadPyodide();
  await initFilesystem(options);
  await initKernel(options);
  self.postMessage({ ready: true });
}

/**
 * Setup custom Emscripten FileSystem
 */
async function initFilesystem(options: any): Promise<void> {
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
  if (localPath)
    await pyodide.runPythonAsync(`import os\nos.chdir("${localPath}")`);
}

function sender(msg_string: string) {
  self.postMessage({ msg_string });
}

async function initKernel(options: any) {
  await pyodide.loadPackage('micropip');
  const micropip = pyodide.pyimport('micropip');
  await micropip.install('ssl');

  await pyodide.runPythonAsync(
    `
  import micropip
  
  await micropip.install("emfs:./async_kernel-0.10.2.dev3-py3-none-any.whl")
  deps = ["anyio>=4.12",
    "typing_extensions>=4.14",
    "aiologic>=0.16.0",
    "orjson>=3.10.16",
    "comm>=0.2",
    "ipython>=9.0",
    "traitlets>=5.14",
    "matplotlib-inline>0.1",
    "wrapt>=2.0.1"]

  # deps = [dep for dep in importlib.metadata.requires("async-kernel") if "emscripten" not in dep]
  await micropip.install(deps, reinstall=True)
  `
  );
  kernel = pyodide.pyimport('async_kernel').Kernel();
  handleMessage = await kernel.interface.start(
    pyodide.toPy(sender),
    pyodide.toPy(options)
  );
}

self.onmessage = async event => {
  switch (event.data.mode) {
    case 'initialize': {
      initialize(event.data.options);
      break;
    }
    case 'msg': {
      try {
        handleMessage(event.data.msg);
      } catch (error) {
        self.postMessage({ error: error });
      }
      break;
    }
  }
};
